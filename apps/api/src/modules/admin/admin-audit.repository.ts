import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

@Injectable()
export class AdminAuditRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: { page: number; pageSize: number; action?: string; resourceType?: string; actor?: string; requestId?: string; from?: Date; to?: Date }): Promise<{ items: Prisma.AdminAuditLogGetPayload<{ include: { actor: { select: { displayName: true; employeeNo: true } } } }>[]; total: number }> {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(input.action ? { action: { contains: input.action, mode: "insensitive" } } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.actor ? { actor: { OR: [{ displayName: { contains: input.actor, mode: "insensitive" } }, { employeeNo: { contains: input.actor, mode: "insensitive" } }] } } : {}),
      ...(input.from || input.to ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } } : {}),
    };
    const [items, total] = await this.database.$transaction([
      this.database.adminAuditLog.findMany({
        where,
        include: { actor: { select: { displayName: true, employeeNo: true } } },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.adminAuditLog.count({ where }),
    ]);
    return { items, total };
  }
}
