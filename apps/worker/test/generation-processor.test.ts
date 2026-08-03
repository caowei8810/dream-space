import { describe, expect, it, vi } from "vitest";
import {
  DeterministicMockProvider,
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

function createProcessor() {
  const store = {
    start: vi.fn().mockResolvedValue(task),
    succeed: vi.fn().mockResolvedValue("succeeded"),
    fail: vi.fn().mockResolvedValue("failed"),
  } as unknown as GenerationStore;
  const provider = {
    generate: vi.fn().mockResolvedValue([
      {
        index: 0,
        imagePath: "/inspiration/design-01.webp",
        width: 2048,
        height: 2048,
        mimeType: "image/webp",
        byteSize: 524_288,
      },
    ]),
  } as unknown as GenerationProvider;
  return { processor: new GenerationProcessor(store, provider), provider, store };
}

describe("GenerationProcessor", () => {
  it("persists deterministic results after a claimed task", async () => {
    const { processor, provider, store } = createProcessor();

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "succeeded",
    });
    expect(provider.generate).toHaveBeenCalledWith(task);
    expect(store.succeed).toHaveBeenCalledWith(
      task.id,
      expect.arrayContaining([expect.any(Object)]),
    );
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("settles a provider failure through the store", async () => {
    const { processor, provider, store } = createProcessor();
    vi.mocked(provider.generate).mockRejectedValue(new Error("provider unavailable"));

    await expect(processor.process({ taskId: task.id })).resolves.toEqual({
      taskId: task.id,
      status: "failed",
    });
    expect(store.fail).toHaveBeenCalledWith(task.id, "MOCK_GENERATION_FAILED", expect.any(String));
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
    const provider = new DeterministicMockProvider(0);
    const results = await provider.generate({
      ...task,
      prompt: "真人写真，电影感美女人像",
      imageCount: 8,
    });

    expect(results).toHaveLength(8);
    expect(results.every((result) => result.imagePath.includes("/portrait-"))).toBe(true);
    expect(new Set(results.map((result) => result.imagePath)).size).toBe(8);
  });
});
