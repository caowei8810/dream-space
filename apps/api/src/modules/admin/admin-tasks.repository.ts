import type { DatabaseClient, DatabaseGenerationTaskStatus, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface AdminTaskQuery {
  status?: DatabaseGenerationTaskStatus;
  model?: string;
  query?: string;
  createdFrom?: Date;
  createdTo?: Date;
  page: number;
  pageSize: number;
}

const listInclude = {
  user: { select: { phone: true } },
  session: { select: { title: true } },
  _count: { select: { results: true } },
} as const;

const detailInclude = {
  user: { select: { phone: true } },
  session: { select: { title: true } },
  results: { orderBy: { index: "asc" as const } },
  deadLetter: true,
} as const;

export type AdminTaskListRecord = Prisma.GenerationTaskGetPayload<{ include: typeof listInclude }>;
export type AdminTaskDetailRecord = Prisma.GenerationTaskGetPayload<{
  include: typeof detailInclude;
}>;

@Injectable()
export class AdminTasksRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: AdminTaskQuery): Promise<{ items: AdminTaskListRecord[]; total: number }> {
    const where: Prisma.GenerationTaskWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
      ...(input.query
        ? {
            OR: [
              { prompt: { contains: input.query, mode: "insensitive" } },
              { user: { phone: { contains: input.query } } },
              { session: { title: { contains: input.query, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.database.$transaction([
      this.database.generationTask.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.generationTask.count({ where }),
    ]);
    return { items, total };
  }

  findById(taskId: string): Promise<AdminTaskDetailRecord | null> {
    return this.database.generationTask.findUnique({
      where: { id: taskId },
      include: detailInclude,
    });
  }
}
