import type { CreateGenerationTaskRequest, GenerationSessionDraft } from "@dream-space/contracts";
import {
  encodeGenerationRatio,
  encodeGenerationResolution,
  type DatabaseClient,
  type DatabaseGenerationRatio,
  type DatabaseGenerationResolution,
  type Prisma,
} from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const initialQuota = 100;
const taskInclude = { results: { orderBy: { index: "asc" as const } } } as const;
const sessionInclude = {
  tasks: { include: taskInclude, orderBy: { createdAt: "asc" as const } },
} as const;

interface CreateTaskInput extends CreateGenerationTaskRequest {
  userId: string;
  sessionTitle: string;
  unitCost: number;
  totalCost: number;
  billingRuleVersion?: number | null;
  billingPromotionCode?: string | null;
  billingUnitCents?: number | null;
  billingTotalCents?: number | null;
  entitlementReserved?: number;
  cashReservedCents?: number;
  modelConfigVersionId?: string | null;
  modelConfigSnapshot?: Prisma.InputJsonValue | null;
}

type DatabaseTaskStatus =
  | "QUEUED"
  | "GENERATING"
  | "REVIEWING"
  | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

interface QuotaRecord {
  userId: string;
  total: number;
  available: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ResultRecord {
  id: string;
  taskId: string;
  index: number;
  imagePath: string;
  objectKey: string | null;
  thumbnailObjectKey: string | null;
  checksumSha256: string | null;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  thumbnailByteSize: number | null;
  moderationStatus: string;
  isAiGenerated: boolean;
  createdAt: Date;
}

interface TaskRecord {
  id: string;
  sessionId: string;
  userId: string;
  status: DatabaseTaskStatus;
  prompt: string;
  model: string;
  ratio: DatabaseGenerationRatio;
  resolution: DatabaseGenerationResolution;
  imageCount: number;
  referenceImageUrls: unknown;
  unitCost: number;
  totalCost: number;
  billingRuleVersion?: number | null;
  billingPromotionCode?: string | null;
  billingUnitCents?: number | null;
  billingTotalCents?: number | null;
  entitlementReserved?: number;
  cashReservedCents?: number;
  attempts: number;
  idempotencyKey: string;
  queueJobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputModerationStatus: string;
  outputModerationStatus: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  results: ResultRecord[];
}

interface SessionRecord {
  id: string;
  userId: string;
  title: string;
  draft: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionListRecord extends SessionRecord {
  tasks: TaskRecord[];
}

interface SessionDetailRecord extends SessionRecord {
  tasks: TaskRecord[];
}

interface TaskEventRecord {
  id: bigint;
  taskId: string;
  type: string;
  status: DatabaseTaskStatus;
  payload: unknown;
  createdAt: Date;
}

type CreateTaskResult =
  | { task: TaskRecord; session: SessionRecord; quota: QuotaRecord; replayed: boolean }
  | { insufficientQuota: number }
  | { insufficientBilling: true }
  | { idempotencyConflict: true }
  | null;

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

@Injectable()
export class GenerationRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  findOwnedResult(userId: string, resultId: string): Promise<ResultRecord | null> {
    return this.database.generationResult.findFirst({
      where: { id: resultId, task: { userId } },
    });
  }

  findResult(resultId: string): Promise<ResultRecord | null> {
    return this.database.generationResult.findUnique({ where: { id: resultId } });
  }

  async createTask(
    input: CreateTaskInput,
    retryInitializationRace = true,
  ): Promise<CreateTaskResult> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await transaction.generationTask.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: taskInclude,
        });
        if (replay) {
          if (!this.isSameRequest(replay, input)) return { idempotencyConflict: true } as const;
          const [session, quota] = await Promise.all([
            transaction.generationSession.findUniqueOrThrow({ where: { id: replay.sessionId } }),
            this.ensureQuota(transaction, input.userId),
          ]);
          return { task: replay, session, quota, replayed: true };
        }

        const existingSession = input.sessionId
          ? await transaction.generationSession.findFirst({
              where: { id: input.sessionId, userId: input.userId },
            })
          : null;
        if (input.sessionId && !existingSession) return null;

        const paidAllocation = await this.reservePaidBilling(transaction, input);
        if (paidAllocation.status === "insufficient") return { insufficientBilling: true } as const;
        await this.ensureQuota(transaction, input.userId);
        const reserved = await transaction.quotaAccount.updateMany({
          where: { userId: input.userId, available: { gte: input.totalCost } },
          data: {
            available: { decrement: input.totalCost },
            reserved: { increment: input.totalCost },
          },
        });
        if (reserved.count !== 1) {
          const quota = await transaction.quotaAccount.findUniqueOrThrow({
            where: { userId: input.userId },
          });
          return { insufficientQuota: quota.available } as const;
        }

        const session =
          existingSession ??
          (await transaction.generationSession.create({
            data: { userId: input.userId, title: input.sessionTitle },
          }));
        const quota = await transaction.quotaAccount.findUniqueOrThrow({
          where: { userId: input.userId },
        });
        const task = await transaction.generationTask.create({
          data: {
            userId: input.userId,
            sessionId: session.id,
            status: "QUEUED",
            prompt: input.prompt,
            model: input.model,
            ratio: encodeGenerationRatio(input.ratio),
            resolution: encodeGenerationResolution(input.resolution),
            imageCount: input.imageCount,
            referenceImageUrls: input.referenceImageUrls,
            unitCost: input.unitCost,
            totalCost: input.totalCost,
            billingRuleVersion: input.billingRuleVersion ?? null,
            billingPromotionCode: input.billingPromotionCode ?? null,
            billingUnitCents: input.billingUnitCents ?? null,
            billingTotalCents: input.billingTotalCents ?? null,
            entitlementReserved: paidAllocation.entitlementReserved,
            cashReservedCents: paidAllocation.cashReservedCents,
            modelConfigVersionId: input.modelConfigVersionId ?? null,
            modelConfigSnapshot: input.modelConfigSnapshot ?? undefined,
            idempotencyKey: input.idempotencyKey,
            events: {
              create: { type: "task.queued", status: "QUEUED", payload: {} },
            },
            quotaLedgerEntries: {
              create: {
                userId: input.userId,
                type: "RESERVE",
                amount: input.totalCost,
                balanceAfter: quota.available,
                idempotencyKey: `reserve:${input.userId}:${input.idempotencyKey}`,
              },
            },
          },
          include: taskInclude,
        });
        return { task, session, quota, replayed: false };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const task = await this.database.generationTask.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: taskInclude,
      });
      if (!task) {
        if (retryInitializationRace) return this.createTask(input, false);
        throw error;
      }
      if (!this.isSameRequest(task, input)) return { idempotencyConflict: true } as const;
      const [session, quota] = await Promise.all([
        this.database.generationSession.findUniqueOrThrow({ where: { id: task.sessionId } }),
        this.getQuota(input.userId),
      ]);
      return { task, session, quota, replayed: true };
    }
  }

  async setQueueJobId(taskId: string, queueJobId: string): Promise<void> {
    await this.database.generationTask.update({ where: { id: taskId }, data: { queueJobId } });
  }

  async failQueuedTask(taskId: string, errorMessage: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({ where: { id: taskId } });
      if (!task || task.status !== "QUEUED") return;
      const changed = await transaction.generationTask.updateMany({
        where: { id: task.id, status: "QUEUED" },
        data: {
          status: "FAILED",
          errorCode: "QUEUE_UNAVAILABLE",
          errorMessage,
          completedAt: new Date(),
        },
      });
      if (changed.count !== 1) return;
      const quota = await transaction.quotaAccount.update({
        where: { userId: task.userId },
        data: {
          available: { increment: task.totalCost },
          reserved: { decrement: task.totalCost },
        },
      });
      await this.settlePaidBilling(transaction, task, "release");
      await Promise.all([
        transaction.quotaLedgerEntry.create({
          data: {
            userId: task.userId,
            taskId: task.id,
            type: "RELEASE",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: `queue-release:${task.id}`,
          },
        }),
        transaction.generationTaskEvent.create({
          data: { taskId: task.id, type: "task.failed", status: "FAILED", payload: {} },
        }),
      ]);
    });
  }

  listSessions(userId: string): Promise<SessionListRecord[]> {
    return this.database.generationSession.findMany({
      where: { userId },
      include: {
        tasks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { results: { orderBy: { index: "asc" }, take: 1 } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  findSession(userId: string, sessionId: string): Promise<SessionDetailRecord | null> {
    return this.database.generationSession.findFirst({
      where: { id: sessionId, userId },
      include: sessionInclude,
    });
  }

  async renameSession(
    userId: string,
    sessionId: string,
    title: string,
  ): Promise<SessionDetailRecord | null> {
    const changed = await this.database.generationSession.updateMany({
      where: { id: sessionId, userId },
      data: { title },
    });
    return changed.count === 1 ? this.findSession(userId, sessionId) : null;
  }

  async updateSessionDraft(
    userId: string,
    sessionId: string,
    draft: GenerationSessionDraft,
  ): Promise<SessionDetailRecord | null> {
    const changed = await this.database.generationSession.updateMany({
      where: { id: sessionId, userId },
      data: { draft: draft as unknown as Prisma.InputJsonValue },
    });
    return changed.count === 1 ? this.findSession(userId, sessionId) : null;
  }

  async deleteSession(
    userId: string,
    sessionId: string,
  ): Promise<"missing" | "active" | "deleted"> {
    const session = await this.database.generationSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        tasks: { where: { status: { in: ["QUEUED", "GENERATING"] } }, select: { id: true } },
      },
    });
    if (!session) return "missing" as const;
    if (session.tasks.length > 0) return "active" as const;
    await this.database.generationSession.delete({ where: { id: session.id } });
    return "deleted" as const;
  }

  findTask(userId: string, taskId: string): Promise<TaskRecord | null> {
    return this.database.generationTask.findFirst({
      where: { id: taskId, userId },
      include: taskInclude,
    });
  }

  async cancelTask(userId: string, taskId: string): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findFirst({
        where: { id: taskId, userId },
        include: taskInclude,
      });
      if (!task) return null;
      if (task.status !== "QUEUED" && task.status !== "GENERATING") return task;

      const changed = await transaction.generationTask.updateMany({
        where: { id: task.id, status: { in: ["QUEUED", "GENERATING"] } },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      if (changed.count !== 1) {
        return transaction.generationTask.findUniqueOrThrow({
          where: { id: task.id },
          include: taskInclude,
        });
      }
      const quota = await transaction.quotaAccount.update({
        where: { userId },
        data: {
          available: { increment: task.totalCost },
          reserved: { decrement: task.totalCost },
        },
      });
      await this.settlePaidBilling(transaction, task, "release");
      await Promise.all([
        transaction.quotaLedgerEntry.create({
          data: {
            userId,
            taskId: task.id,
            type: "RELEASE",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: `cancel-release:${task.id}`,
          },
        }),
        transaction.generationTaskEvent.create({
          data: { taskId: task.id, type: "task.cancelled", status: "CANCELLED", payload: {} },
        }),
      ]);
      return transaction.generationTask.findUniqueOrThrow({
        where: { id: task.id },
        include: taskInclude,
      });
    });
  }

  async getQuota(userId: string): Promise<QuotaRecord> {
    try {
      return await this.database.$transaction((transaction) =>
        this.ensureQuota(transaction, userId),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.database.$transaction((transaction) => this.ensureQuota(transaction, userId));
    }
  }

  listEvents(taskId: string, afterId: bigint): Promise<TaskEventRecord[]> {
    return this.database.generationTaskEvent.findMany({
      where: { taskId, id: { gt: afterId } },
      orderBy: { id: "asc" },
      take: 100,
    });
  }

  private async ensureQuota(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<QuotaRecord> {
    const quota = await transaction.quotaAccount.upsert({
      where: { userId },
      create: { userId, total: initialQuota, available: initialQuota, reserved: 0 },
      update: {},
    });
    await transaction.quotaLedgerEntry.upsert({
      where: { idempotencyKey: `initial-grant:${userId}` },
      create: {
        userId,
        type: "GRANT",
        amount: initialQuota,
        balanceAfter: initialQuota,
        idempotencyKey: `initial-grant:${userId}`,
      },
      update: {},
    });
    return quota;
  }

  private async reservePaidBilling(transaction: Prisma.TransactionClient, input: CreateTaskInput) {
    if (
      process.env.EXTERNAL_SERVICES_MODE !== "live" ||
      input.billingTotalCents == null ||
      input.billingUnitCents == null
    ) {
      return { status: "skipped" as const, entitlementReserved: 0, cashReservedCents: 0 };
    }
    const candidates = await transaction.userEntitlement.findMany({
      where: {
        userId: input.userId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        available: { gt: 0 },
      },
      orderBy: { expiresAt: "asc" },
    });
    const total = candidates.reduce((sum, item) => sum + item.available, 0);
    const entitlementCount = Math.min(total, input.imageCount);
    const cashAmount = (input.imageCount - entitlementCount) * input.billingUnitCents;
    const account = await transaction.cashAccount.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
    });
    if (entitlementCount < input.imageCount && account.available < cashAmount)
      return { status: "insufficient" as const };
    let remaining = entitlementCount;
    for (const entitlement of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, entitlement.available);
      const changed = await transaction.userEntitlement.updateMany({
        where: { id: entitlement.id, status: "ACTIVE", available: { gte: take } },
        data: { available: { decrement: take }, reserved: { increment: take } },
      });
      if (changed.count !== 1) throw new Error("BILLING_RESERVATION_RACE");
      const next = await transaction.userEntitlement.findUniqueOrThrow({
        where: { id: entitlement.id },
      });
      await transaction.entitlementLedgerEntry.create({
        data: {
          userId: input.userId,
          entitlementId: entitlement.id,
          type: "RESERVE",
          amount: take,
          balanceAfter: next.available,
          idempotencyKey: `task-entitlement-reserve:${input.userId}:${input.idempotencyKey}:${entitlement.id}`,
        },
      });
      remaining -= take;
    }
    if (cashAmount > 0) {
      const changed = await transaction.cashAccount.updateMany({
        where: { userId: input.userId, available: { gte: cashAmount } },
        data: { available: { decrement: cashAmount }, reserved: { increment: cashAmount } },
      });
      if (changed.count !== 1) throw new Error("BILLING_RESERVATION_RACE");
      const next = await transaction.cashAccount.findUniqueOrThrow({
        where: { userId: input.userId },
      });
      await transaction.cashLedgerEntry.create({
        data: {
          userId: input.userId,
          type: "RESERVE",
          amount: cashAmount,
          balanceAfter: next.available,
          idempotencyKey: `task-cash-reserve:${input.userId}:${input.idempotencyKey}`,
        },
      });
    }
    return {
      status: "reserved" as const,
      entitlementReserved: entitlementCount,
      cashReservedCents: cashAmount,
    };
  }

  private async settlePaidBilling(
    transaction: Prisma.TransactionClient,
    task: { id: string; userId: string; cashReservedCents: number; entitlementReserved: number },
    mode: "release" | "consume",
  ) {
    if (task.cashReservedCents > 0) {
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
      await transaction.cashLedgerEntry.upsert({
        where: { idempotencyKey: `task-cash-${mode}:${task.id}` },
        create: {
          userId: task.userId,
          taskId: task.id,
          type: mode === "release" ? "RELEASE" : "CONSUME",
          amount: task.cashReservedCents,
          balanceAfter: account.available,
          idempotencyKey: `task-cash-${mode}:${task.id}`,
        },
        update: {},
      });
    }
    const entries = await transaction.entitlementLedgerEntry.findMany({
      where: { taskId: task.id, type: "RESERVE" },
    });
    for (const entry of entries) {
      const changed = await transaction.userEntitlement.updateMany({
        where: { id: entry.entitlementId, reserved: { gte: entry.amount } },
        data:
          mode === "release"
            ? { reserved: { decrement: entry.amount }, available: { increment: entry.amount } }
            : { reserved: { decrement: entry.amount } },
      });
      if (changed.count !== 1) throw new Error("ENTITLEMENT_SETTLEMENT_STATE_INVALID");
      const next = await transaction.userEntitlement.findUniqueOrThrow({
        where: { id: entry.entitlementId },
      });
      await transaction.entitlementLedgerEntry.upsert({
        where: { idempotencyKey: `task-entitlement-${mode}:${task.id}:${entry.entitlementId}` },
        create: {
          userId: task.userId,
          entitlementId: entry.entitlementId,
          taskId: task.id,
          type: mode === "release" ? "RELEASE" : "CONSUME",
          amount: entry.amount,
          balanceAfter: next.available,
          idempotencyKey: `task-entitlement-${mode}:${task.id}:${entry.entitlementId}`,
        },
        update: {},
      });
    }
  }

  private isSameRequest(task: TaskRecord, input: CreateTaskInput) {
    const references = Array.isArray(task.referenceImageUrls) ? task.referenceImageUrls : [];
    return (
      (input.sessionId === null || task.sessionId === input.sessionId) &&
      task.prompt === input.prompt &&
      task.model === input.model &&
      task.ratio === encodeGenerationRatio(input.ratio) &&
      task.resolution === encodeGenerationResolution(input.resolution) &&
      task.imageCount === input.imageCount &&
      (task.billingPromotionCode ?? null) === (input.promotionCode ?? null) &&
      JSON.stringify(references) === JSON.stringify(input.referenceImageUrls)
    );
  }
}
