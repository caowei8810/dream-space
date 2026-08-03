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
}

type DatabaseTaskStatus =
  "QUEUED" | "GENERATING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

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
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
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
  idempotencyKey: string;
  queueJobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
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
  | { idempotencyConflict: true }
  | null;

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

@Injectable()
export class GenerationRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

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

  private isSameRequest(task: TaskRecord, input: CreateTaskInput) {
    const references = Array.isArray(task.referenceImageUrls) ? task.referenceImageUrls : [];
    return (
      (input.sessionId === null || task.sessionId === input.sessionId) &&
      task.prompt === input.prompt &&
      task.model === input.model &&
      task.ratio === encodeGenerationRatio(input.ratio) &&
      task.resolution === encodeGenerationResolution(input.resolution) &&
      task.imageCount === input.imageCount &&
      JSON.stringify(references) === JSON.stringify(input.referenceImageUrls)
    );
  }
}
