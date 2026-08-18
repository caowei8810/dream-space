import type { CreateGenerationTaskRequest } from "@dream-space/contracts";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { GenerationQueue } from "../src/modules/generation/generation.queue";
import type { GenerationRepository } from "../src/modules/generation/generation.repository";
import { GenerationService } from "../src/modules/generation/generation.service";
import type { UploadsService } from "../src/modules/uploads/uploads.service";
import type { RiskService } from "../src/modules/risk/risk.service";

const input: CreateGenerationTaskRequest = {
  idempotencyKey: "request-12345678",
  sessionId: null,
  prompt: "雨后的玻璃花房，柔和自然光",
  model: "image-4.7",
  ratio: "1:1",
  resolution: "2K",
  imageCount: 2,
  referenceImageUrls: [],
};

const session = {
  id: "session-1",
  userId: "user-1",
  title: "雨后的玻璃花房，柔和自然光",
  draft: null,
  createdAt: new Date("2026-08-03T00:00:00.000Z"),
  updatedAt: new Date("2026-08-03T00:00:00.000Z"),
};

const task = {
  id: "task-1",
  sessionId: session.id,
  userId: "user-1",
  status: "QUEUED" as const,
  prompt: input.prompt,
  model: input.model,
  ratio: "RATIO_1_1" as const,
  resolution: "K2" as const,
  imageCount: input.imageCount,
  referenceImageUrls: [],
  unitCost: 1,
  totalCost: 2,
  attempts: 0,
  idempotencyKey: input.idempotencyKey,
  queueJobId: null,
  errorCode: null,
  errorMessage: null,
  inputModerationStatus: "PENDING" as const,
  outputModerationStatus: "PENDING" as const,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-08-03T00:00:00.000Z"),
  updatedAt: new Date("2026-08-03T00:00:00.000Z"),
  results: [],
};

const quota = {
  userId: "user-1",
  total: 100,
  available: 98,
  reserved: 2,
  createdAt: new Date("2026-08-03T00:00:00.000Z"),
  updatedAt: new Date("2026-08-03T00:00:00.000Z"),
};

function createService() {
  const repository = {
    createTask: vi.fn().mockResolvedValue({ task, session, quota, replayed: false }),
    setQueueJobId: vi.fn().mockResolvedValue(undefined),
    failQueuedTask: vi.fn().mockResolvedValue(undefined),
    getQuota: vi.fn().mockResolvedValue(quota),
    listSessions: vi.fn().mockResolvedValue([]),
    findSession: vi.fn().mockResolvedValue(null),
    renameSession: vi.fn().mockResolvedValue(null),
    updateSessionDraft: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn().mockResolvedValue("missing"),
    findTask: vi.fn().mockResolvedValue(task),
    cancelTask: vi.fn().mockResolvedValue(task),
    listEvents: vi.fn().mockResolvedValue([]),
  } as unknown as GenerationRepository;
  const queue = {
    enqueue: vi.fn().mockResolvedValue(task.id),
  } as unknown as GenerationQueue;
  const uploads = {
    assertOwnedReferenceUrls: vi.fn().mockResolvedValue(undefined),
  } as unknown as UploadsService;
  const risk = { inspectPrompt: vi.fn().mockResolvedValue(undefined) } as unknown as RiskService;
  return { queue, repository, uploads, risk, service: new GenerationService(repository, queue, uploads, risk) };
}

describe("GenerationService", () => {
  it("creates one task, reserves quota and enqueues by task id", async () => {
    const { queue, repository, service } = createService();

    const result = await service.createTask("user-1", input);

    expect(result.task.status).toBe("queued");
    expect(result.quota).toEqual({
      total: 100,
      available: 98,
      reserved: 2,
      used: 0,
      remainingPercent: 98,
    });
    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ totalCost: 2, unitCost: 1, userId: "user-1" }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(task.id);
    expect(repository.setQueueJobId).toHaveBeenCalledWith(task.id, task.id);
  });

  it("returns API-driven generation options", () => {
    const { service } = createService();

    expect(service.getOptions()).toMatchObject({
      externalServicesMode: "mock",
      imageCount: { min: 1, max: 8 },
      costPerImage: { "2K": 1, "4K": 2 },
    });
  });

  it("checks reference ownership before reserving quota", async () => {
    const { repository, uploads, service } = createService();
    const withReference = {
      ...input,
      referenceImageUrls: ["http://localhost:4000/uploads/references/upload-1/content"],
    };

    await service.createTask("user-1", withReference);

    expect(uploads.assertOwnedReferenceUrls).toHaveBeenCalledWith(
      "user-1",
      withReference.referenceImageUrls,
    );
    expect(repository.createTask).toHaveBeenCalled();
  });

  it("does not enqueue an already persisted idempotent request twice", async () => {
    const { queue, repository, service } = createService();
    vi.mocked(repository.createTask).mockResolvedValue({
      task: { ...task, queueJobId: task.id },
      session,
      quota,
      replayed: true,
    });

    const result = await service.createTask("user-1", input);

    expect(result.replayed).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("marks the task failed and releases quota when enqueueing is unavailable", async () => {
    const { queue, repository, service } = createService();
    vi.mocked(queue.enqueue).mockRejectedValue(new Error("redis unavailable"));

    await expect(service.createTask("user-1", input)).rejects.toMatchObject({ status: 503 });
    expect(repository.failQueuedTask).toHaveBeenCalledWith(task.id, expect.any(String));
    expect(repository.setQueueJobId).not.toHaveBeenCalled();
  });

  it("keeps an already enqueued task active when persisting the queue job id fails", async () => {
    const { queue, repository, service } = createService();
    vi.mocked(repository.setQueueJobId).mockRejectedValue(new Error("database unavailable"));

    await expect(service.createTask("user-1", input)).resolves.toMatchObject({
      task: { status: "queued" },
    });
    expect(queue.enqueue).toHaveBeenCalledWith(task.id);
    expect(repository.failQueuedTask).not.toHaveBeenCalled();
  });

  it("returns 409 when an idempotency key is reused with a different payload", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.createTask).mockResolvedValue({ idempotencyConflict: true });

    await expect(service.createTask("user-1", input)).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns actionable validation and insufficient quota errors", async () => {
    const { repository, service } = createService();

    await expect(service.createTask("user-1", { ...input, imageCount: 9 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    vi.mocked(repository.createTask).mockResolvedValue({ insufficientQuota: 1 });
    await expect(
      service.createTask("user-1", { ...input, resolution: "4K" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "INSUFFICIENT_QUOTA",
        required: 4,
        available: 1,
      }),
    });
  });

  it("validates and persists a user-owned session draft", async () => {
    const { repository, service } = createService();
    const draft = {
      prompt: "尚未提交的会话草稿",
      model: "image-4.7",
      ratio: "1:1" as const,
      resolution: "2K" as const,
      imageCount: 2,
      referenceImageUrls: ["/inspiration/design-01.webp"],
    };
    vi.mocked(repository.updateSessionDraft).mockResolvedValue({ ...session, draft, tasks: [] });
    vi.mocked(repository.findSession).mockResolvedValue({ ...session, draft, tasks: [] });

    await expect(service.updateSessionDraft("user-1", session.id, draft)).resolves.toMatchObject({
      id: session.id,
      draft,
    });
    expect(repository.updateSessionDraft).toHaveBeenCalledWith("user-1", session.id, draft);
    await expect(
      service.updateSessionDraft("user-1", session.id, { ...draft, imageCount: 9 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("replays only events newer than Last-Event-ID and completes on terminal state", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.findTask).mockResolvedValue({
      ...task,
      status: "SUCCEEDED",
      completedAt: new Date("2026-08-03T00:00:01.000Z"),
    });
    vi.mocked(repository.listEvents)
      .mockResolvedValueOnce([
        {
          id: 6n,
          taskId: task.id,
          type: "task.succeeded",
          status: "SUCCEEDED",
          payload: {},
          createdAt: new Date("2026-08-03T00:00:01.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    const stream = await service.streamTaskEvents("user-1", task.id, "5");
    const events = await lastValueFrom(stream.pipe(toArray()));

    expect(repository.listEvents).toHaveBeenNthCalledWith(1, task.id, 5n);
    expect(repository.listEvents).toHaveBeenNthCalledWith(2, task.id, 6n);
    expect(events).toEqual([
      expect.objectContaining({
        id: "6",
        type: "task.succeeded",
        data: expect.objectContaining({ status: "succeeded" }),
      }),
    ]);
  });

  it("replays moderation events without converting the SSE stream to an error", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.findTask).mockResolvedValue({
      ...task,
      status: "SUCCEEDED",
      completedAt: new Date("2026-08-03T00:00:01.000Z"),
    });
    vi.mocked(repository.listEvents)
      .mockResolvedValueOnce([
        {
          id: 6n,
          taskId: task.id,
          type: "task.input.moderated",
          status: "GENERATING",
          payload: { decision: "approved", codes: [] },
          createdAt: new Date("2026-08-03T00:00:00.500Z"),
        },
        {
          id: 7n,
          taskId: task.id,
          type: "task.output.moderated",
          status: "GENERATING",
          payload: { decision: "approved", codes: [] },
          createdAt: new Date("2026-08-03T00:00:00.700Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    const stream = await service.streamTaskEvents("user-1", task.id, "5");
    const events = await lastValueFrom(stream.pipe(toArray()));

    expect(events).toEqual([
      expect.objectContaining({ id: "6", type: "task.input.moderated" }),
      expect.objectContaining({ id: "7", type: "task.output.moderated" }),
    ]);
  });
});
