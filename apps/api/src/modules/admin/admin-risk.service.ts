import {
  riskActions,
  riskRuleMatchTypes,
  type AdminRiskRuleCreateInput,
  type AdminUser,
  type RiskAction,
  type RiskRuleMatchType,
} from "@dream-space/contracts";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RiskRepository } from "../risk/risk.repository";

@Injectable()
export class AdminRiskService {
  constructor(@Inject(RiskRepository) private readonly repository: RiskRepository) {}

  async listRules() {
    const items = await this.repository.listRules();
    return { items: items.map((item) => this.mapRule(item)), total: items.length };
  }

  async listHits(raw: { page?: string; pageSize?: string; status?: string }) {
    const page = this.integer(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.integer(raw.pageSize, 20, 1, 100, "每页数量");
    const status = raw.status?.trim().toUpperCase();
    if (status && !["OPEN", "RESOLVED", "IGNORED"].includes(status)) {
      throw new BadRequestException("命中状态不正确");
    }
    const result = await this.repository.listHits({
      page,
      pageSize,
      status: status as "OPEN" | "RESOLVED" | "IGNORED" | undefined,
    });
    return {
      items: result.items.map((item) => ({
        id: item.id,
        userId: item.userId,
        taskId: item.taskId,
        ruleId: item.ruleId,
        ruleVersion: item.ruleVersion,
        action: item.action.toLowerCase() as RiskAction,
        status: item.status.toLowerCase() as "open" | "resolved" | "ignored",
        decision: item.decision,
        inputLength: item.inputLength,
        requestId: item.requestId,
        createdAt: item.createdAt.toISOString(),
        resolvedAt: item.resolvedAt?.toISOString() ?? null,
      })),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async create(input: AdminRiskRuleCreateInput, actor: AdminUser, requestId?: string) {
    const normalized = this.validate(input);
    return this.mapRule(
      await this.repository.createRule({
        ...normalized,
        actorId: actor.id,
        requestId: this.requestId(requestId),
        reason: normalized.reason,
      }),
    );
  }

  async publish(id: string, reason: string, actor: AdminUser, requestId?: string) {
    const rule = await this.repository.publishRule({
      id: this.id(id),
      actorId: actor.id,
      requestId: this.requestId(requestId),
      reason: this.reason(reason),
    });
    if (!rule) throw new NotFoundException("风控规则不存在");
    return this.mapRule(rule);
  }

  async archive(id: string, reason: string, actor: AdminUser, requestId?: string) {
    const rule = await this.repository.archiveRule({
      id: this.id(id),
      actorId: actor.id,
      requestId: this.requestId(requestId),
      reason: this.reason(reason),
    });
    if (!rule) throw new NotFoundException("风控规则不存在");
    return this.mapRule(rule);
  }

  private validate(input: AdminRiskRuleCreateInput) {
    const code = typeof input?.code === "string" ? input.code.trim().toLowerCase() : "";
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const category = typeof input?.category === "string" ? input.category.trim() : "";
    const pattern = typeof input?.pattern === "string" ? input.pattern.trim() : "";
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(code)) {
      throw new BadRequestException("规则编码应为 2-64 位小写字母、数字、点、下划线或短横线");
    }
    if (name.length < 2 || name.length > 80) throw new BadRequestException("规则名称长度应为 2-80 个字符");
    if (!riskRuleMatchTypes.includes(input.matchType)) throw new BadRequestException("匹配类型不正确");
    if (!riskActions.includes(input.action)) throw new BadRequestException("处置动作不正确");
    if (!category || category.length > 40) throw new BadRequestException("风险分类不正确");
    if (!pattern || pattern.length > 500) throw new BadRequestException("匹配内容长度应为 1-500 个字符");
    if (input.matchType === "regex") {
      if (/\\[1-9]|\(\?<|\(.*\+.*\).*\+/.test(pattern)) {
        throw new BadRequestException("正则表达式包含不允许的高风险结构");
      }
      try {
        new RegExp(pattern, "iu");
      } catch {
        throw new BadRequestException("正则表达式无效");
      }
    }
    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) {
      throw new BadRequestException("优先级应为 0-10000 的整数");
    }
    return {
      code,
      name,
      matchType: input.matchType.toUpperCase() as "KEYWORD" | "REGEX",
      pattern,
      category,
      action: input.action.toUpperCase() as "REJECT" | "RESTRICT" | "BAN" | "MANUAL_REVIEW",
      priority,
      startsAt: this.date(input.startsAt, "开始时间"),
      endsAt: this.date(input.endsAt, "结束时间"),
      reason: this.reason(input.reason),
    };
  }

  private mapRule(item: {
    id: string;
    code: string;
    version: number;
    name: string;
    matchType: string;
    pattern: string;
    category: string;
    action: string;
    priority: number;
    status: string;
    enabled: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { hits: number };
  }) {
    return {
      id: item.id,
      code: item.code,
      version: item.version,
      name: item.name,
      matchType: item.matchType.toLowerCase() as RiskRuleMatchType,
      pattern: item.pattern,
      category: item.category,
      action: item.action.toLowerCase() as RiskAction,
      priority: item.priority,
      status: item.status.toLowerCase() as "draft" | "published" | "archived",
      enabled: item.enabled,
      startsAt: item.startsAt?.toISOString() ?? null,
      endsAt: item.endsAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      hitCount: item._count.hits,
    };
  }

  private date(value: string | null | undefined, label: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label}不正确`);
    return date;
  }

  private reason(value: unknown) {
    if (typeof value !== "string") throw new BadRequestException("请填写操作原因");
    const result = value.replace(/\s+/g, " ").trim();
    if (result.length < 2 || result.length > 500) throw new BadRequestException("操作原因长度应为 2-500 个字符");
    return result;
  }

  private id(value: string) {
    const result = value?.trim();
    if (!result) throw new BadRequestException("规则 ID 不正确");
    return result;
  }

  private integer(value: string | undefined, fallback: number, min: number, max: number, label: string) {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new BadRequestException(`${label}不正确`);
    return parsed;
  }

  private requestId(value?: string) {
    const normalized = value?.trim();
    return normalized && normalized.length <= 128 ? normalized : randomUUID();
  }
}
