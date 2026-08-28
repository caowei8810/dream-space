import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GenerationQueueJob,
  GenerationRatio,
  GenerationResolution,
} from "@dream-space/contracts";
import { canTransitionTask, resolveOutputDimensions } from "@dream-space/core";
import type { ObjectStorage } from "@dream-space/storage";
import sharp from "sharp";
import type {
  ContentModerator,
  ModerationDecision,
  ModerationStage,
} from "../moderation/content-moderator";

export interface GenerationTaskSnapshot {
  id: string;
  userId: string;
  sessionId: string;
  status: "generating";
  prompt: string;
  model: string;
  modelConfigSnapshot?: Record<string, unknown> | null;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  referenceImageUrls?: string[];
  totalCost: number;
  entitlementReserved?: number;
  cashReservedCents?: number;
  attempts: number;
}

export interface GenerationAttempt {
  key: string;
  number: number;
  maxAttempts: number;
}

export interface ProviderImage {
  index: number;
  data: Buffer;
  mimeType: string;
  sourceName?: string;
}

export interface StoredGenerationResult {
  id: string;
  index: number;
  imagePath: string;
  objectKey: string;
  thumbnailObjectKey: string;
  checksumSha256: string;
  width: number;
  height: number;
  mimeType: "image/webp";
  byteSize: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailByteSize: number;
  moderationStatus: "approved" | "pending";
}

export interface GenerationStore {
  start(taskId: string, attempt: GenerationAttempt): Promise<GenerationTaskSnapshot | null>;
  recordModeration(
    taskId: string,
    stage: ModerationStage,
    decision: ModerationDecision,
  ): Promise<"recorded" | "ignored">;
  holdForReview(
    taskId: string,
    results?: StoredGenerationResult[],
  ): Promise<"reviewing" | "ignored">;
  succeed(taskId: string, results: StoredGenerationResult[]): Promise<"succeeded" | "ignored">;
  fail(
    taskId: string,
    errorCode: string,
    errorMessage: string,
    options?: {
      deadLetter: {
        attempts: number;
        payload: Record<string, string | number | boolean | null>;
      };
    },
  ): Promise<"failed" | "ignored">;
}

export interface GenerationProvider {
  generate(task: GenerationTaskSnapshot): Promise<ProviderImage[]>;
}

export class GenerationProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GenerationProviderError";
  }
}

export function isRetryableProviderError(error: unknown): error is GenerationProviderError {
  return error instanceof GenerationProviderError && error.retryable;
}

export function isGenerationProviderError(error: unknown): error is GenerationProviderError {
  return error instanceof GenerationProviderError;
}

const mockImagePools = {
  portrait: Array.from(
    { length: 12 },
    (_, index) => `portrait-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  photography: Array.from(
    { length: 10 },
    (_, index) => `photography-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  anime: Array.from(
    { length: 8 },
    (_, index) => `anime-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  illustration: Array.from(
    { length: 11 },
    (_, index) => `illustration-${String(index + 1).padStart(2, "0")}.webp`,
  ),
  design: Array.from(
    { length: 11 },
    (_, index) => `design-${String(index + 1).padStart(2, "0")}.webp`,
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
  constructor(
    private readonly delayMs: number,
    private readonly assetRoot: string,
  ) {}

  async generate(task: GenerationTaskSnapshot) {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (task.prompt.includes("[mock-retry-once]") && task.attempts === 1) {
      throw new GenerationProviderError(
        "mock provider transient failure",
        "PROVIDER_TEMPORARILY_UNAVAILABLE",
        true,
      );
    }
    if (task.prompt.includes("[mock-always-retryable-error]")) {
      throw new GenerationProviderError(
        "mock provider persistent failure",
        "PROVIDER_TEMPORARILY_UNAVAILABLE",
        true,
      );
    }
    const resultImages = mockImagePools[resolveMockImageTheme(task.prompt)];
    const offset = stableOffset(`${task.prompt}:${task.model}`, resultImages.length);
    return Promise.all(
      Array.from({ length: task.imageCount }, async (_, index) => {
        const sourceName = resultImages[(offset + index) % resultImages.length]!;
        return {
          index,
          data: await readFile(join(this.assetRoot, sourceName)),
          mimeType: "image/webp",
          sourceName,
        };
      }),
    );
  }
}

export class GenerationOutputPipeline {
  constructor(private readonly storage: ObjectStorage) {}

  async persist(
    task: GenerationTaskSnapshot,
    images: ProviderImage[],
    moderationStatus: "approved" | "pending" = "approved",
  ) {
    if (images.length !== task.imageCount) {
      throw new Error(`provider returned ${images.length} images for requested ${task.imageCount}`);
    }
    const stored: StoredGenerationResult[] = [];
    try {
      for (const image of images) stored.push(await this.persistOne(task, image, moderationStatus));
      return stored;
    } catch (error) {
      await this.cleanup(stored);
      throw error;
    }
  }

  async cleanup(results: StoredGenerationResult[]) {
    await Promise.allSettled(
      results.flatMap((result) => [
        this.storage.delete(result.thumbnailObjectKey),
        this.storage.delete(result.objectKey),
      ]),
    );
  }

  private async persistOne(
    task: GenerationTaskSnapshot,
    image: ProviderImage,
    moderationStatus: "approved" | "pending",
  ) {
    const { width, height } = resolveOutputDimensions(task.ratio, task.resolution);
    const resultId = randomUUID();
    const objectKey = `results/${task.id}/${resultId}.webp`;
    const thumbnailObjectKey = `thumbnails/${task.id}/${resultId}.webp`;
    const output = await sharp(image.data, { failOn: "warning" })
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(output.data)
      .resize({ width: Math.min(480, width), withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    await this.storage.put(objectKey, output.data, "image/webp");
    try {
      await this.storage.put(thumbnailObjectKey, thumbnail.data, "image/webp");
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }

    return {
      id: resultId,
      index: image.index,
      imagePath: `/generation/results/${resultId}/content`,
      objectKey,
      thumbnailObjectKey,
      checksumSha256: createHash("sha256").update(output.data).digest("hex"),
      width: output.info.width,
      height: output.info.height,
      mimeType: "image/webp" as const,
      byteSize: output.data.byteLength,
      thumbnailWidth: thumbnail.info.width,
      thumbnailHeight: thumbnail.info.height,
      thumbnailByteSize: thumbnail.data.byteLength,
      moderationStatus,
    };
  }
}

export class GenerationProcessor {
  constructor(
    private readonly store: GenerationStore,
    private readonly provider: GenerationProvider,
    private readonly output: GenerationOutputPipeline,
    private readonly moderator: ContentModerator,
  ) {}

  async process(
    job: GenerationQueueJob,
    attempt: GenerationAttempt = {
      key: `${job.taskId}:1`,
      number: 1,
      maxAttempts: 1,
    },
  ) {
    const task = await this.store.start(job.taskId, attempt);
    if (!task) return { taskId: job.taskId, status: "ignored" as const };
    if (!canTransitionTask("generating", "succeeded")) {
      throw new Error("任务状态机未允许生成完成");
    }

    let stored: StoredGenerationResult[] = [];
    try {
      const inputDecision = await this.moderator.moderateInput(task);
      await this.store.recordModeration(task.id, "input", inputDecision);
      if (inputDecision.status === "review") {
        return { taskId: task.id, status: await this.store.holdForReview(task.id) };
      }
      if (inputDecision.status === "rejected") {
        return {
          taskId: task.id,
          status: await this.store.fail(
            task.id,
            "INPUT_MODERATION_REJECTED",
            "提示词或参考内容未通过审核，请修改后重试",
          ),
        };
      }

      const images = await this.provider.generate(task);
      const outputDecisions = await Promise.all(
        images.map((image) => this.moderator.moderateOutput(task, image)),
      );
      const rejectedOutput = outputDecisions.find((decision) => decision.status === "rejected");
      const outputDecision: ModerationDecision = rejectedOutput ??
        outputDecisions.find((decision) => decision.status === "review") ?? {
          status: "approved",
          codes: [],
        };
      await this.store.recordModeration(task.id, "output", outputDecision);
      if (outputDecision.status === "review") {
        stored = await this.output.persist(task, images, "pending");
        const status = await this.store.holdForReview(task.id, stored);
        if (status === "ignored") await this.output.cleanup(stored);
        return { taskId: task.id, status };
      }
      if (rejectedOutput) {
        return {
          taskId: task.id,
          status: await this.store.fail(
            task.id,
            "OUTPUT_MODERATION_REJECTED",
            "生成结果未通过审核，额度已返还，请调整提示词后重试",
          ),
        };
      }

      stored = await this.output.persist(task, images);
      const status = await this.store.succeed(task.id, stored);
      if (status === "ignored") await this.output.cleanup(stored);
      return { taskId: task.id, status };
    } catch (error) {
      await this.output.cleanup(stored);
      if (isRetryableProviderError(error) && attempt.number < attempt.maxAttempts) {
        throw error;
      }
      const providerError = isGenerationProviderError(error) ? error : null;
      const status = providerError?.retryable
        ? await this.store.fail(
            task.id,
            providerError.code,
            "图片生成多次失败，额度已返还，请稍后重试",
            {
              deadLetter: {
                attempts: attempt.number,
                payload: {
                  provider:
                    typeof task.modelConfigSnapshot?.providerCode === "string"
                      ? task.modelConfigSnapshot.providerCode
                      : "mock",
                  retryable: true,
                  providerMessage: providerError.message,
                },
              },
            },
          )
        : providerError
          ? await this.store.fail(
              task.id,
              providerError.code,
              "模型服务无法处理当前请求，额度已返还，请调整参数后重试",
            )
          : await this.store.fail(
              task.id,
              "GENERATION_FAILED",
              "图片生成失败，额度已返还，请重新提交",
            );
      return { taskId: task.id, status };
    }
  }
}
