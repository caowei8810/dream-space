import { resolve } from "node:path";
import type { ObjectStorage } from "@dream-space/storage";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DeterministicMockProvider,
  GenerationOutputPipeline,
  GenerationProcessor,
  GenerationProviderError,
  type GenerationProvider,
  type GenerationStore,
  type GenerationTaskSnapshot,
} from "../src/generation/generation-processor";
import { DeterministicMockContentModerator } from "../src/moderation/content-moderator";

const task: GenerationTaskSnapshot = {
  id: "task-1",
  userId: "user-1",
  sessionId: "session-1",
  status: "generating",
  prompt: "雨后玻璃花房",
  model: "image-4.7",
  ratio: "1:1",
  resolution: "2K",
  imageCount: 1,
  totalCost: 1,
  attempts: 1,
};

let sourceImage: Buffer;

beforeAll(async () => {
  sourceImage = await sharp({
    create: { width: 20, height: 12, channels: 3, background: { r: 20, g: 80, b: 160 } },
  })
    .webp()
    .toBuffer();
});

function createMemoryStorage() {
  const objects = new Map<string, Buffer>();
  const storage: ObjectStorage = {
    put: vi.fn(async (key, data) => void objects.set(key, data)),
    get: vi.fn(async (key) => objects.get(key) ?? Buffer.alloc(0)),
    delete: vi.fn(async (key) => void objects.delete(key)),
    createSignedGetUrl: vi.fn(async () => null),
  };
  return { objects, storage };
}

function createProcessor() {
  const store = {
    start: vi.fn().mockResolvedValue(task),
    recordModeration: vi.fn().mockResolvedValue("recorded"),
    holdForReview: vi.fn().mockResolvedValue("reviewing"),
    succeed: vi.fn().mockResolvedValue("succeeded"),
    fail: vi.fn().mockResolvedValue("failed"),
  } as unknown as GenerationStore;
  const provider = {
    generate: vi
      .fn()
      .mockImplementation(async () => [{ index: 0, data: sourceImage, mimeType: "image/webp" }]),
  } as unknown as GenerationProvider;
  const { objects, storage } = createMemoryStorage();
  return {
    objects,
    processor: new GenerationProcessor(
      store,
      provider,
      new GenerationOutputPipeline(storage),
      new DeterministicMockContentModerator(),
    ),
    provider,
    storage,
    store,
  };
}

describe("GenerationProcessor", () => {
  it("stores normalized originals and thumbnails before committing metadata", async () => {
    const { processor, provider, store, objects } = createProcessor();

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "succeeded",
    });
    expect(provider.generate).toHaveBeenCalledWith(task);
    const results = vi.mocked(store.succeed).mock.calls[0]?.[1];
    expect(results).toHaveLength(1);
    expect(results?.[0]).toMatchObject({
      index: 0,
      width: 2048,
      height: 2048,
      thumbnailWidth: 480,
      thumbnailHeight: 480,
      mimeType: "image/webp",
      moderationStatus: "approved",
    });
    expect(results?.[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(objects.size).toBe(2);
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.recordModeration).toHaveBeenNthCalledWith(1, task.id, "input", {
      status: "approved",
      codes: [],
    });
    expect(store.recordModeration).toHaveBeenNthCalledWith(2, task.id, "output", {
      status: "approved",
      codes: [],
    });
  });

  it("removes stored objects when the database no longer accepts the task", async () => {
    const { processor, store, storage, objects } = createProcessor();
    vi.mocked(store.succeed).mockResolvedValue("ignored");

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "ignored",
    });
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(objects.size).toBe(0);
  });

  it("settles a provider failure through the store", async () => {
    const { processor, provider, store } = createProcessor();
    vi.mocked(provider.generate).mockRejectedValue(new Error("provider unavailable"));

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "failed",
    });
    expect(store.fail).toHaveBeenCalledWith(task.id, "GENERATION_FAILED", expect.any(String));
  });

  it("returns retryable provider failures to BullMQ without settling quota early", async () => {
    const { processor, provider, store } = createProcessor();
    const error = new GenerationProviderError(
      "provider unavailable",
      "PROVIDER_TEMPORARILY_UNAVAILABLE",
      true,
    );
    vi.mocked(provider.generate).mockRejectedValue(error);

    await expect(
      processor.process({ taskId: task.id }, { key: `${task.id}:1`, number: 1, maxAttempts: 3 }),
    ).rejects.toBe(error);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("dead-letters an exhausted retryable provider failure before settling once", async () => {
    const { processor, provider, store } = createProcessor();
    const error = new GenerationProviderError(
      "provider unavailable",
      "PROVIDER_TEMPORARILY_UNAVAILABLE",
      true,
    );
    vi.mocked(provider.generate).mockRejectedValue(error);

    await expect(
      processor.process({ taskId: task.id }, { key: `${task.id}:3`, number: 3, maxAttempts: 3 }),
    ).resolves.toEqual({ taskId: task.id, status: "failed" });
    expect(store.fail).toHaveBeenCalledTimes(1);
    expect(store.fail).toHaveBeenCalledWith(
      task.id,
      "PROVIDER_TEMPORARILY_UNAVAILABLE",
      expect.any(String),
      {
        deadLetter: {
          attempts: 3,
          payload: {
            provider: "mock",
            providerMessage: "provider unavailable",
            retryable: true,
          },
        },
      },
    );
  });

  it("settles a non-retryable provider error immediately without a dead letter", async () => {
    const { processor, provider, store } = createProcessor();
    const error = new GenerationProviderError(
      "provider rejected request",
      "PROVIDER_REQUEST_REJECTED",
      false,
    );
    vi.mocked(provider.generate).mockRejectedValue(error);

    await expect(
      processor.process({ taskId: task.id }, { key: `${task.id}:1`, number: 1, maxAttempts: 3 }),
    ).resolves.toEqual({ taskId: task.id, status: "failed" });
    expect(store.fail).toHaveBeenCalledTimes(1);
    expect(store.fail).toHaveBeenCalledWith(
      task.id,
      "PROVIDER_REQUEST_REJECTED",
      expect.any(String),
    );
  });

  it("rejects marked input before calling the provider and releases quota", async () => {
    const { processor, provider, store } = createProcessor();
    vi.mocked(store.start).mockResolvedValue({
      ...task,
      prompt: "测试提示词 [mock-reject-input]",
    });

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "failed",
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(store.recordModeration).toHaveBeenCalledWith(task.id, "input", {
      status: "rejected",
      codes: ["MOCK_INPUT_REJECTED"],
    });
    expect(store.fail).toHaveBeenCalledWith(
      task.id,
      "INPUT_MODERATION_REJECTED",
      expect.any(String),
    );
  });

  it("holds marked input for manual review without releasing reserved quota", async () => {
    const { processor, provider, store } = createProcessor();
    vi.mocked(store.start).mockResolvedValue({ ...task, prompt: "测试提示词 [mock-review-input]" });

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "reviewing",
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(store.holdForReview).toHaveBeenCalledWith(task.id);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("persists output objects as pending when output moderation requires review", async () => {
    const { processor, provider, store, objects } = createProcessor();
    vi.mocked(provider.generate).mockResolvedValue([
      {
        index: 0,
        data: Buffer.concat([sourceImage, Buffer.from("MOCK_MODERATION_REVIEW_OUTPUT")]),
        mimeType: "image/webp",
      },
    ]);

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "reviewing",
    });
    expect(store.holdForReview).toHaveBeenCalledWith(
      task.id,
      expect.arrayContaining([expect.objectContaining({ moderationStatus: "pending" })]),
    );
    expect(objects.size).toBe(2);
    expect(store.succeed).not.toHaveBeenCalled();
  });

  it("rejects marked output before writing any object", async () => {
    const { processor, provider, store, storage, objects } = createProcessor();
    vi.mocked(provider.generate).mockResolvedValue([
      {
        index: 0,
        data: Buffer.from("MOCK_MODERATION_REJECT_OUTPUT"),
        mimeType: "image/webp",
      },
    ]);

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "failed",
    });
    expect(store.recordModeration).toHaveBeenCalledWith(task.id, "output", {
      status: "rejected",
      codes: ["MOCK_OUTPUT_REJECTED"],
    });
    expect(store.fail).toHaveBeenCalledWith(
      task.id,
      "OUTPUT_MODERATION_REJECTED",
      expect.any(String),
    );
    expect(storage.put).not.toHaveBeenCalled();
    expect(objects.size).toBe(0);
  });

  it("ignores a duplicate job that cannot claim the task", async () => {
    const { processor, provider, store } = createProcessor();
    vi.mocked(store.start).mockResolvedValue(null);

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "ignored",
    });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("keeps mock results in one prompt-matched theme", async () => {
    const provider = new DeterministicMockProvider(
      0,
      resolve(process.cwd(), "../web/public/inspiration"),
    );
    const results = await provider.generate({
      ...task,
      prompt: "真人写真，电影感美女人像",
      imageCount: 8,
    });

    expect(results).toHaveLength(8);
    expect(results.every((result) => result.sourceName?.startsWith("portrait-"))).toBe(true);
    expect(new Set(results.map((result) => result.sourceName)).size).toBe(8);
    expect(results.every((result) => result.data.byteLength > 0)).toBe(true);
  });
});
