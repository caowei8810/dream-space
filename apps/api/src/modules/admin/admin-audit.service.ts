import type { AdminAuditLogListResponse } from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AdminAuditRepository } from "./admin-audit.repository";

@Injectable()
export class AdminAuditService {
  constructor(@Inject(AdminAuditRepository) private readonly repository: AdminAuditRepository) {}

  async list(query: Record<string, string | undefined>): Promise<AdminAuditLogListResponse> {
    const page = this.integer(query.page, 1, 1, 10_000);
    const pageSize = this.integer(query.pageSize, 50, 1, 100);
    const from = this.date(query.from);
    const to = this.date(query.to);
    if (query.from && !from || query.to && !to) throw new BadRequestException("审计时间范围不正确");
    const result = await this.repository.list({ page, pageSize, action: this.text(query.action, 100), resourceType: this.text(query.resourceType, 100), actor: this.text(query.actor, 100), requestId: this.text(query.requestId, 128), from, to });
    return {
      items: result.items.map((item) => ({
        id: item.id,
        actor: item.actor ? { displayName: item.actor.displayName, employeeNo: item.actor.employeeNo } : null,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        reason: item.reason,
        requestId: item.requestId,
        before: item.before,
        after: item.after,
        createdAt: item.createdAt.toISOString(),
      })),
      total: result.total,
      page,
      pageSize,
    };
  }

  private integer(value: string | undefined, fallback: number, min: number, max: number) {
    if (value === undefined || value === "") return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new BadRequestException("分页参数不正确");
    return number;
  }
  private date(value: string | undefined) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  private text(value: string | undefined, max: number) {
    const text = value?.trim();
    return text ? text.slice(0, max) : undefined;
  }
}
