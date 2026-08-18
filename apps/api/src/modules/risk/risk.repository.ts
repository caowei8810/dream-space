import type { DatabaseClient } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface RiskRuleRuntimeRecord {
  id: string;
  code: string;
  version: number;
  name: string;
  matchType: "KEYWORD" | "REGEX";
  pattern: string;
  category: string;
  action: "REJECT" | "RESTRICT" | "BAN" | "MANUAL_REVIEW";
  priority: number;
}

export interface RiskHitRecord {
  id: string;
  userId: string;
  taskId: string | null;
  ruleId: string | null;
  ruleVersion: number | null;
  action: "REJECT" | "RESTRICT" | "BAN" | "MANUAL_REVIEW";
  status: "OPEN" | "RESOLVED" | "IGNORED";
  decision: string;
  inputLength: number;
  requestId: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

@Injectable()
export class RiskRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  listActiveRules(now = new Date()): Promise<RiskRuleRuntimeRecord[]> {
    return this.database.riskRule.findMany({
      where: {
        status: "PUBLISHED",
        enabled: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        version: true,
        name: true,
        matchType: true,
        pattern: true,
        category: true,
        action: true,
        priority: true,
      },
    });
  }

  async recordHitAndApply(input: {
    userId: string;
    rule: RiskRuleRuntimeRecord;
    inputHash: string;
    inputLength: number;
    requestId: string;
  }): Promise<RiskHitRecord> {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.riskHit.findUnique({
        where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
      });
      if (existing) return existing;

      const actionStatus = {
        REJECT: { status: "RESOLVED" as const, decision: "REJECTED" },
        RESTRICT: { status: "RESOLVED" as const, decision: "RESTRICTED" },
        BAN: { status: "RESOLVED" as const, decision: "BANNED" },
        MANUAL_REVIEW: { status: "OPEN" as const, decision: "PENDING_REVIEW" },
      }[input.rule.action];
      const reason = `命中风控规则 ${input.rule.code} v${input.rule.version}`;
      const hit = await transaction.riskHit.create({
        data: {
          userId: input.userId,
          ruleId: input.rule.id,
          ruleVersion: input.rule.version,
          subjectType: "PROMPT",
          inputHash: input.inputHash,
          inputLength: input.inputLength,
          action: input.rule.action,
          status: actionStatus.status,
          decision: actionStatus.decision,
          requestId: input.requestId,
          metadata: { category: input.rule.category, ruleName: input.rule.name },
          resolvedAt: actionStatus.status === "RESOLVED" ? new Date() : null,
        },
      });

      if (input.rule.action === "RESTRICT" || input.rule.action === "BAN") {
        const status = input.rule.action === "BAN" ? "BANNED" : "RESTRICTED";
        const before = await transaction.user.findUniqueOrThrow({ where: { id: input.userId } });
        await transaction.user.update({
          where: { id: input.userId },
          data: { status, statusReason: reason, statusChangedAt: new Date() },
        });
        if (status === "BANNED") {
          await transaction.userSession.deleteMany({ where: { userId: input.userId } });
        }
        await transaction.adminAuditLog.create({
          data: {
            action: `risk.user.${status.toLowerCase()}`,
            resourceType: "User",
            resourceId: input.userId,
            reason,
            requestId: input.requestId,
            before: { status: before.status, statusReason: before.statusReason },
            after: { status, riskHitId: hit.id, ruleId: input.rule.id },
          },
        });
      }
      return hit;
    });
  }

  async listRules() {
    return this.database.riskRule.findMany({
      orderBy: [{ code: "asc" }, { version: "desc" }],
      include: { _count: { select: { hits: true } } },
    });
  }

  async listHits(input: { page: number; pageSize: number; status?: "OPEN" | "RESOLVED" | "IGNORED" }): Promise<{ items: RiskHitRecord[]; total: number }> {
    const where = input.status ? { status: input.status } : {};
    const [items, total] = await this.database.$transaction([
      this.database.riskHit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.riskHit.count({ where }),
    ]);
    return { items, total };
  }

  async createRule(input: {
    code: string;
    name: string;
    matchType: "KEYWORD" | "REGEX";
    pattern: string;
    category: string;
    action: "REJECT" | "RESTRICT" | "BAN" | "MANUAL_REVIEW";
    priority: number;
    startsAt: Date | null;
    endsAt: Date | null;
    actorId: string;
    requestId: string;
    reason: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const latest = await transaction.riskRule.findFirst({
        where: { code: input.code },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const rule = await transaction.riskRule.create({
        data: {
          code: input.code,
          version: (latest?.version ?? 0) + 1,
          name: input.name,
          matchType: input.matchType,
          pattern: input.pattern,
          category: input.category,
          action: input.action,
          priority: input.priority,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        include: { _count: { select: { hits: true } } },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "risk-rule.create",
          resourceType: "RiskRule",
          resourceId: rule.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { code: rule.code, version: rule.version, action: rule.action },
        },
      });
      return rule;
    });
  }

  async publishRule(input: { id: string; actorId: string; requestId: string; reason: string }) {
    return this.database.$transaction(async (transaction) => {
      const rule = await transaction.riskRule.findUnique({ where: { id: input.id } });
      if (!rule) return null;
      await transaction.riskRule.updateMany({
        where: { code: rule.code, status: "PUBLISHED" },
        data: { status: "ARCHIVED", enabled: false },
      });
      const published = await transaction.riskRule.update({
        where: { id: input.id },
        data: { status: "PUBLISHED", enabled: true },
        include: { _count: { select: { hits: true } } },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "risk-rule.publish",
          resourceType: "RiskRule",
          resourceId: rule.id,
          reason: input.reason,
          requestId: input.requestId,
          before: { status: rule.status, enabled: rule.enabled },
          after: { status: published.status, enabled: published.enabled },
        },
      });
      return published;
    });
  }

  async archiveRule(input: { id: string; actorId: string; requestId: string; reason: string }) {
    return this.database.$transaction(async (transaction) => {
      const rule = await transaction.riskRule.findUnique({ where: { id: input.id } });
      if (!rule) return null;
      const archived = await transaction.riskRule.update({
        where: { id: input.id },
        data: { status: "ARCHIVED", enabled: false },
        include: { _count: { select: { hits: true } } },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "risk-rule.archive",
          resourceType: "RiskRule",
          resourceId: rule.id,
          reason: input.reason,
          requestId: input.requestId,
          before: { status: rule.status, enabled: rule.enabled },
          after: { status: archived.status, enabled: archived.enabled },
        },
      });
      return archived;
    });
  }
}
