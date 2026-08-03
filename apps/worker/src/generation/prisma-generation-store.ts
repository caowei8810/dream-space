import { canTransitionTask } from "@dream-space/core";
import {
  decodeGenerationRatio,
  decodeGenerationResolution,
  type DatabaseClient,
} from "@dream-space/db";
import type {
  GenerationStore,
  GenerationTaskSnapshot,
  MockGenerationResult,
} from "./generation-processor";

export class PrismaGenerationStore implements GenerationStore {
  constructor(private readonly database: DatabaseClient) {}

  async start(taskId: string): Promise<GenerationTaskSnapshot | null> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({ where: { id: taskId } });
      if (!task || task.status !== "QUEUED" || !canTransitionTask("queued", "generating")) {
        return null;
      }
      const changed = await transaction.generationTask.updateMany({
        where: { id: task.id, status: "QUEUED" },
        data: { status: "GENERATING", startedAt: new Date() },
      });
      if (changed.count !== 1) return null;
      await transaction.generationTaskEvent.create({
        data: {
          taskId: task.id,
          type: "task.generating",
          status: "GENERATING",
          payload: {},
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
      };
    });
  }

  async succeed(taskId: string, results: MockGenerationResult[]): Promise<"succeeded" | "ignored"> {
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
          taskId: task.id,
          index: result.index,
          imagePath: result.imagePath,
          width: result.width,
          height: result.height,
          mimeType: result.mimeType,
          byteSize: result.byteSize,
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
