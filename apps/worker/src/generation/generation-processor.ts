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
  prompt: string;
  model: string;
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

const mockImagePools = {
  portrait: Array.from(
    { length: 12 },
    (_, index) => `/inspiration/portrait-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  photography: Array.from(
    { length: 10 },
    (_, index) => `/inspiration/photography-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  anime: Array.from(
    { length: 8 },
    (_, index) => `/inspiration/anime-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  illustration: Array.from(
    { length: 11 },
    (_, index) => `/inspiration/illustration-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  design: Array.from(
    { length: 11 },
    (_, index) => `/inspiration/design-${String(index + 1).padStart(2, "0")}.webp`,
  ),
} as const;

type MockImageTheme = keyof typeof mockImagePools;

const themeKeywords: Array<[MockImageTheme, string[]]> = [
  [
    "portrait",
    [
      "人像",
      "写真",
      "美女",
      "美人",
      "少女",
      "男性",
      "女性",
      "模特",
      "portrait",
      "woman",
      "man",
      "girl",
      "boy",
      "face",
    ],
  ],
  ["anime", ["动漫", "二次元", "卡通", "漫画", "anime", "manga", "cartoon"]],
  ["illustration", ["插画", "绘本", "水彩", "illustration", "watercolor"]],
  [
    "design",
    [
      "海报",
      "品牌",
      "产品",
      "标志",
      "包装",
      "排版",
      "设计",
      "poster",
      "brand",
      "product",
      "logo",
      "typography",
    ],
  ],
  [
    "photography",
    [
      "风景",
      "山",
      "湖",
      "海",
      "城市",
      "建筑",
      "街道",
      "摄影",
      "landscape",
      "mountain",
      "lake",
      "ocean",
      "city",
      "architecture",
      "photo",
    ],
  ],
];

export function resolveMockImageTheme(prompt: string): MockImageTheme {
  const normalized = prompt.toLowerCase();
  return (
    themeKeywords.find(([, keywords]) =>
      keywords.some((keyword) => normalized.includes(keyword)),
    )?.[0] ?? "photography"
  );
}

function stableOffset(value: string, length: number) {
  const hash = Array.from(value).reduce(
    (current, character) => (current * 31 + character.codePointAt(0)!) >>> 0,
    0,
  );
  return hash % length;
}

export class DeterministicMockProvider implements GenerationProvider {
  constructor(private readonly delayMs: number) {}

  async generate(task: GenerationTaskSnapshot) {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const dimensions = resolveOutputDimensions(task.ratio, task.resolution);
    const resultImages = mockImagePools[resolveMockImageTheme(task.prompt)];
    const offset = stableOffset(`${task.prompt}:${task.model}`, resultImages.length);
    return Array.from({ length: task.imageCount }, (_, index) => ({
      index,
      imagePath: resultImages[(offset + index) % resultImages.length] ?? resultImages[0],
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
