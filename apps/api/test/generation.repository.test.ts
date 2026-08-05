import type { DatabaseClient } from "@dream-space/db";
import { describe, expect, it, vi } from "vitest";
import { GenerationRepository } from "../src/modules/generation/generation.repository";

describe("GenerationRepository idempotency", () => {
  it("retries quota initialization after a concurrent unique-key race", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const quota = {
      userId: "user-1",
      total: 100,
      available: 100,
      reserved: 0,
      createdAt: now,
      updatedAt: now,
    };
    const transaction = {
      quotaAccount: { upsert: vi.fn().mockResolvedValue(quota) },
      quotaLedgerEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce({ code: "P2002" })
        .mockImplementationOnce(async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
        ),
    } as unknown as DatabaseClient;
    const repository = new GenerationRepository(database);

    await expect(repository.getQuota("user-1")).resolves.toEqual(quota);
    expect(database.$transaction).toHaveBeenCalledTimes(2);
  });

  it("returns the committed task when a concurrent insert loses the unique-key race", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const quota = {
      userId: "user-1",
      total: 100,
      available: 99,
      reserved: 1,
      createdAt: now,
      updatedAt: now,
    };
    const session = {
      id: "session-1",
      userId: "user-1",
      title: "并发幂等任务",
      draft: null,
      createdAt: now,
      updatedAt: now,
    };
    const task = {
      id: "task-1",
      sessionId: session.id,
      userId: "user-1",
      status: "QUEUED",
      prompt: "并发幂等任务",
      model: "image-4.7",
      ratio: "RATIO_1_1",
      resolution: "K2",
      imageCount: 1,
      referenceImageUrls: [],
      unitCost: 1,
      totalCost: 1,
      idempotencyKey: "concurrent-key",
      queueJobId: null,
      errorCode: null,
      errorMessage: null,
      inputModerationStatus: "PENDING",
      outputModerationStatus: "PENDING",
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      results: [],
    };
    const transaction = {
      quotaAccount: { upsert: vi.fn().mockResolvedValue(quota) },
      quotaLedgerEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce({ code: "P2002" })
        .mockImplementationOnce(async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      generationTask: { findUnique: vi.fn().mockResolvedValue(task) },
      generationSession: { findUniqueOrThrow: vi.fn().mockResolvedValue(session) },
    } as unknown as DatabaseClient;
    const repository = new GenerationRepository(database);

    await expect(
      repository.createTask({
        userId: "user-1",
        sessionTitle: session.title,
        idempotencyKey: task.idempotencyKey,
        sessionId: null,
        prompt: task.prompt,
        model: task.model,
        ratio: "1:1",
        resolution: "2K",
        imageCount: 1,
        referenceImageUrls: [],
        unitCost: 1,
        totalCost: 1,
      }),
    ).resolves.toEqual({ task, session, quota, replayed: true });
  });

  it("rejects a reused idempotency key when the request payload differs", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const task = {
      id: "task-1",
      sessionId: "session-1",
      userId: "user-1",
      status: "QUEUED",
      prompt: "原提示词",
      model: "image-4.7",
      ratio: "RATIO_1_1",
      resolution: "K2",
      imageCount: 1,
      referenceImageUrls: [],
      unitCost: 1,
      totalCost: 1,
      idempotencyKey: "same-key-123",
      queueJobId: "task-1",
      errorCode: null,
      errorMessage: null,
      inputModerationStatus: "PENDING",
      outputModerationStatus: "PENDING",
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      results: [],
    };
    const transaction = {
      generationTask: { findUnique: vi.fn().mockResolvedValue(task) },
    };
    const database = {
      $transaction: vi.fn().mockImplementation(async (callback) => callback(transaction)),
    } as unknown as DatabaseClient;
    const repository = new GenerationRepository(database);

    await expect(
      repository.createTask({
        userId: "user-1",
        sessionTitle: "新提示词",
        idempotencyKey: task.idempotencyKey,
        sessionId: null,
        prompt: "新提示词",
        model: task.model,
        ratio: "1:1",
        resolution: "2K",
        imageCount: 1,
        referenceImageUrls: [],
        unitCost: 1,
        totalCost: 1,
      }),
    ).resolves.toEqual({ idempotencyConflict: true });
  });

  it("does not create an empty session when quota reservation fails", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const quota = {
      userId: "user-1",
      total: 100,
      available: 0,
      reserved: 0,
      createdAt: now,
      updatedAt: now,
    };
    const transaction = {
      generationTask: { findUnique: vi.fn().mockResolvedValue(null) },
      generationSession: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      quotaAccount: {
        upsert: vi.fn().mockResolvedValue(quota),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(quota),
      },
      quotaLedgerEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      $transaction: vi.fn().mockImplementation(async (callback) => callback(transaction)),
    } as unknown as DatabaseClient;
    const repository = new GenerationRepository(database);

    await expect(
      repository.createTask({
        userId: "user-1",
        sessionTitle: "额度不足",
        idempotencyKey: "quota-key-123",
        sessionId: null,
        prompt: "额度不足",
        model: "image-4.7",
        ratio: "1:1",
        resolution: "4K",
        imageCount: 1,
        referenceImageUrls: [],
        unitCost: 2,
        totalCost: 2,
      }),
    ).resolves.toEqual({ insufficientQuota: 0 });
    expect(transaction.generationSession.create).not.toHaveBeenCalled();
  });
});
