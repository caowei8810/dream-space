import {
  generationEventTypes,
  generationRatios,
  generationResolutions,
  type CreateGenerationTaskRequest,
  type CreateGenerationTaskResponse,
  type GenerationEventType,
  type GenerationOptionsResponse,
  type GenerationSessionDraft,
  type GenerationSessionDetail,
  type GenerationSessionSummary,
  type GenerationTaskEventData,
  type GenerationTaskResponse,
  type GenerationTaskStatus,
  type QuotaResponse,
  type UpdateGenerationSessionDraftRequest,
} from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import {
  calculateGenerationCost,
  createGenerationSessionTitle,
  InsufficientQuotaError,
  isTerminalTaskStatus,
} from "@dream-space/core";
import {
  decodeGenerationRatio,
  decodeGenerationResolution,
  type DatabaseGenerationRatio,
  type DatabaseGenerationResolution,
} from "@dream-space/db";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type MessageEvent,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { GenerationQueue } from "./generation.queue";
import { GenerationRepository } from "./generation.repository";
import { UploadsService } from "../uploads/uploads.service";

const allowedReferenceUrl = /^(https?:\/\/|\/)/;

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly env = parseApiEnv(process.env);

  constructor(
    @Inject(GenerationRepository) private readonly repository: GenerationRepository,
    @Inject(GenerationQueue) private readonly queue: GenerationQueue,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async createTask(
    userId: string,
    rawInput: CreateGenerationTaskRequest,
  ): Promise<CreateGenerationTaskResponse> {
    const input = this.validateCreateInput(rawInput);
    await this.uploads.assertOwnedReferenceUrls(userId, input.referenceImageUrls);
    const unitCost = calculateGenerationCost(1, input.resolution);
    const totalCost = calculateGenerationCost(input.imageCount, input.resolution);
    const result = await this.repository.createTask({
      ...input,
      userId,
      unitCost,
      totalCost,
      sessionTitle: createGenerationSessionTitle(input.prompt),
    });
    if (!result) throw new NotFoundException("生成会话不存在");
    if ("idempotencyConflict" in result) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "幂等键已用于不同的生成请求",
      });
    }
    if ("insufficientQuota" in result) {
      const available = result.insufficientQuota;
      if (typeof available !== "number") throw new Error("额度账户状态无效");
      throw new BadRequestException({
        code: "INSUFFICIENT_QUOTA",
        message: new InsufficientQuotaError(totalCost, available).message,
        required: totalCost,
        available,
      });
    }

    if (result.task.status === "QUEUED" && !result.task.queueJobId) {
      let queueJobId: string;
      try {
        queueJobId = await this.queue.enqueue(result.task.id);
      } catch {
        await this.repository.failQueuedTask(
          result.task.id,
          "生成服务暂时不可用，额度已返还，请稍后重试",
        );
        throw new ServiceUnavailableException("生成服务暂时不可用，请稍后重试");
      }
      try {
        await this.repository.setQueueJobId(result.task.id, queueJobId);
      } catch {
        this.logger.warn(`任务 ${result.task.id} 已入队，但 queueJobId 回写失败`);
      }
    }

    return {
      session: this.mapSessionSummary(result.session),
      task: this.mapTask(result.task),
      quota: this.mapQuota(result.quota),
      replayed: result.replayed,
    };
  }

  async getQuota(userId: string) {
    return this.mapQuota(await this.repository.getQuota(userId));
  }

  getOptions(): GenerationOptionsResponse {
    return {
      models: [
        { id: "image-4.7", labelZh: "通用模型", labelEn: "General model" },
        { id: "image-realistic", labelZh: "写实模型", labelEn: "Realistic model" },
        { id: "image-anime", labelZh: "动漫模型", labelEn: "Anime model" },
      ],
      ratios: generationRatios,
      resolutions: generationResolutions,
      imageCount: { min: 1, max: 8 },
      referenceImages: {
        max: 4,
        maxBytes: 10 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      costPerImage: { "2K": 1, "4K": 2 },
      externalServicesMode: this.env.EXTERNAL_SERVICES_MODE,
    };
  }

  async listSessions(userId: string) {
    const sessions = await this.repository.listSessions(userId);
    return { items: sessions.map((session) => this.mapSessionSummary(session)) };
  }

  async getSession(userId: string, sessionId: string): Promise<GenerationSessionDetail> {
    const session = await this.repository.findSession(userId, sessionId);
    if (!session) throw new NotFoundException("生成会话不存在");
    return {
      ...this.mapSessionSummary(session),
      draft: this.parseStoredDraft(session.draft),
      tasks: session.tasks.map((task) => this.mapTask(task)),
    };
  }

  async renameSession(userId: string, sessionId: string, rawTitle: string) {
    const title = typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim() : "";
    if (!title || title.length > 80) throw new BadRequestException("会话名称长度应为 1-80 个字符");
    const session = await this.repository.renameSession(userId, sessionId, title);
    if (!session) throw new NotFoundException("生成会话不存在");
    return this.getSession(userId, sessionId);
  }

  async updateSessionDraft(
    userId: string,
    sessionId: string,
    rawDraft: UpdateGenerationSessionDraftRequest,
  ) {
    const draft = this.validateSessionDraft(rawDraft);
    await this.uploads.assertOwnedReferenceUrls(userId, draft.referenceImageUrls);
    const session = await this.repository.updateSessionDraft(userId, sessionId, draft);
    if (!session) throw new NotFoundException("生成会话不存在");
    return this.getSession(userId, sessionId);
  }

  async deleteSession(userId: string, sessionId: string) {
    const result = await this.repository.deleteSession(userId, sessionId);
    if (result === "missing") throw new NotFoundException("生成会话不存在");
    if (result === "active") throw new ConflictException("生成中的会话不能删除");
  }

  async getTask(userId: string, taskId: string) {
    const task = await this.repository.findTask(userId, taskId);
    if (!task) throw new NotFoundException("生成任务不存在");
    return this.mapTask(task);
  }

  async cancelTask(userId: string, taskId: string) {
    const task = await this.repository.cancelTask(userId, taskId);
    if (!task) throw new NotFoundException("生成任务不存在");
    return this.mapTask(task);
  }

  async streamTaskEvents(userId: string, taskId: string, lastEventId: string | undefined) {
    const task = await this.repository.findTask(userId, taskId);
    if (!task) throw new NotFoundException("生成任务不存在");
    const afterId = this.parseEventId(lastEventId);

    return new Observable<MessageEvent>((subscriber) => {
      let active = true;
      let cursor = afterId;

      const poll = async () => {
        while (active) {
          try {
            const events = await this.repository.listEvents(taskId, cursor);
            for (const event of events) {
              cursor = event.id;
              const status = this.mapStatus(event.status);
              subscriber.next({
                id: String(event.id),
                type: this.mapEventType(event.type),
                data: {
                  id: String(event.id),
                  taskId,
                  type: this.mapEventType(event.type),
                  status,
                  createdAt: event.createdAt.toISOString(),
                } satisfies GenerationTaskEventData,
              });
            }

            const current = await this.repository.findTask(userId, taskId);
            if (
              !current ||
              (isTerminalTaskStatus(this.mapStatus(current.status)) && events.length === 0)
            ) {
              subscriber.complete();
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          } catch (error) {
            subscriber.error(error);
            return;
          }
        }
      };

      void poll();
      return () => {
        active = false;
      };
    });
  }

  private validateCreateInput(input: CreateGenerationTaskRequest): CreateGenerationTaskRequest {
    if (!input || typeof input !== "object") throw new BadRequestException("生成参数不完整");
    const idempotencyKey =
      typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("幂等键格式不正确");
    }
    if (!prompt || prompt.length > 4000)
      throw new BadRequestException("提示词长度应为 1-4000 个字符");
    if (!model || model.length > 64) throw new BadRequestException("模型参数不正确");
    if (!generationRatios.includes(input.ratio)) throw new BadRequestException("画面比例不正确");
    if (!generationResolutions.includes(input.resolution)) {
      throw new BadRequestException("清晰度参数不正确");
    }
    if (!Number.isInteger(input.imageCount) || input.imageCount < 1 || input.imageCount > 8) {
      throw new BadRequestException("生成张数应为 1-8");
    }
    if (
      !Array.isArray(input.referenceImageUrls) ||
      input.referenceImageUrls.length > 4 ||
      input.referenceImageUrls.some(
        (url) => typeof url !== "string" || url.length > 2048 || !allowedReferenceUrl.test(url),
      )
    ) {
      throw new BadRequestException("参考图应为最多 4 个站内或 HTTPS 地址");
    }
    if (
      input.sessionId !== undefined &&
      input.sessionId !== null &&
      (typeof input.sessionId !== "string" || !input.sessionId.trim())
    ) {
      throw new BadRequestException("生成会话参数不正确");
    }
    return {
      idempotencyKey,
      sessionId: input.sessionId?.trim() || null,
      prompt,
      model,
      ratio: input.ratio,
      resolution: input.resolution,
      imageCount: input.imageCount,
      referenceImageUrls: [...input.referenceImageUrls],
    };
  }

  private validateSessionDraft(input: UpdateGenerationSessionDraftRequest): GenerationSessionDraft {
    if (!input || typeof input !== "object") throw new BadRequestException("会话草稿不完整");
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (prompt.length > 4000) throw new BadRequestException("提示词长度应为 0-4000 个字符");
    if (!this.getOptions().models.some((item) => item.id === model)) {
      throw new BadRequestException("模型参数不正确");
    }
    if (!generationRatios.includes(input.ratio)) throw new BadRequestException("画面比例不正确");
    if (!generationResolutions.includes(input.resolution)) {
      throw new BadRequestException("清晰度参数不正确");
    }
    if (!Number.isInteger(input.imageCount) || input.imageCount < 1 || input.imageCount > 8) {
      throw new BadRequestException("生成张数应为 1-8");
    }
    if (
      !Array.isArray(input.referenceImageUrls) ||
      input.referenceImageUrls.length > 4 ||
      input.referenceImageUrls.some(
        (url) => typeof url !== "string" || url.length > 2048 || !allowedReferenceUrl.test(url),
      )
    ) {
      throw new BadRequestException("参考图应为最多 4 个站内或 HTTPS 地址");
    }
    return {
      prompt,
      model,
      ratio: input.ratio,
      resolution: input.resolution,
      imageCount: input.imageCount,
      referenceImageUrls: [...input.referenceImageUrls],
    };
  }

  private parseStoredDraft(value: unknown): GenerationSessionDraft | null {
    try {
      return this.validateSessionDraft(value as UpdateGenerationSessionDraftRequest);
    } catch {
      return null;
    }
  }

  private mapSessionSummary(session: {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    tasks?: Array<{ results: Array<{ imagePath: string }> }>;
  }): GenerationSessionSummary {
    return {
      id: session.id,
      title: session.title,
      thumbnailUrl: session.tasks?.flatMap((task) => task.results)[0]?.imagePath ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private mapTask(task: {
    id: string;
    sessionId: string;
    status: string;
    prompt: string;
    model: string;
    ratio: string;
    resolution: string;
    imageCount: number;
    referenceImageUrls: unknown;
    unitCost: number;
    totalCost: number;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    results: Array<{
      id: string;
      index: number;
      imagePath: string;
      width: number;
      height: number;
      mimeType: string;
      byteSize: number;
      isAiGenerated: boolean;
    }>;
  }): GenerationTaskResponse {
    return {
      id: task.id,
      sessionId: task.sessionId,
      status: this.mapStatus(task.status),
      prompt: task.prompt,
      model: task.model,
      ratio: decodeGenerationRatio(task.ratio as DatabaseGenerationRatio),
      resolution: decodeGenerationResolution(task.resolution as DatabaseGenerationResolution),
      imageCount: task.imageCount,
      referenceImageUrls: Array.isArray(task.referenceImageUrls)
        ? task.referenceImageUrls.filter((value): value is string => typeof value === "string")
        : [],
      unitCost: task.unitCost,
      totalCost: task.totalCost,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      results: task.results.map((result) => ({
        id: result.id,
        index: result.index,
        imageUrl: result.imagePath,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        isAiGenerated: true,
      })),
    };
  }

  private mapQuota(quota: { total: number; available: number; reserved: number }): QuotaResponse {
    const used = quota.total - quota.available - quota.reserved;
    return {
      total: quota.total,
      available: quota.available,
      reserved: quota.reserved,
      used,
      remainingPercent: quota.total === 0 ? 0 : Math.round((quota.available / quota.total) * 100),
    };
  }

  private mapStatus(status: string): GenerationTaskStatus {
    return status.toLowerCase() as GenerationTaskStatus;
  }

  private mapEventType(value: string): GenerationEventType {
    if (!generationEventTypes.includes(value as GenerationEventType)) {
      throw new Error(`未知任务事件类型: ${value}`);
    }
    return value as GenerationEventType;
  }

  private parseEventId(value: string | undefined) {
    if (!value) return 0n;
    try {
      const parsed = BigInt(value);
      return parsed >= 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }
}
