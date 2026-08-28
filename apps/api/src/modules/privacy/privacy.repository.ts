import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const requestInclude = {
  user: { select: { id: true, phone: true, status: true } },
  processedBy: { select: { id: true, displayName: true, employeeNo: true } },
} as const;

export interface PrivacyRepositoryRecord {
  id: string;
  userId: string;
  type: "DELETE" | "EXPORT";
  status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED";
  reason: string;
  requestedAt: Date;
  processedAt: Date | null;
  decisionNote: string | null;
  user: { id: string; phone: string; status: string };
}

@Injectable()
export class PrivacyRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  listOwnRequests(userId: string) {
    return this.database.privacyRequest.findMany({
      where: { userId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: requestInclude,
    });
  }

  findPendingOwnRequest(
    userId: string,
    type: "DELETE" | "EXPORT",
  ): Promise<PrivacyRepositoryRecord | null> {
    return this.database.privacyRequest.findFirst({
      where: { userId, type, status: { in: ["REQUESTED", "PROCESSING"] } },
      orderBy: { requestedAt: "desc" },
      include: requestInclude,
    });
  }

  findRequest(id: string): Promise<PrivacyRepositoryRecord | null> {
    return this.database.privacyRequest.findUnique({ where: { id }, include: requestInclude });
  }

  createRequest(input: {
    userId: string;
    type: "DELETE" | "EXPORT";
    reason: string;
  }): Promise<PrivacyRepositoryRecord> {
    return this.database.privacyRequest.create({
      data: input,
      include: requestInclude,
    });
  }

  list(input: { page: number; pageSize: number }) {
    const where: Prisma.PrivacyRequestWhereInput = {};
    return this.database.$transaction([
      this.database.privacyRequest.findMany({
        where,
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: requestInclude,
      }),
      this.database.privacyRequest.count({ where }),
    ]);
  }

  listDeletedUploads(cutoff: Date) {
    return this.database.referenceUpload.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true, objectKey: true },
      orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
      take: 1000,
    });
  }

  deleteUploadMetadata(id: string, cutoff: Date) {
    return this.database.referenceUpload.deleteMany({
      where: { id, deletedAt: { not: null, lt: cutoff } },
    });
  }

  async recordCleanupAudit(input: {
    actorId: string;
    reason: string;
    requestId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }): Promise<void> {
    await this.database.adminAuditLog.create({
      data: {
        actorAdminUserId: input.actorId,
        action: "privacy.retention.cleanup",
        resourceType: "ReferenceUpload",
        resourceId: "batch",
        reason: input.reason,
        before: input.before as Prisma.InputJsonValue,
        after: input.after as Prisma.InputJsonValue,
        requestId: input.requestId,
      },
    });
  }

  async completeDelete(input: {
    requestId: string;
    actorId: string;
    reason: string;
    decisionNote?: string | null;
    auditRequestId?: string;
  }): Promise<PrivacyRepositoryRecord> {
    return this.database.$transaction(async (transaction) => {
      const request = await transaction.privacyRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: { user: true },
      });
      if (request.type !== "DELETE") throw new Error("privacy request type mismatch");
      if (request.status === "COMPLETED") return request;
      const now = new Date();
      const anonymizedPhone = `deleted_${request.userId}_${now.getTime()}`.slice(0, 32);
      const user = await transaction.user.update({
        where: { id: request.userId },
        data: {
          phone: anonymizedPhone,
          status: "DELETED",
          statusReason: input.reason,
          statusChangedAt: now,
        },
      });
      await transaction.userSession.deleteMany({ where: { userId: request.userId } });
      await transaction.verificationCode.deleteMany({ where: { phone: request.user.phone } });
      await transaction.referenceUpload.updateMany({
        where: { userId: request.userId, deletedAt: null },
        data: { deletedAt: now },
      });
      const updated = await transaction.privacyRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          processedAt: now,
          processedById: input.actorId,
          decisionNote: input.decisionNote ?? null,
        },
        include: requestInclude,
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "privacy.delete.complete",
          resourceType: "PrivacyRequest",
          resourceId: request.id,
          reason: input.reason,
          before: { status: request.status, phone: request.user.phone },
          after: { status: updated.status, phone: user.phone, anonymized: true },
          requestId: input.auditRequestId || request.id,
        },
      });
      return updated;
    });
  }

  async completeExport(input: {
    requestId: string;
    actorId: string;
    reason: string;
    decisionNote?: string | null;
    auditRequestId?: string;
  }): Promise<PrivacyRepositoryRecord> {
    return this.database.$transaction(async (transaction) => {
      const request = await transaction.privacyRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: requestInclude,
      });
      if (request.type !== "EXPORT") throw new Error("privacy request type mismatch");
      if (request.status === "COMPLETED") return request;
      const updated = await transaction.privacyRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          processedById: input.actorId,
          decisionNote: input.decisionNote ?? null,
        },
        include: requestInclude,
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "privacy.export.complete",
          resourceType: "PrivacyRequest",
          resourceId: request.id,
          reason: input.reason,
          before: { status: request.status },
          after: { status: updated.status },
          requestId: input.auditRequestId || request.id,
        },
      });
      return updated;
    });
  }

  async getCompletedExport(userId: string, requestId: string) {
    const request = await this.database.privacyRequest.findFirst({
      where: { id: requestId, userId, type: "EXPORT", status: "COMPLETED" },
    });
    if (!request) return null;
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        agreementAcceptances: {
          select: {
            version: true,
            termsAccepted: true,
            privacyAccepted: true,
            aiTermsAccepted: true,
            acceptedAt: true,
          },
        },
        generationSessions: { select: { id: true, createdAt: true, updatedAt: true, title: true } },
        generationTasks: {
          select: {
            id: true,
            sessionId: true,
            status: true,
            prompt: true,
            model: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        referenceUploads: {
          where: { deletedAt: null },
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            createdAt: true,
          },
        },
        orders: {
          select: {
            id: true,
            status: true,
            amountCents: true,
            refundedCents: true,
            createdAt: true,
            paidAt: true,
          },
        },
        quotaAccount: { select: { total: true, available: true, reserved: true, updatedAt: true } },
        cashAccount: { select: { available: true, reserved: true, updatedAt: true } },
        quotaLedgerEntries: {
          select: { type: true, amount: true, balanceAfter: true, createdAt: true },
        },
        cashLedgerEntries: {
          select: { type: true, amount: true, balanceAfter: true, createdAt: true },
        },
        entitlements: {
          select: {
            id: true,
            available: true,
            reserved: true,
            expiresAt: true,
            status: true,
            createdAt: true,
          },
        },
        riskHits: {
          select: {
            subjectType: true,
            action: true,
            status: true,
            decision: true,
            createdAt: true,
          },
        },
        appeals: {
          select: {
            id: true,
            reason: true,
            status: true,
            decisionNote: true,
            createdAt: true,
            decidedAt: true,
          },
        },
        privacyRequests: {
          select: {
            id: true,
            type: true,
            status: true,
            reason: true,
            requestedAt: true,
            processedAt: true,
          },
        },
      },
    });
    return { exportedAt: new Date().toISOString(), requestId, user };
  }
}
