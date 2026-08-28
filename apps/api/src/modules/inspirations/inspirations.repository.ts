import type {
  InspirationCategory,
  InspirationDetail,
  InspirationListResponse,
  InspirationSummary,
} from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import {
  DatabaseInspirationCategory,
  InspirationStatus,
  type DatabaseClient,
  type InspirationModel,
} from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const databaseCategoryByApiCategory: Record<
  InspirationCategory,
  (typeof DatabaseInspirationCategory)[keyof typeof DatabaseInspirationCategory]
> = {
  portrait: DatabaseInspirationCategory.PORTRAIT,
  photography: DatabaseInspirationCategory.PHOTOGRAPHY,
  anime: DatabaseInspirationCategory.ANIME,
  illustration: DatabaseInspirationCategory.ILLUSTRATION,
  design: DatabaseInspirationCategory.DESIGN,
};

const apiCategoryByDatabaseCategory: Record<string, InspirationCategory> = {
  PORTRAIT: "portrait",
  PHOTOGRAPHY: "photography",
  ANIME: "anime",
  ILLUSTRATION: "illustration",
  DESIGN: "design",
};

const publicOrigin = new URL(parseApiEnv(process.env).API_PUBLIC_URL);

function assetUrl(inspiration: InspirationModel, variant: "content" | "thumbnail") {
  if (!inspiration.sourceResultId) {
    return variant === "content" ? inspiration.imagePath : inspiration.thumbnailPath;
  }
  return new URL(`/inspirations/assets/${inspiration.slug}/${variant}`, publicOrigin).toString();
}

function toSummary(inspiration: InspirationModel): InspirationSummary {
  return {
    id: inspiration.id,
    slug: inspiration.slug,
    title: inspiration.title,
    promptSummary:
      inspiration.prompt.length > 96 ? `${inspiration.prompt.slice(0, 96)}...` : inspiration.prompt,
    category: apiCategoryByDatabaseCategory[inspiration.category] ?? "design",
    imageUrl: assetUrl(inspiration, "content"),
    thumbnailUrl: assetUrl(inspiration, "thumbnail"),
    width: inspiration.width,
    height: inspiration.height,
    authorDisplayName: inspiration.authorDisplayName,
    likeCount: inspiration.likeCount,
    modelName: inspiration.modelName,
    ratio: inspiration.ratio,
    resolutionLabel: inspiration.resolutionLabel,
    isAiGenerated: inspiration.isAiGenerated,
  };
}

function toDetail(inspiration: InspirationModel): InspirationDetail {
  return {
    ...toSummary(inspiration),
    prompt: inspiration.prompt,
    sourceName: inspiration.sourceName,
    sourceUrl: inspiration.sourceUrl,
    publishedAt: inspiration.publishedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class InspirationsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(category?: InspirationCategory, query?: string): Promise<InspirationListResponse> {
    const records = await this.database.inspiration.findMany({
      where: {
        status: InspirationStatus.PUBLISHED,
        ...(category ? { category: databaseCategoryByApiCategory[category] } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" as const } },
                { prompt: { contains: query, mode: "insensitive" as const } },
                { modelName: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    return { items: records.map(toSummary), total: records.length };
  }

  async findBySlug(slug: string): Promise<InspirationDetail | null> {
    const record = await this.database.inspiration.findFirst({
      where: { slug, status: InspirationStatus.PUBLISHED },
    });

    return record ? toDetail(record) : null;
  }

  async findPublishedAssetSource(slug: string) {
    return this.database.inspiration.findFirst({
      where: { slug, status: InspirationStatus.PUBLISHED, sourceResultId: { not: null } },
      select: { sourceResultId: true },
    });
  }
}
