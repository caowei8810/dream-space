import { canTransitionTask } from "@dream-space/core";
import {
  decodeGenerationRatio,
  decodeGenerationResolution,
  type DatabaseClient,
} from "@dream-space/db";
import type {
  GenerationAttempt,
  GenerationStore,
  GenerationTaskSnapshot,
  StoredGenerationResult,
} from "./generation-processor";
import type { ModerationDecision, ModerationStage } from "../moderation/content-moderator";

export class PrismaGenerationStore implements GenerationStore {
  constructor(private readonly database: DatabaseClient) {}

  async start(taskId: string, attempt: GenerationAttempt): Promise<GenerationTaskSnapshot | null> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({ where: { id: taskId } });
      if (!task || !canTransitionTask("queued", "generating")) {
        return null;
      }
      if (task.lastAttemptKey === attempt.key) return null;
      if (task.status !== "QUEUED" && task.status !== "GENERATING") return null;
      const changed = await transaction.generationTask.updateMany({
        where: {
          id: task.id,
          status: { in: ["QUEUED", "GENERATING"] },
          OR: [{ lastAttemptKey: null }, { lastAttemptKey: { not: attempt.key } }],
        },
        data: {
          status: "GENERATING",
          attempts: { increment: 1 },
          lastAttemptKey: attempt.key,
          startedAt: task.startedAt ?? new Date(),
        },
      });
      if (changed.count !== 1) return null;
      await transaction.generationTaskEvent.create({
        data: {
          taskId: task.id,
          type: task.status === "QUEUED" ? "task.generating" : "task.retrying",
          status: "GENERATING",
          payload: { attempt: attempt.number, maxAttempts: attempt.maxAttempts },
        },
      });
      return {
        id: task.id,
        userId: task.userId,
        sessionId: task.sessionId,
        status: "generating" as const,
        prompt: task.prompt,
        model: task.model,
        ratio: decodeGenerationRatio(task.ratio),
        resolution: decodeGenerationResolution(task.resolution),
        imageCount: task.imageCount,
        totalCost: task.totalCost,
        attempts: task.attempts + 1,
      };
    });
  }

  async recordModeration(
    taskId: string,
    stage: ModerationStage,
    decision: ModerationDecision,
  ): Promise<"recorded" | "ignored"> {
    return this.database.$transaction(async (transaction) => {
      const status = decision.status.toUpperCase() as "APPROVED" | "REJECTED";
      const changed = await transaction.generationTask.updateMany({
        where: { id: taskId, status: "GENERATING" },
        data:
          stage === "input"
            ? { inputModerationStatus: status }
            : { outputModerationStatus: status },
      });
      if (changed.count !== 1) return "ignored";
      await transaction.generationTaskEvent.create({
        data: {
          taskId,
          type: `task.${stage}.moderated`,
          status: "GENERATING",
          payload: { decision: decision.status, codes: decision.codes },
        },
      });
      return "recorded";
    });
  }

  async succeed(
    taskId: string,
    results: StoredGenerationResult[],
  ): Promise<"succeeded" | "ignored"> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({ where: { id: taskId } });
      if (!task || task.status !== "GENERATING" || !canTransitionTask("generating", "succeeded")) {
        return "ignored";
      }
      const changed = await transaction.generationTask.updateMany({
        where: { id: task.id, status: "GENERATING" },
        data: { status: "SUCCEEDED", completedAt: new Date(), errorCode: null, errorMessage: null },
      });
      if (changed.count !== 1) return "ignored";

      await transaction.generationResult.createMany({
        data: results.map((result) => ({
          id: result.id,
          taskId: task.id,
          index: result.index,
          imagePath: result.imagePath,
          objectKey: result.objectKey,
          thumbnailObjectKey: result.thumbnailObjectKey,
          checksumSha256: result.checksumSha256,
          width: result.width,
          height: result.height,
          mimeType: result.mimeType,
          byteSize: result.byteSize,
          thumbnailWidth: result.thumbnailWidth,
          thumbnailHeight: result.thumbnailHeight,
          thumbnailByteSize: result.thumbnailByteSize,
          moderationStatus: "APPROVED",
          isAiGenerated: true,
        })),
        skipDuplicates: true,
      });
      const quota = await transaction.quotaAccount.update({
        where: { userId: task.userId },
        data: { reserved: { decrement: task.totalCost } },
      });
      await Promise.all([
        transaction.quotaLedgerEntry.upsert({
          where: { idempotencyKey: "consume:" + task.id },
          create: {
            userId: task.userId,
            taskId: task.id,
            type: "CONSUME",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: "consume:" + task.id,
          },
          update: {},
        }),
        transaction.generationTaskEvent.create({
          data: {
            taskId: task.id,
            type: "task.succeeded",
            status: "SUCCEEDED",
            payload: { resultCount: results.length },
          },
        }),
        transaction.generationSession.update({
          where: { id: task.sessionId },
          data: { updatedAt: new Date() },
        }),
      ]);
      return "succeeded";
    });
  }

  async fail(
    taskId: string,
    errorCode: string,
    errorMessage: string,
    options?: {
      deadLetter: {
        attempts: number;
        payload: Record<string, string | number | boolean | null>;
      };
    },
  ): Promise<"failed" | "ignored"> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({ where: { id: taskId } });
      if (
        !task ||
        (task.status !== "GENERATING" && task.status !== "QUEUED") ||
        !canTransitionTask(task.status.toLowerCase() as "queued" | "generating", "failed")
      ) {
        return "ignored";
      }
      const changed = await transaction.generationTask.updateMany({
        where: { id: task.id, status: task.status },
        data: { status: "FAILED", errorCode, errorMessage, completedAt: new Date() },
      });
      if (changed.count !== 1) return "ignored";
      const quota = await transaction.quotaAccount.update({
        where: { userId: task.userId },
        data: {
          available: { increment: task.totalCost },
          reserved: { decrement: task.totalCost },
        },
      });
      if (options?.deadLetter) {
        await transaction.generationDeadLetter.upsert({
          where: { taskId },
          create: {
            taskId,
            errorCode,
            errorMessage,
            attempts: options.deadLetter.attempts,
            payload: options.deadLetter.payload,
          },
          update: {
            errorCode,
            errorMessage,
            attempts: options.deadLetter.attempts,
            payload: options.deadLetter.payload,
          },
        });
        await transaction.generationTaskEvent.create({
          data: {
            taskId,
            type: "task.dead_lettered",
            status: "FAILED",
            payload: { errorCode, attempts: options.deadLetter.attempts },
          },
        });
      }
      await Promise.all([
        transaction.quotaLedgerEntry.upsert({
          where: { idempotencyKey: "failure-release:" + task.id },
          create: {
            userId: task.userId,
            taskId: task.id,
            type: "RELEASE",
            amount: task.totalCost,
            balanceAfter: quota.available,
            idempotencyKey: "failure-release:" + task.id,
          },
          update: {},
        }),
        transaction.generationTaskEvent.create({
          data: { taskId: task.id, type: "task.failed", status: "FAILED", payload: { errorCode } },
        }),
      ]);
      return "failed";
    });
  }
}
