import type { UserStatus } from "@dream-space/contracts";
import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface AdminUserQuery {
  query?: string;
  status?: UserStatus;
  page: number;
  pageSize: number;
}

export interface AdminUserDatabaseRecord {
  id: string;
  phone: string;
  status: string;
  statusReason: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { sessions: number; generationTasks: number; referenceUploads: number };
}

const databaseStatus = {
  active: "ACTIVE",
  restricted: "RESTRICTED",
  banned: "BANNED",
} as const;

const includeCounts = (now: Date) =>
  ({
    _count: {
      select: {
        sessions: { where: { expiresAt: { gt: now } } },
        generationTasks: true,
        referenceUploads: true,
      },
    },
  }) as const;

@Injectable()
export class AdminUsersRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: databaseStatus[input.status] } : {}),
      ...(input.query
        ? { phone: { contains: input.query.replace(/\*/g, ""), mode: "insensitive" } }
        : {}),
    };
    const now = new Date();
    const [items, total] = await this.database.$transaction([
      this.database.user.findMany({
        where,
        include: includeCounts(now),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.user.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<AdminUserDatabaseRecord | null> {
    return this.database.user.findUnique({ where: { id }, include: includeCounts(new Date()) });
  }

  async changeStatus(input: {
    id: string;
    status: "ACTIVE" | "RESTRICTED" | "BANNED";
    reason: string;
    actorId: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.user.findUniqueOrThrow({ where: { id: input.id } });
      const user = await transaction.user.update({
        where: { id: input.id },
        data: {
          status: input.status,
          statusReason: input.reason,
          statusChangedAt: new Date(),
        },
        include: includeCounts(new Date()),
      });
      if (input.status === "BANNED") {
        await transaction.userSession.deleteMany({ where: { userId: input.id } });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: `user.status.${input.status.toLowerCase()}`,
          resourceType: "User",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          before: { status: before.status, statusReason: before.statusReason },
          after: { status: user.status, statusReason: user.statusReason },
        },
      });
      return user;
    });
  }

  async revokeSessions(input: { id: string; reason: string; actorId: string; requestId: string }) {
    return this.database.$transaction(async (transaction) => {
      const removed = await transaction.userSession.deleteMany({ where: { userId: input.id } });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "user-session.revoke-all",
          resourceType: "User",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { revokedSessionCount: removed.count },
        },
      });
      return removed.count;
    });
  }
}
