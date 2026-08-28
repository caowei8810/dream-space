import type { AdminInspirationStatus, InspirationCategory } from "@dream-space/contracts";
import {
  type DatabaseClient,
  DatabaseInspirationCategory,
  InspirationSourceType as DatabaseInspirationSourceType,
  InspirationStatus as DatabaseInspirationStatus,
  DatabaseModerationStatus,
  decodeGenerationRatio,
  decodeGenerationResolution,
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

export interface InspirationCandidateQuery {
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

const candidateInclude = {
  task: {
    select: {
      id: true,
      prompt: true,
      model: true,
      ratio: true,
      resolution: true,
      inputModerationStatus: true,
      outputModerationStatus: true,
      createdAt: true,
      user: { select: { phone: true } },
    },
  },
  inspiration: { select: { id: true } },
} as const;
export type CandidateRecord = Prisma.GenerationResultGetPayload<{
  include: typeof candidateInclude;
}>;

@Injectable()
export class AdminInspirationsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: AdminInspirationQuery) {
    const where: Prisma.InspirationWhereInput = {
      sourceResultId: { not: null },
      ...(input.status ? { status: databaseStatus[input.status] } : {}),
      ...(input.category ? { category: databaseCategory[input.category] } : {}),
      ...(input.query
        ? {
            OR: [
              { slug: { contains: input.query, mode: "insensitive" } },
              { title: { contains: input.query, mode: "insensitive" } },
              { prompt: { contains: input.query, mode: "insensitive" } },
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

  async listCandidates(input: InspirationCandidateQuery) {
    const where: Prisma.GenerationResultWhereInput = {
      moderationStatus: DatabaseModerationStatus.APPROVED,
      task: {
        status: { in: ["SUCCEEDED", "PARTIALLY_SUCCEEDED"] },
        inputModerationStatus: DatabaseModerationStatus.APPROVED,
        outputModerationStatus: DatabaseModerationStatus.APPROVED,
        ...(input.query
          ? {
              OR: [
                { prompt: { contains: input.query, mode: "insensitive" } },
                { model: { contains: input.query, mode: "insensitive" } },
                { user: { phone: { contains: input.query } } },
              ],
            }
          : {}),
      },
      inspiration: null,
    };
    const [items, total] = await this.database.$transaction([
      this.database.generationResult.findMany({
        where,
        include: candidateInclude,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.generationResult.count({ where }),
    ]);
    return { items, total };
  }

  findCandidate(resultId: string): Promise<CandidateRecord | null> {
    return this.database.generationResult.findFirst({
      where: {
        id: resultId,
        moderationStatus: DatabaseModerationStatus.APPROVED,
        task: {
          status: { in: ["SUCCEEDED", "PARTIALLY_SUCCEEDED"] },
          inputModerationStatus: DatabaseModerationStatus.APPROVED,
          outputModerationStatus: DatabaseModerationStatus.APPROVED,
        },
      },
      include: candidateInclude,
    });
  }

  async publishCandidate(
    resultId: string,
    input: { title: string; category: InspirationCategory; sortOrder: number },
    audit?: { actorId: string; reason: string; requestId: string },
  ) {
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.generationResult.findFirstOrThrow({
        where: {
          id: resultId,
          moderationStatus: DatabaseModerationStatus.APPROVED,
          task: {
            status: { in: ["SUCCEEDED", "PARTIALLY_SUCCEEDED"] },
            inputModerationStatus: DatabaseModerationStatus.APPROVED,
            outputModerationStatus: DatabaseModerationStatus.APPROVED,
          },
          inspiration: null,
        },
        include: { task: { include: { user: true } } },
      });
      const slug = `user-result-${result.id}`;
      const inspiration = await transaction.inspiration.create({
        data: {
          slug,
          title: input.title,
          prompt: result.task.prompt,
          category: databaseCategory[input.category],
          imagePath: `/inspirations/assets/${slug}/content`,
          thumbnailPath: `/inspirations/assets/${slug}/thumbnail`,
          width: result.width,
          height: result.height,
          modelName: result.task.model,
          ratio: decodeGenerationRatio(result.task.ratio),
          resolutionLabel: decodeGenerationResolution(result.task.resolution),
          authorDisplayName: "用户作品",
          sourceType: DatabaseInspirationSourceType.INTERNAL,
          sourceName: "用户生成图片",
          sourceUrl: null,
          licenseBasis: "用户生成内容，平台精选发布",
          isAiGenerated: result.isAiGenerated,
          likeCount: 0,
          sortOrder: input.sortOrder,
          status: DatabaseInspirationStatus.PUBLISHED,
          publishedAt: new Date(),
          sourceResultId: result.id,
        },
      });
      if (audit)
        await transaction.adminAuditLog.create({
          data: {
            actorAdminUserId: audit.actorId,
            action: "inspiration.publish",
            resourceType: "Inspiration",
            resourceId: inspiration.id,
            reason: audit.reason,
            requestId: audit.requestId,
            before: { sourceResultId: result.id, status: null },
            after: {
              sourceResultId: result.id,
              status: inspiration.status,
              slug: inspiration.slug,
            },
          },
        });
      return inspiration;
    });
  }

  publish(id: string): Promise<InspirationModel> {
    return this.database.inspiration.update({
      where: { id },
      data: { status: DatabaseInspirationStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  unpublish(
    id: string,
    audit?: { actorId: string; reason: string; requestId: string },
  ): Promise<InspirationModel> {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.inspiration.findUniqueOrThrow({ where: { id } });
      const inspiration = await transaction.inspiration.update({
        where: { id },
        data: { status: DatabaseInspirationStatus.ARCHIVED, publishedAt: null },
      });
      if (audit)
        await transaction.adminAuditLog.create({
          data: {
            actorAdminUserId: audit.actorId,
            action: "inspiration.unpublish",
            resourceType: "Inspiration",
            resourceId: inspiration.id,
            reason: audit.reason,
            requestId: audit.requestId,
            before: {
              status: before.status,
              publishedAt: before.publishedAt?.toISOString() ?? null,
            },
            after: { status: inspiration.status, publishedAt: null },
          },
        });
      return inspiration;
    });
  }
}
