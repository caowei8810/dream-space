import { resolve } from "node:path";
import type { ObjectStorage } from "@dream-space/storage";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DeterministicMockProvider,
  GenerationOutputPipeline,
  GenerationProcessor,
  type GenerationProvider,
  type GenerationStore,
  type GenerationTaskSnapshot,
} from "../src/generation/generation-processor";

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
    processor: new GenerationProcessor(store, provider, new GenerationOutputPipeline(storage)),
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
    });
    expect(results?.[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(objects.size).toBe(2);
    expect(store.fail).not.toHaveBeenCalled();
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
      resolve(process.cwd(), "../../apps/web/public/inspiration"),
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
