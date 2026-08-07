import type {
  AdminInspirationInput,
  AdminInspirationSourceType,
  AdminInspirationStatus,
  InspirationCategory,
} from "@dream-space/contracts";
import {
  type DatabaseClient,
  DatabaseInspirationCategory,
  InspirationSourceType as DatabaseInspirationSourceType,
  InspirationStatus as DatabaseInspirationStatus,
  type InspirationModel,
  type Prisma,
} from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface AdminInspirationQuery {
  status?: AdminInspirationStatus;
  category?: InspirationCategory;
  query?: string;
  page: number;
  pageSize: number;
}

const databaseCategory: Record<InspirationCategory, DatabaseInspirationCategory> = {
  portrait: DatabaseInspirationCategory.PORTRAIT,
  photography: DatabaseInspirationCategory.PHOTOGRAPHY,
  anime: DatabaseInspirationCategory.ANIME,
  illustration: DatabaseInspirationCategory.ILLUSTRATION,
  design: DatabaseInspirationCategory.DESIGN,
};

const databaseStatus: Record<AdminInspirationStatus, DatabaseInspirationStatus> = {
  draft: DatabaseInspirationStatus.DRAFT,
  published: DatabaseInspirationStatus.PUBLISHED,
  archived: DatabaseInspirationStatus.ARCHIVED,
};

const databaseSourceType: Record<AdminInspirationSourceType, DatabaseInspirationSourceType> = {
  ai_public_gallery: DatabaseInspirationSourceType.AI_PUBLIC_GALLERY,
  licensed: DatabaseInspirationSourceType.LICENSED,
  internal: DatabaseInspirationSourceType.INTERNAL,
};

function toDatabaseInput(input: AdminInspirationInput) {
  return {
    slug: input.slug,
    title: input.title,
    prompt: input.prompt,
    category: databaseCategory[input.category],
    imagePath: input.imageUrl,
    thumbnailPath: input.thumbnailUrl,
    width: input.width,
    height: input.height,
    modelName: input.modelName,
    ratio: input.ratio,
    resolutionLabel: input.resolutionLabel,
    authorDisplayName: input.authorDisplayName,
    sourceType: databaseSourceType[input.sourceType],
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl ?? null,
    licenseBasis: input.licenseBasis,
    isAiGenerated: input.isAiGenerated,
    likeCount: input.likeCount,
    sortOrder: input.sortOrder,
  };
}

@Injectable()
export class AdminInspirationsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: AdminInspirationQuery) {
    const where: Prisma.InspirationWhereInput = {
      ...(input.status ? { status: databaseStatus[input.status] } : {}),
      ...(input.category ? { category: databaseCategory[input.category] } : {}),
      ...(input.query
        ? {
            OR: [
              { slug: { contains: input.query, mode: "insensitive" } },
              { title: { contains: input.query, mode: "insensitive" } },
              { prompt: { contains: input.query, mode: "insensitive" } },
              { modelName: { contains: input.query, mode: "insensitive" } },
              { sourceName: { contains: input.query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.database.$transaction([
      this.database.inspiration.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.inspiration.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<InspirationModel | null> {
    return this.database.inspiration.findUnique({ where: { id } });
  }

  async slugExists(slug: string, excludeId?: string) {
    const count = await this.database.inspiration.count({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return count > 0;
  }

  create(input: AdminInspirationInput): Promise<InspirationModel> {
    return this.database.inspiration.create({
      data: {
        ...toDatabaseInput(input),
        status: DatabaseInspirationStatus.DRAFT,
        publishedAt: null,
      },
    });
  }

  update(id: string, input: AdminInspirationInput): Promise<InspirationModel> {
    return this.database.inspiration.update({ where: { id }, data: toDatabaseInput(input) });
  }

  publish(id: string): Promise<InspirationModel> {
    return this.database.inspiration.update({
      where: { id },
      data: { status: DatabaseInspirationStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  unpublish(id: string): Promise<InspirationModel> {
    return this.database.inspiration.update({
      where: { id },
      data: { status: DatabaseInspirationStatus.ARCHIVED, publishedAt: null },
    });
  }
}
