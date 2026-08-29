import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const reviewInclude = {
  assignedTo: { select: { id: true, displayName: true } },
} as const;

@Injectable()
export class ModerationRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async listReviews(input: {
    page: number;
    pageSize: number;
    status?: "OPEN" | "CLAIMED" | "APPROVED" | "REJECTED";
  }) {
    const where: Prisma.ModerationReviewWhereInput = input.status ? { status: input.status } : {};
    const [items, total] = await this.database.$transaction([
      this.database.moderationReview.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.moderationReview.count({ where }),
    ]);
    return { items, total };
  }

  async claimReview(id: string, adminId: string, requestId: string) {
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.moderationReview.updateMany({
        where: { id, status: "OPEN", assignedToId: null },
        data: { status: "CLAIMED", assignedToId: adminId, claimedAt: new Date() },
      });
      if (changed.count !== 1) return null;
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: adminId,
          action: "moderation.review.claim",
          resourceType: "ModerationReview",
          resourceId: id,
          reason: "领取人工审核",
          requestId,
          before: { status: "OPEN", assignedToId: null },
          after: { status: "CLAIMED", assignedToId: adminId },
        },
      });
      return transaction.moderationReview.findUnique({ where: { id }, include: reviewInclude });
    });
  }

  async decideReview(
    id: string,
    adminId: string,
    decision: "APPROVED" | "REJECTED",
    note: string,
    requestId: string,
  ) {
    return this.database.$transaction(async (transaction) => {
      const review = await transaction.moderationReview.findFirst({
        where: { id, status: "CLAIMED", assignedToId: adminId },
        include: { task: true, result: true },
      });
      if (!review || !review.task) return null;
      const now = new Date();
      const taskStatus =
        review.stage === "INPUT"
          ? decision === "APPROVED"
            ? "QUEUED"
            : "FAILED"
          : decision === "APPROVED"
            ? "SUCCEEDED"
            : "FAILED";
      const moderationStatus = decision === "APPROVED" ? "APPROVED" : "REJECTED";
      const task = await transaction.generationTask.update({
        where: { id: review.task.id },
        data: {
          status: taskStatus,
          ...(review.stage === "INPUT"
            ? { inputModerationStatus: moderationStatus }
            : { outputModerationStatus: moderationStatus }),
          ...(taskStatus === "FAILED" || taskStatus === "SUCCEEDED" ? { completedAt: now } : {}),
          errorCode:
            taskStatus === "FAILED" ? `MANUAL_${review.stage}_MODERATION_${decision}` : null,
          errorMessage: taskStatus === "FAILED" ? note : null,
        },
      });
      if (review.stage === "OUTPUT") {
        await transaction.generationResult.updateMany({
          where: { taskId: review.task.id, moderationStatus: "PENDING" },
          data: { moderationStatus },
        });
      } else if (review.result) {
        await transaction.generationResult.update({
          where: { id: review.result.id },
          data: { moderationStatus },
        });
      }
      if (taskStatus === "FAILED") {
        const quota = await transaction.quotaAccount.update({
          where: { userId: task.userId },
          data: {
            available: { increment: task.totalCost },
            reserved: { decrement: task.totalCost },
          },
        });
        await transaction.quotaLedgerEntry.upsert({
          where: { idempotencyKey: `manual-release:${task.id}` },
          create: {
            userId: task.userId,
            taskId: task.id,
            type: "RELEASE",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: `manual-release:${task.id}`,
          },
          update: {},
        });
        await this.settlePaidBilling(transaction, task, "release");
      } else if (taskStatus === "SUCCEEDED") {
        const quota = await transaction.quotaAccount.update({
          where: { userId: task.userId },
          data: { reserved: { decrement: task.totalCost } },
        });
        await transaction.quotaLedgerEntry.upsert({
          where: { idempotencyKey: `consume:${task.id}` },
          create: {
            userId: task.userId,
            taskId: task.id,
            type: "CONSUME",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: `consume:${task.id}`,
          },
          update: {},
        });
        await this.settlePaidBilling(transaction, task, "consume");
      }
      await transaction.moderationReview.update({
        where: { id: review.id },
        data: {
          status: decision,
          decision: decision === "APPROVED" ? "approved" : "rejected",
          decisionNote: note,
          decidedAt: now,
        },
      });
      await transaction.generationTaskEvent.create({
        data: {
          taskId: task.id,
          type: `task.manual_${review.stage.toLowerCase()}_${decision.toLowerCase()}`,
          status: taskStatus,
          payload: { reviewId: review.id, decision, adminId },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: adminId,
          action: "moderation.review.decide",
          resourceType: "ModerationReview",
          resourceId: review.id,
          reason: note,
          requestId,
          before: { status: review.status, taskStatus: review.task.status, stage: review.stage },
          after: { status: decision, taskStatus, decision: decision.toLowerCase() },
        },
      });
      return {
        reviewId: review.id,
        taskId: task.id,
        taskStatus: taskStatus.toLowerCase(),
        shouldEnqueue: taskStatus === "QUEUED",
      };
    });
  }

  private async settlePaidBilling(
    transaction: Prisma.TransactionClient,
    task: { id: string; userId: string; cashReservedCents: number; entitlementReserved: number },
    mode: "release" | "consume",
  ) {
    if (task.cashReservedCents > 0) {
      const key = `task-cash-${mode}:${task.id}`;
      const existing = await transaction.cashLedgerEntry.findUnique({
        where: { idempotencyKey: key },
      });
      if (!existing) {
        const changed = await transaction.cashAccount.updateMany({
          where: { userId: task.userId, reserved: { gte: task.cashReservedCents } },
          data:
            mode === "release"
              ? {
                  reserved: { decrement: task.cashReservedCents },
                  available: { increment: task.cashReservedCents },
                }
              : { reserved: { decrement: task.cashReservedCents } },
        });
        if (changed.count !== 1) throw new Error("CASH_SETTLEMENT_STATE_INVALID");
        const account = await transaction.cashAccount.findUniqueOrThrow({
          where: { userId: task.userId },
        });
        await transaction.cashLedgerEntry.create({
          data: {
            userId: task.userId,
            taskId: task.id,
            type: mode === "release" ? "RELEASE" : "CONSUME",
            amount: task.cashReservedCents,
            balanceAfter: account.available,
            idempotencyKey: key,
          },
        });
      }
    }
    if (!transaction.entitlementLedgerEntry) return;
    const entries = await transaction.entitlementLedgerEntry.findMany({
      where: { taskId: task.id, type: "RESERVE" },
    });
    for (const entry of entries) {
      const key = `task-entitlement-${mode}:${task.id}:${entry.entitlementId}`;
      const existing = await transaction.entitlementLedgerEntry.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) continue;
      const changed = await transaction.userEntitlement.updateMany({
        where: { id: entry.entitlementId, reserved: { gte: entry.amount } },
        data:
          mode === "release"
            ? { reserved: { decrement: entry.amount }, available: { increment: entry.amount } }
            : { reserved: { decrement: entry.amount } },
      });
      if (changed.count !== 1) throw new Error("ENTITLEMENT_SETTLEMENT_STATE_INVALID");
      const entitlement = await transaction.userEntitlement.findUniqueOrThrow({
        where: { id: entry.entitlementId },
      });
      await transaction.entitlementLedgerEntry.create({
        data: {
          userId: task.userId,
          entitlementId: entry.entitlementId,
          taskId: task.id,
          type: mode === "release" ? "RELEASE" : "CONSUME",
          amount: entry.amount,
          balanceAfter: entitlement.available,
          idempotencyKey: key,
        },
      });
    }
  }

  async createAppeal(
    userId: string,
    input: { taskId?: string; resultId?: string; reason: string },
  ) {
    return this.database.$transaction(async (transaction) => {
      if (input.taskId) {
        const task = await transaction.generationTask.findFirst({
          where: { id: input.taskId, userId },
          select: { id: true },
        });
        if (!task) return null;
      }
      if (input.resultId) {
        const result = await transaction.generationResult.findFirst({
          where: { id: input.resultId, task: { userId } },
          select: { id: true },
        });
        if (!result) return null;
      }
      return transaction.moderationAppeal.create({
        data: { userId, taskId: input.taskId, resultId: input.resultId, reason: input.reason },
      });
    });
  }

  async reviewResultId(reviewId: string) {
    const review = await this.database.moderationReview.findUnique({
      where: { id: reviewId },
      select: { stage: true, resultId: true },
    });
    return review?.stage === "OUTPUT" ? review.resultId : null;
  }

  listUserAppeals(userId: string) {
    return this.database.moderationAppeal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listAppeals() {
    return this.database.moderationAppeal.findMany({ orderBy: { createdAt: "asc" } });
  }

  async decideAppeal(
    id: string,
    adminId: string,
    decision: "ACCEPTED" | "REJECTED",
    note: string,
    requestId: string,
  ) {
    return this.database.$transaction(async (transaction) => {
      const appeal = await transaction.moderationAppeal.findUnique({
        where: { id },
        include: {
          task: { select: { moderationReviews: { select: { assignedToId: true } } } },
          result: { select: { moderationReviews: { select: { assignedToId: true } } } },
        },
      });
      if (!appeal || appeal.status !== "OPEN") return null;
      const reviews = [
        ...(appeal.task?.moderationReviews ?? []),
        ...(appeal.result?.moderationReviews ?? []),
      ];
      if (reviews.some((review) => review.assignedToId === adminId)) return null;
      const changed = await transaction.moderationAppeal.updateMany({
        where: { id, status: "OPEN" },
        data: { status: decision, decisionNote: note, decidedById: adminId, decidedAt: new Date() },
      });
      if (changed.count !== 1) return null;
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: adminId,
          action: "moderation.appeal.decide",
          resourceType: "ModerationAppeal",
          resourceId: appeal.id,
          reason: note,
          requestId,
          before: { status: appeal.status },
          after: { status: decision },
        },
      });
      return transaction.moderationAppeal.findUnique({ where: { id } });
    });
  }
}
