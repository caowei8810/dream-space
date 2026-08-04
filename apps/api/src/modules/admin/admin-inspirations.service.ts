import {
  type AdminInspirationInput,
  type AdminInspirationListResponse,
  type AdminInspirationRecord,
  adminInspirationSourceTypes,
  adminInspirationStatuses,
  inspirationCategories,
} from "@dream-space/contracts";
import type { InspirationModel } from "@dream-space/db";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AdminInspirationsRepository } from "./admin-inspirations.repository";

interface RawAdminInspirationQuery {
  status?: string;
  category?: string;
  query?: string;
  page?: string;
  pageSize?: string;
}

const categories = new Set<string>(inspirationCategories.map((category) => category.id));
const statuses = new Set<string>(adminInspirationStatuses);
const sourceTypes = new Set<string>(adminInspirationSourceTypes);

const apiCategory: Record<string, AdminInspirationRecord["category"]> = {
  PORTRAIT: "portrait",
  PHOTOGRAPHY: "photography",
  ANIME: "anime",
  ILLUSTRATION: "illustration",
  DESIGN: "design",
};

const apiStatus: Record<string, AdminInspirationRecord["status"]> = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

const apiSourceType: Record<string, AdminInspirationRecord["sourceType"]> = {
  AI_PUBLIC_GALLERY: "ai_public_gallery",
  LICENSED: "licensed",
  INTERNAL: "internal",
};

@Injectable()
export class AdminInspirationsService {
  constructor(
    @Inject(AdminInspirationsRepository) private readonly repository: AdminInspirationsRepository,
  ) {}

  async list(raw: RawAdminInspirationQuery): Promise<AdminInspirationListResponse> {
    const status = raw.status?.trim().toLowerCase() || undefined;
    if (status && !statuses.has(status)) throw new BadRequestException("灵感状态不正确");
    const category = raw.category?.trim().toLowerCase() || undefined;
    if (category && !categories.has(category)) throw new BadRequestException("灵感分类不正确");
    const query = raw.query?.replace(/\s+/g, " ").trim() || undefined;
    if (query && query.length > 100) throw new BadRequestException("搜索关键词过长");
    const page = this.integer(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.integer(raw.pageSize, 20, 1, 100, "每页数量");
    const result = await this.repository.list({
      status: status as Parameters<AdminInspirationsRepository["list"]>[0]["status"],
      category: category as Parameters<AdminInspirationsRepository["list"]>[0]["category"],
      query,
      page,
      pageSize,
    });
    return {
      items: result.items.map((item) => this.map(item)),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async get(id: string) {
    const item = await this.find(id);
    return this.map(item);
  }

  async create(raw: AdminInspirationInput) {
    const input = this.validate(raw);
    if (await this.repository.slugExists(input.slug)) {
      throw new ConflictException("灵感 slug 已存在");
    }
    return this.map(await this.repository.create(input));
  }

  async update(id: string, raw: AdminInspirationInput) {
    await this.find(id);
    const input = this.validate(raw);
    if (await this.repository.slugExists(input.slug, id.trim())) {
      throw new ConflictException("灵感 slug 已存在");
    }
    return this.map(await this.repository.update(id.trim(), input));
  }

  async publish(id: string) {
    await this.find(id);
    return this.map(await this.repository.publish(id.trim()));
  }

  async unpublish(id: string) {
    await this.find(id);
    return this.map(await this.repository.unpublish(id.trim()));
  }

  private async find(id: string) {
    const normalized = id?.trim();
    if (!normalized) throw new BadRequestException("灵感 ID 不正确");
    const item = await this.repository.findById(normalized);
    if (!item) throw new NotFoundException("灵感不存在");
    return item;
  }

  private validate(raw: AdminInspirationInput): AdminInspirationInput {
    const slug = this.text(raw?.slug, "slug", 2, 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException("slug 只能包含小写字母、数字和中划线");
    }
    const category = raw?.category;
    if (!categories.has(category)) throw new BadRequestException("灵感分类不正确");
    const sourceType = raw?.sourceType;
    if (!sourceTypes.has(sourceType)) throw new BadRequestException("素材来源类型不正确");
    if (typeof raw?.isAiGenerated !== "boolean") {
      throw new BadRequestException("请标记是否为 AI 生成内容");
    }
    return {
      slug,
      title: this.text(raw.title, "标题", 2, 100),
      prompt: this.text(raw.prompt, "提示词", 1, 4_000),
      category: category as AdminInspirationInput["category"],
      imageUrl: this.assetUrl(raw.imageUrl, "原图地址"),
      thumbnailUrl: this.assetUrl(raw.thumbnailUrl, "缩略图地址"),
      width: this.number(raw.width, 1, 10_000, "图片宽度"),
      height: this.number(raw.height, 1, 10_000, "图片高度"),
      modelName: this.text(raw.modelName, "模型名称", 1, 64),
      ratio: this.text(raw.ratio, "图片比例", 1, 16),
      resolutionLabel: this.text(raw.resolutionLabel, "分辨率", 1, 64),
      authorDisplayName: this.text(raw.authorDisplayName, "作者名称", 1, 64),
      sourceType: sourceType as AdminInspirationInput["sourceType"],
      sourceName: this.text(raw.sourceName, "来源名称", 1, 120),
      sourceUrl: raw.sourceUrl ? this.httpUrl(raw.sourceUrl, "来源链接") : null,
      licenseBasis: this.text(raw.licenseBasis, "授权依据", 1, 500),
      isAiGenerated: raw.isAiGenerated,
      likeCount: this.number(raw.likeCount, 0, 1_000_000, "点赞数"),
      sortOrder: this.number(raw.sortOrder, 0, 1_000_000, "排序值"),
    };
  }

  private text(value: unknown, label: string, min: number, max: number) {
    if (typeof value !== "string") throw new BadRequestException(`${label}不正确`);
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < min || normalized.length > max) {
      throw new BadRequestException(`${label}长度应为 ${min}-${max} 个字符`);
    }
    return normalized;
  }

  private number(value: unknown, min: number, max: number, label: string) {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      throw new BadRequestException(`${label}不正确`);
    }
    return value as number;
  }

  private integer(
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

  private assetUrl(value: unknown, label: string) {
    const normalized = this.text(value, label, 1, 500);
    if (normalized.startsWith("/")) return normalized;
    return this.httpUrl(normalized, label);
  }

  private httpUrl(value: string, label: string) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
      return url.toString();
    } catch {
      throw new BadRequestException(`${label}不正确`);
    }
  }

  private map(item: InspirationModel): AdminInspirationRecord {
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      prompt: item.prompt,
      category: apiCategory[item.category] ?? "design",
      imageUrl: item.imagePath,
      thumbnailUrl: item.thumbnailPath,
      width: item.width,
      height: item.height,
      modelName: item.modelName,
      ratio: item.ratio,
      resolutionLabel: item.resolutionLabel,
      authorDisplayName: item.authorDisplayName,
      sourceType: apiSourceType[item.sourceType] ?? "internal",
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      licenseBasis: item.licenseBasis,
      isAiGenerated: item.isAiGenerated,
      likeCount: item.likeCount,
      sortOrder: item.sortOrder,
      status: apiStatus[item.status] ?? "draft",
      publishedAt: item.publishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
