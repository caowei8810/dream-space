import type {
  AdminPrivacyCleanupResponse,
  AdminPrivacyRequestListResponse,
  PrivacyRequestCreateInput,
  PrivacyRequestListResponse,
} from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrivacyRepository, type PrivacyRepositoryRecord } from "./privacy.repository";

@Injectable()
export class PrivacyService {
  constructor(@Inject(PrivacyRepository) private readonly repository: PrivacyRepository) {}

  async create(
    userId: string,
    input: PrivacyRequestCreateInput,
  ): Promise<PrivacyRequestListResponse["items"][number]> {
    const reason = this.reason(input.reason);
    const type = input.type === "export" ? "EXPORT" : "DELETE";
    const existing = await this.repository.findPendingOwnRequest(userId, type);
    if (existing) return this.map(existing);
    return this.map(await this.repository.createRequest({ userId, type, reason }));
  }

  async listOwn(userId: string): Promise<PrivacyRequestListResponse> {
    const items = await this.repository.listOwnRequests(userId);
    return { items: items.map((item) => this.map(item)), total: items.length };
  }

  async listAdmin(page: number, pageSize: number): Promise<AdminPrivacyRequestListResponse> {
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000)
      throw new BadRequestException("页码不正确");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new BadRequestException("每页数量不正确");
    const [items, total] = await this.repository.list({ page, pageSize });
    return {
      items: items.map((item) => ({ ...this.map(item), phoneMasked: this.mask(item.user.phone) })),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async completeDelete(
    id: string,
    actorId: string,
    reason: string,
    decisionNote?: string,
    auditRequestId?: string,
  ) {
    const request = await this.repository.completeDelete({
      requestId: id,
      actorId,
      reason: this.reason(reason),
      decisionNote,
      auditRequestId,
    });
    return this.map(request);
  }

  async complete(
    id: string,
    actorId: string,
    reason: string,
    decisionNote?: string,
    auditRequestId?: string,
  ) {
    const request = await this.repository.findRequest(id);
    if (!request) throw new BadRequestException("隐私请求不存在");
    if (request.status === "REJECTED")
      throw new BadRequestException("已拒绝的隐私请求不能重新完成");
    if (request.status === "COMPLETED") return this.map(request);
    return request.type === "EXPORT"
      ? this.completeExport(id, actorId, reason, decisionNote, auditRequestId)
      : this.completeDelete(id, actorId, reason, decisionNote, auditRequestId);
  }

  async completeExport(
    id: string,
    actorId: string,
    reason: string,
    decisionNote?: string,
    auditRequestId?: string,
  ) {
    const request = await this.repository.completeExport({
      requestId: id,
      actorId,
      reason: this.reason(reason),
      decisionNote,
      auditRequestId,
    });
    return this.map(request);
  }

  async exportOwn(userId: string, requestId: string) {
    const data = await this.repository.getCompletedExport(userId, requestId);
    if (!data) throw new BadRequestException("导出请求尚未完成或不属于当前账号");
    return data;
  }

  async cleanupDeletedUploads(input: {
    actorId: string;
    retentionDays: number;
    dryRun: boolean;
    reason: string;
    requestId: string;
    storage: { delete(objectKey: string): Promise<void> };
  }): Promise<AdminPrivacyCleanupResponse> {
    if (
      !Number.isInteger(input.retentionDays) ||
      input.retentionDays < 1 ||
      input.retentionDays > 3650
    )
      throw new BadRequestException("留存天数必须是 1 到 3650 的整数");
    const cutoff = new Date(Date.now() - input.retentionDays * 86_400_000);
    const candidates = await this.repository.listDeletedUploads(cutoff);
    const result: AdminPrivacyCleanupResponse = {
      dryRun: input.dryRun,
      retentionDays: input.retentionDays,
      cutoff: cutoff.toISOString(),
      candidates: candidates.length,
      deleted: 0,
      failed: 0,
      failures: [],
    };
    if (!input.dryRun) {
      for (const candidate of candidates) {
        try {
          await input.storage.delete(candidate.objectKey);
          const removed = await this.repository.deleteUploadMetadata(candidate.id, cutoff);
          if (removed.count === 1) result.deleted += 1;
        } catch (error) {
          result.failed += 1;
          result.failures.push({
            objectKey: candidate.objectKey,
            message: error instanceof Error ? error.message : "对象删除失败",
          });
        }
      }
    }
    await this.repository.recordCleanupAudit({
      actorId: input.actorId,
      reason: input.reason,
      requestId: input.requestId,
      before: { cutoff: cutoff.toISOString(), candidates: result.candidates, dryRun: input.dryRun },
      after: { deleted: result.deleted, failed: result.failed },
    });
    return result;
  }

  private map(item: PrivacyRepositoryRecord) {
    return {
      id: item.id,
      userId: item.userId,
      type: item.type.toLowerCase() as "delete" | "export",
      status: item.status.toLowerCase() as "requested" | "processing" | "completed" | "rejected",
      reason: item.reason,
      requestedAt: item.requestedAt.toISOString(),
      processedAt: item.processedAt?.toISOString() ?? null,
      decisionNote: item.decisionNote,
    };
  }

  private mask(phone: string) {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
  private reason(value: string) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length < 2) throw new BadRequestException("请填写操作原因");
    return normalized;
  }
}
