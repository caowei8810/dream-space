import type { DatabaseClient } from "@dream-space/db";
import { describe, expect, it, vi } from "vitest";
import { PrismaGenerationStore } from "../src/generation/prisma-generation-store";

function createDatabase(task: Record<string, unknown>) {
  const transaction = {
    generationTask: {
      findUnique: vi.fn().mockResolvedValue(task),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    generationTaskEvent: { create: vi.fn().mockResolvedValue({}) },
    generationDeadLetter: { upsert: vi.fn().mockResolvedValue({}) },
    quotaAccount: { update: vi.fn().mockResolvedValue({ available: 100 }) },
    quotaLedgerEntry: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const database = {
    $transaction: vi.fn(async (callback) => callback(transaction)),
  } as unknown as DatabaseClient;
  return { database, transaction };
}

const queuedTask = {
  id: "task-1",
  userId: "user-1",
  sessionId: "session-1",
  status: "QUEUED",
  prompt: "测试提示词",
  model: "image-4.7",
  ratio: "RATIO_1_1",
  resolution: "K2",
  imageCount: 1,
  totalCost: 1,
  attempts: 0,
  lastAttemptKey: null,
  startedAt: null,
};

describe("PrismaGenerationStore retry claims", () => {
  it("records a new attempt and exposes the incremented count", async () => {
    const { database, transaction } = createDatabase(queuedTask);
    const store = new PrismaGenerationStore(database);

    await expect(
      store.start("task-1", { key: "task-1:1", number: 1, maxAttempts: 3 }),
    ).resolves.toMatchObject({ id: "task-1", attempts: 1, status: "generating" });
    expect(transaction.generationTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: { increment: 1 },
          lastAttemptKey: "task-1:1",
        }),
      }),
    );
    expect(transaction.generationTaskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "task.generating" }),
      }),
    );
  });

  it("ignores duplicate delivery of the same attempt key", async () => {
    const { database, transaction } = createDatabase({
      ...queuedTask,
      status: "GENERATING",
      attempts: 1,
      lastAttemptKey: "task-1:1",
    });
    const store = new PrismaGenerationStore(database);

    await expect(
      store.start("task-1", { key: "task-1:1", number: 1, maxAttempts: 3 }),
    ).resolves.toBeNull();
    expect(transaction.generationTask.updateMany).not.toHaveBeenCalled();
  });

  it("atomically settles and dead-letters an exhausted task", async () => {
    const { database, transaction } = createDatabase({
      ...queuedTask,
      status: "GENERATING",
      attempts: 3,
      lastAttemptKey: "task-1:3",
    });
    const store = new PrismaGenerationStore(database);

    await expect(
      store.fail("task-1", "PROVIDER_TEMPORARILY_UNAVAILABLE", "provider unavailable", {
        deadLetter: { attempts: 3, payload: { retryable: true } },
      }),
    ).resolves.toBe("failed");
    expect(transaction.generationDeadLetter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: "task-1" } }),
    );
    expect(transaction.generationTaskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "task.dead_lettered", status: "FAILED" }),
      }),
    );
    expect(transaction.quotaAccount.update).toHaveBeenCalledTimes(1);
  });
});
