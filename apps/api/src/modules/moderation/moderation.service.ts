import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  moderationReviewStatuses,
  type AdminModerationDecisionInput,
  type AdminModerationReviewListResponse,
  type AdminUser,
  type AppealCreateInput,
} from "@dream-space/contracts";
import { ModerationRepository } from "./moderation.repository";
import { GenerationQueue } from "../generation/generation.queue";

@Injectable()
export class ModerationService {
  constructor(
    @Inject(ModerationRepository) private readonly repository: ModerationRepository,
    @Inject(GenerationQueue) private readonly queue: GenerationQueue,
  ) {}

  async listReviews(raw: { page?: string; pageSize?: string; status?: string }): Promise<AdminModerationReviewListResponse> {
    const page = this.integer(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.integer(raw.pageSize, 20, 1, 100, "每页数量");
    const status = raw.status?.trim().toLowerCase();
    if (status && !moderationReviewStatuses.includes(status as never)) throw new BadRequestException("审核状态不正确");
    const result = await this.repository.listReviews({ page, pageSize, status: status?.toUpperCase() as never });
    return {
      items: result.items.map((item) => ({
        id: item.id,
        taskId: item.taskId,
        resultId: item.resultId,
        stage: item.stage.toLowerCase() as "input" | "output",
        status: item.status.toLowerCase() as "open" | "claimed" | "approved" | "rejected",
        reasonCode: item.reasonCode,
        reason: item.reason,
        assignedToId: item.assignedToId,
        assignedToName: item.assignedTo?.displayName ?? null,
        decision: item.decision,
        decisionNote: item.decisionNote,
        createdAt: item.createdAt.toISOString(),
        claimedAt: item.claimedAt?.toISOString() ?? null,
        decidedAt: item.decidedAt?.toISOString() ?? null,
      })),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async claimReview(id: string, actor: AdminUser) {
    const result = await this.repository.claimReview(this.id(id), actor.id);
    if (!result) throw new ConflictException("审核已被其他管理员领取或已处理");
    return result;
  }

  async decideReview(id: string, input: AdminModerationDecisionInput, actor: AdminUser) {
    const note = this.reason(input?.note, "审核说明");
    if (input?.decision !== "approved" && input?.decision !== "rejected") throw new BadRequestException("审核决定不正确");
    const result = await this.repository.decideReview(this.id(id), actor.id, input.decision.toUpperCase() as "APPROVED" | "REJECTED", note);
    if (!result) throw new ConflictException("只能处理自己领取中的审核");
    if (result.shouldEnqueue) await this.queue.enqueue(result.taskId);
    return result;
  }

  async createAppeal(userId: string, input: AppealCreateInput) {
    if (!input?.taskId && !input?.resultId) throw new BadRequestException("申诉必须关联任务或结果");
    const reason = this.reason(input.reason, "申诉原因");
    const appeal = await this.repository.createAppeal(userId, { ...input, reason });
    if (!appeal) throw new NotFoundException("申诉对象不存在或不属于当前用户");
    return this.mapAppeal(appeal);
  }

  async listAppeals(userId: string) {
    const items = await this.repository.listUserAppeals(userId);
    return { items: items.map((item) => this.mapAppeal(item)) };
  }

  async listAdminAppeals() {
    const items = await this.repository.listAppeals();
    return { items: items.map((item) => this.mapAppeal(item)), total: items.length };
  }

  async reviewResultId(reviewId: string) {
    const resultId = await this.repository.reviewResultId(this.id(reviewId));
    if (!resultId) throw new NotFoundException("审核结果不存在");
    return resultId;
  }

  async decideAppeal(id: string, input: AdminModerationDecisionInput, actor: AdminUser) {
    const note = this.reason(input?.note, "申诉说明");
    if (input?.decision !== "approved" && input?.decision !== "rejected") throw new BadRequestException("申诉决定不正确");
    const result = await this.repository.decideAppeal(this.id(id), actor.id, input.decision === "approved" ? "ACCEPTED" : "REJECTED", note);
    if (!result) throw new ConflictException("申诉不存在或已处理");
    return this.mapAppeal(result);
  }

  private mapAppeal(item: { id: string; taskId: string | null; resultId: string | null; reason: string; status: string; decisionNote: string | null; createdAt: Date; decidedAt: Date | null }) {
    return { id: item.id, taskId: item.taskId, resultId: item.resultId, reason: item.reason, status: item.status.toLowerCase() as "open" | "accepted" | "rejected", decisionNote: item.decisionNote, createdAt: item.createdAt.toISOString(), decidedAt: item.decidedAt?.toISOString() ?? null };
  }

  private reason(value: unknown, label: string) {
    if (typeof value !== "string") throw new BadRequestException(`${label}不正确`);
    const result = value.replace(/\s+/g, " ").trim();
    if (result.length < 2 || result.length > 500) throw new BadRequestException(`${label}长度应为 2-500 个字符`);
    return result;
  }

  private id(value: string) {
    const result = value?.trim();
    if (!result) throw new BadRequestException("审核 ID 不正确");
    return result;
  }

  private integer(value: string | undefined, fallback: number, min: number, max: number, label: string) {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new BadRequestException(`${label}不正确`);
    return parsed;
  }
}
