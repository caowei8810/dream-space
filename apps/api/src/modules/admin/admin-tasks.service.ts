import {
  type AdminGenerationTaskDetail,
  type AdminGenerationTaskListResponse,
  type AdminGenerationTaskSummary,
  type AdminQuotaReconciliationResponse,
  generationTaskStatuses,
  type GenerationTaskStatus,
  moderationStatuses,
  type ModerationStatus,
} from "@dream-space/contracts";
import {
  decodeGenerationRatio,
  decodeGenerationResolution,
  type DatabaseGenerationRatio,
  type DatabaseGenerationResolution,
  type DatabaseGenerationTaskStatus,
} from "@dream-space/db";
import { parseApiEnv } from "@dream-space/config";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AdminTasksRepository } from "./admin-tasks.repository";

interface RawAdminTaskQuery {
  status?: string;
  model?: string;
  query?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: string;
  pageSize?: string;
}

interface TaskBaseRecord {
  id: string;
  sessionId: string;
  status: string;
  prompt: string;
  model: string;
  ratio: string;
  resolution: string;
  imageCount: number;
  totalCost: number;
  attempts: number;
  referenceImageUrls: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  inputModerationStatus: string;
  outputModerationStatus: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  user: { phone: string };
  session: { title: string };
}

interface TaskListRecord extends TaskBaseRecord {
  _count: { results: number };
}

@Injectable()
export class AdminTasksService {
  private readonly publicOrigin = new URL(parseApiEnv(process.env).API_PUBLIC_URL);
  constructor(@Inject(AdminTasksRepository) private readonly repository: AdminTasksRepository) {}

  async list(raw: RawAdminTaskQuery): Promise<AdminGenerationTaskListResponse> {
    const query = this.validateQuery(raw);
    const result = await this.repository.list(query);
    return {
      items: result.items.map((task) => this.mapSummary(task)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.ceil(result.total / query.pageSize),
    };
  }

  async get(taskId: string): Promise<AdminGenerationTaskDetail> {
    if (!taskId?.trim()) throw new BadRequestException("任务 ID 不正确");
    const task = await this.repository.findById(taskId.trim());
    if (!task) throw new NotFoundException("生成任务不存在");
    return {
      ...this.mapSummary({ ...task, _count: { results: task.results.length } }),
      referenceImageUrls: Array.isArray(task.referenceImageUrls)
        ? task.referenceImageUrls.filter((value): value is string => typeof value === "string")
        : [],
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      deadLetter: task.deadLetter
        ? {
            errorCode: task.deadLetter.errorCode,
            errorMessage: task.deadLetter.errorMessage,
            attempts: task.deadLetter.attempts,
            createdAt: task.deadLetter.createdAt.toISOString(),
            resolvedAt: task.deadLetter.resolvedAt?.toISOString() ?? null,
          }
        : null,
      results: task.results.map((result) => ({
        id: result.id,
        index: result.index,
        imageUrl: this.resultAssetUrl(result, "content"),
        thumbnailUrl: this.resultAssetUrl(result, "thumbnail"),
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        isAiGenerated: true,
        moderationStatus: this.mapModerationStatus(result.moderationStatus),
      })),
    };
  }

  async listReconciliationRuns(): Promise<AdminQuotaReconciliationResponse> {
    const runs = await this.repository.listReconciliationRuns(20);
    return {
      items: runs.map((run) => ({
        id: run.id,
        status: run.status.toLowerCase() as "running" | "completed" | "failed",
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        scannedUsers: run.scannedUsers,
        scannedTasks: run.scannedTasks,
        mismatchCount: run.mismatchCount,
        repairedCount: run.repairedCount,
        errorMessage: run.errorMessage,
        findings: run.findings.map((finding) => ({
          id: finding.id,
          userId: finding.userId,
          taskId: finding.taskId,
          kind: finding.kind.toLowerCase() as
            | "missing_reserve"
            | "missing_release"
            | "missing_consume"
            | "settlement_amount_mismatch"
            | "total_drift"
            | "reserved_drift"
            | "available_drift",
          status: finding.status.toLowerCase() as "open" | "repaired" | "blocked",
          expectedAmount: finding.expectedAmount,
          actualAmount: finding.actualAmount,
          repairedAt: finding.repairedAt?.toISOString() ?? null,
          createdAt: finding.createdAt.toISOString(),
        })),
      })),
    };
  }

  private resultAssetUrl(
    result: {
      id: string;
      imagePath: string;
      objectKey: string | null;
      thumbnailObjectKey: string | null;
    },
    variant: "content" | "thumbnail",
  ) {
    const objectKey = variant === "content" ? result.objectKey : result.thumbnailObjectKey;
    if (!objectKey) return result.imagePath;
    return new URL(`/admin/tasks/results/${result.id}/${variant}`, this.publicOrigin).toString();
  }

  private validateQuery(raw: RawAdminTaskQuery) {
    const status = raw.status?.trim().toLowerCase() || undefined;
    if (status && !generationTaskStatuses.includes(status as GenerationTaskStatus)) {
      throw new BadRequestException("任务状态不正确");
    }
    const model = raw.model?.trim() || undefined;
    if (model && model.length > 64) throw new BadRequestException("模型筛选值过长");
    const query = raw.query?.replace(/\s+/g, " ").trim() || undefined;
    if (query && query.length > 100) throw new BadRequestException("搜索关键词过长");
    const createdFrom = this.parseDate(raw.createdFrom, "开始时间", "start");
    const createdTo = this.parseDate(raw.createdTo, "结束时间", "end");
    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new BadRequestException("开始时间不能晚于结束时间");
    }
    const page = this.parseInteger(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.parseInteger(raw.pageSize, 20, 1, 100, "每页数量");
    return {
      status: status?.toUpperCase() as DatabaseGenerationTaskStatus | undefined,
      model,
      query,
      createdFrom,
      createdTo,
      page,
      pageSize,
    };
  }

  private parseDate(value: string | undefined, label: string, boundary: "start" | "end") {
    if (!value?.trim()) return undefined;
    const normalized = value.trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? new Date(`${normalized}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}+08:00`)
      : new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label}不正确`);
    return date;
  }

  private parseInteger(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
    label: string,
  ) {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${label}不正确`);
    }
    return parsed;
  }

  private mapSummary(task: TaskListRecord): AdminGenerationTaskSummary {
    return {
      id: task.id,
      sessionId: task.sessionId,
      sessionTitle: task.session.title,
      userPhoneMasked: `${task.user.phone.slice(0, 3)}****${task.user.phone.slice(-4)}`,
      status: task.status.toLowerCase() as GenerationTaskStatus,
      prompt: task.prompt,
      model: task.model,
      ratio: decodeGenerationRatio(task.ratio as DatabaseGenerationRatio),
      resolution: decodeGenerationResolution(task.resolution as DatabaseGenerationResolution),
      imageCount: task.imageCount,
      resultCount: task._count.results,
      totalCost: task.totalCost,
      attempts: task.attempts,
      inputModerationStatus: this.mapModerationStatus(task.inputModerationStatus),
      outputModerationStatus: this.mapModerationStatus(task.outputModerationStatus),
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  }

  private mapModerationStatus(value: string): ModerationStatus {
    const normalized = value.toLowerCase();
    if (!moderationStatuses.includes(normalized as ModerationStatus)) {
      throw new Error(`未知审核状态: ${value}`);
    }
    return normalized as ModerationStatus;
  }
}
