import { parseApiEnv } from "@dream-space/config";
import {
  decodeGenerationRatio,
  decodeGenerationResolution,
  type InspirationModel,
} from "@dream-space/db";
import {
  inspirationCategories,
  type AdminInspirationCandidateListResponse,
  type AdminInspirationCandidateRecord,
  type AdminInspirationRecord,
  type AdminInspirationStatus,
  type InspirationCategory,
  type ModerationStatus,
} from "@dream-space/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AdminInspirationsRepository, type CandidateRecord } from "./admin-inspirations.repository";
import { randomUUID } from "node:crypto";

interface RawQuery {
  status?: string;
  category?: string;
  query?: string;
  page?: string;
  pageSize?: string;
}

const categories = new Set<string>(inspirationCategories.map((category) => category.id));
const statuses = new Set<string>(["draft", "published", "archived"]);
const apiCategory: Record<string, InspirationCategory> = {
  PORTRAIT: "portrait",
  PHOTOGRAPHY: "photography",
  ANIME: "anime",
  ILLUSTRATION: "illustration",
  DESIGN: "design",
};
const apiStatus: Record<string, AdminInspirationStatus> = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

function maskPhone(phone: string) {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "已注册用户";
}

@Injectable()
export class AdminInspirationsService {
  private readonly publicOrigin = new URL(parseApiEnv(process.env).API_PUBLIC_URL);

  constructor(
    @Inject(AdminInspirationsRepository) private readonly repository: AdminInspirationsRepository,
  ) {}

  async list(raw: RawQuery) {
    const status = raw.status?.trim().toLowerCase() || undefined;
    if (status && !statuses.has(status)) throw new BadRequestException("灵感状态不正确");
    const category = raw.category?.trim().toLowerCase() || undefined;
    if (category && !categories.has(category)) throw new BadRequestException("灵感分类不正确");
    const query = this.query(raw.query);
    const page = this.integer(raw.page, 1, "页码", 1, 1_000_000);
    const pageSize = this.integer(raw.pageSize, 20, "每页数量", 1, 100);
    const result = await this.repository.list({
      status: status as AdminInspirationStatus,
      category: category as InspirationCategory,
      query,
      page,
      pageSize,
    });
    return {
      items: result.items.map((item) => this.mapInspiration(item)),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async candidates(raw: RawQuery): Promise<AdminInspirationCandidateListResponse> {
    const query = this.query(raw.query);
    const page = this.integer(raw.page, 1, "页码", 1, 1_000_000);
    const pageSize = this.integer(raw.pageSize, 20, "每页数量", 1, 100);
    const result = await this.repository.listCandidates({ query, page, pageSize });
    return {
      items: result.items.map((item) => this.mapCandidate(item)),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async get(id: string) {
    const item = await this.repository.findById(this.id(id));
    if (!item) throw new NotFoundException("灵感不存在");
    return this.mapInspiration(item);
  }

  async getCandidate(resultId: string) {
    const item = await this.repository.findCandidate(this.id(resultId));
    if (!item) throw new NotFoundException("没有找到可精选的审核通过图片");
    return this.mapCandidate(item);
  }

  async publishCandidate(resultId: string, actorId?: string, requestId?: string) {
    const candidate = await this.repository.findCandidate(this.id(resultId));
    if (!candidate) throw new NotFoundException("没有找到可精选的审核通过图片");
    const input = this.defaultPublishInput(candidate.task.prompt);
    try {
      const item = actorId
        ? await this.repository.publishCandidate(this.id(resultId), input, {
            actorId,
            reason: "精选发布用户作品",
            requestId: this.requestId(requestId),
          })
        : await this.repository.publishCandidate(this.id(resultId), input);
      return this.mapInspiration(item);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("该图片已经发布为灵感或 slug 已存在");
      }
      throw error;
    }
  }

  async publish(id: string) {
    const item = await this.repository.findById(this.id(id));
    if (!item?.sourceResultId) throw new ConflictException("只有用户生成图片才能发布为灵感");
    return this.mapInspiration(await this.repository.publish(this.id(id)));
  }

  async unpublish(id: string, actorId?: string, requestId?: string) {
    const item = await this.repository.findById(this.id(id));
    if (!item) throw new NotFoundException("灵感不存在");
    const result = actorId
      ? await this.repository.unpublish(this.id(id), {
          actorId,
          reason: "下架灵感内容",
          requestId: this.requestId(requestId),
        })
      : await this.repository.unpublish(this.id(id));
    return this.mapInspiration(result);
  }

  private defaultPublishInput(prompt: string) {
    const normalized = prompt.replace(/\s+/g, " ").trim();
    return {
      title: normalized.length >= 2 ? normalized.slice(0, 100) : "用户生成精选",
      category: "photography" as const,
      sortOrder: 0,
    };
  }

  private requestId(value?: string) {
    return typeof value === "string" && value.trim() && value.length <= 128
      ? value.trim()
      : randomUUID();
  }

  private mapCandidate(item: CandidateRecord): AdminInspirationCandidateRecord {
    const apiOrigin = this.publicOrigin;
    return {
      resultId: item.id,
      taskId: item.task.id,
      imageUrl: new URL(`/admin/inspiration-candidates/${item.id}/content`, apiOrigin).toString(),
      thumbnailUrl: new URL(
        `/admin/inspiration-candidates/${item.id}/thumbnail`,
        apiOrigin,
      ).toString(),
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      prompt: item.task.prompt,
      modelName: item.task.model,
      ratio: decodeGenerationRatio(item.task.ratio),
      resolutionLabel: decodeGenerationResolution(item.task.resolution),
      userPhoneMasked: maskPhone(item.task.user.phone),
      createdAt: item.createdAt.toISOString(),
      inputModerationStatus: item.task.inputModerationStatus.toLowerCase() as ModerationStatus,
      outputModerationStatus: item.task.outputModerationStatus.toLowerCase() as ModerationStatus,
      publishedInspirationId: item.inspiration?.id ?? null,
    };
  }

  private mapInspiration(item: InspirationModel): AdminInspirationRecord {
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      prompt: item.prompt,
      category: apiCategory[item.category] ?? "design",
      imageUrl: item.sourceResultId
        ? new URL(`/inspirations/assets/${item.slug}/content`, this.publicOrigin).toString()
        : item.imagePath,
      thumbnailUrl: item.sourceResultId
        ? new URL(`/inspirations/assets/${item.slug}/thumbnail`, this.publicOrigin).toString()
        : item.thumbnailPath,
      width: item.width,
      height: item.height,
      modelName: item.modelName,
      ratio: item.ratio,
      resolutionLabel: item.resolutionLabel,
      authorDisplayName: item.authorDisplayName,
      sourceType: "internal",
      sourceName: item.sourceResultId ? "用户生成图片" : item.sourceName,
      sourceUrl: null,
      licenseBasis: item.licenseBasis,
      isAiGenerated: item.isAiGenerated,
      likeCount: item.likeCount,
      sortOrder: item.sortOrder,
      status: apiStatus[item.status] ?? "draft",
      publishedAt: item.publishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      sourceResultId: item.sourceResultId ?? null,
    };
  }

  private query(value?: string) {
    const query = value?.replace(/\s+/g, " ").trim() || undefined;
    if (query && query.length > 100) throw new BadRequestException("搜索关键词过长");
    return query;
  }

  private id(value: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException("灵感 ID 不正确");
    return normalized;
  }

  private text(value: unknown, label: string, min: number, max: number) {
    if (typeof value !== "string") throw new BadRequestException(`${label}不正确`);
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < min || normalized.length > max) {
      throw new BadRequestException(`${label}长度应为 ${min}-${max} 个字符`);
    }
    return normalized;
  }

  private integer(
    value: string | number | undefined,
    fallback: number,
    label: string,
    min: number,
    max: number,
  ) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${label}不正确`);
    }
    return parsed;
  }
}
