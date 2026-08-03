import type {
  GenerationQueueJob,
  GenerationRatio,
  GenerationResolution,
} from "@dream-space/contracts";
import { canTransitionTask, resolveOutputDimensions } from "@dream-space/core";

export interface GenerationTaskSnapshot {
  id: string;
  userId: string;
  sessionId: string;
  status: "generating";
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  totalCost: number;
}

export interface MockGenerationResult {
  index: number;
  imagePath: string;
  width: number;
  height: number;
  mimeType: "image/webp";
  byteSize: number;
}

export interface GenerationStore {
  start(taskId: string): Promise<GenerationTaskSnapshot | null>;
  succeed(taskId: string, results: MockGenerationResult[]): Promise<"succeeded" | "ignored">;
  fail(taskId: string, errorCode: string, errorMessage: string): Promise<"failed" | "ignored">;
}

export interface GenerationProvider {
  generate(task: GenerationTaskSnapshot): Promise<MockGenerationResult[]>;
}

const resultImages = [
  "/inspiration/design-01.webp",
  "/inspiration/photography-03.webp",
  "/inspiration/illustration-05.webp",
  "/inspiration/anime-02.webp",
] as const;

export class DeterministicMockProvider implements GenerationProvider {
  constructor(private readonly delayMs: number) {}

  async generate(task: GenerationTaskSnapshot) {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const dimensions = resolveOutputDimensions(task.ratio, task.resolution);
    return Array.from({ length: task.imageCount }, (_, index) => ({
      index,
      imagePath: resultImages[index % resultImages.length] ?? resultImages[0],
      ...dimensions,
      mimeType: "image/webp" as const,
      byteSize: task.resolution === "4K" ? 1_048_576 : 524_288,
    }));
  }
}

export class GenerationProcessor {
  constructor(
    private readonly store: GenerationStore,
    private readonly provider: GenerationProvider,
  ) {}

  async process(job: GenerationQueueJob) {
    const task = await this.store.start(job.taskId);
    if (!task) return { taskId: job.taskId, status: "ignored" as const };
    if (!canTransitionTask("generating", "succeeded")) {
      throw new Error("任务状态机未允许生成完成");
    }

    try {
      const results = await this.provider.generate(task);
      const status = await this.store.succeed(task.id, results);
      return { taskId: task.id, status };
    } catch {
      const status = await this.store.fail(
        task.id,
        "MOCK_GENERATION_FAILED",
        "图片生成失败，额度已返还，请重新提交",
      );
      return { taskId: task.id, status };
    }
  }
}
