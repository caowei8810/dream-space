import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

type OrderWithPlan = Prisma.BillingOrderGetPayload<{ include: { planVersion: { include: { plan: true } } } }>;

@Injectable()
export class BillingRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  findPublishedRule(now: Date): Promise<Prisma.BillingRuleGetPayload<{ include: { promotions: true } }> | null> {
    return this.database.billingRule.findFirst({
      where: { status: "PUBLISHED", publishedAt: { lte: now } },
      orderBy: { version: "desc" },
      include: {
        promotions: {
          where: { status: "PUBLISHED", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          orderBy: { priority: "desc" },
        },
      },
    });
  }

  listRules(): Promise<Prisma.BillingRuleGetPayload<{ include: { promotions: true } }>[]> {
    return this.database.billingRule.findMany({ include: { promotions: { orderBy: { priority: "desc" } } }, orderBy: { version: "desc" } });
  }

  async createRule(standardUnitCents: number) {
    return this.database.$transaction(async (transaction) => {
      const latest = await transaction.billingRule.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
      return transaction.billingRule.create({
        data: { version: (latest?.version ?? 0) + 1, standardUnitCents, currency: "CNY", status: "DRAFT" },
        include: { promotions: true },
      });
    });
  }

  async publishRule(id: string) {
    return this.database.$transaction(async (transaction) => {
      await transaction.billingRule.updateMany({ where: { status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
      return transaction.billingRule.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() }, include: { promotions: true } });
    });
  }

  createPromotion(input: { ruleVersion: number; code: string; name: string; discountBps: number; priority: number; stacking: boolean; startsAt: Date; endsAt: Date | null }): Promise<{ id: string; code: string; name: string; discountBps: number; priority: number; stacking: boolean; startsAt: Date; endsAt: Date | null; status: string }> {
    return this.database.billingPromotion.create({ data: { ...input, status: "DRAFT" } });
  }

  async getCashAccount(userId: string) {
    return this.database.cashAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async grantCash(userId: string, amount: number, idempotencyKey: string, taskId?: string) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.cashLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (replay) return { status: "replayed" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      await transaction.cashAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const next = await transaction.cashAccount.update({ where: { userId }, data: { available: { increment: amount } } });
      await transaction.cashLedgerEntry.create({ data: { userId, taskId, type: "GRANT", amount, balanceAfter: next.available, idempotencyKey } });
      return { status: "granted" as const, account: next };
    });
  }

  async reserveCash(userId: string, amount: number, idempotencyKey: string, taskId?: string) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.cashLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (replay) return { status: "replayed" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      await transaction.cashAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const changed = await transaction.cashAccount.updateMany({ where: { userId, available: { gte: amount } }, data: { available: { decrement: amount }, reserved: { increment: amount } } });
      if (changed.count !== 1) return { status: "insufficient" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      const account = await transaction.cashAccount.findUniqueOrThrow({ where: { userId } });
      await transaction.cashLedgerEntry.create({ data: { userId, taskId, type: "RESERVE", amount, balanceAfter: account.available, idempotencyKey } });
      return { status: "reserved" as const, account };
    });
  }

  async settleCash(userId: string, amount: number, idempotencyKey: string, taskId?: string) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.cashLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (replay) return { status: "replayed" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      const changed = await transaction.cashAccount.updateMany({ where: { userId, reserved: { gte: amount } }, data: { reserved: { decrement: amount } } });
      if (changed.count !== 1) return { status: "invalid" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      const account = await transaction.cashAccount.findUniqueOrThrow({ where: { userId } });
      await transaction.cashLedgerEntry.create({ data: { userId, taskId, type: "CONSUME", amount, balanceAfter: account.available, idempotencyKey } });
      return { status: "consumed" as const, account };
    });
  }

  async releaseCash(userId: string, amount: number, idempotencyKey: string, taskId?: string) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.cashLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (replay) return { status: "replayed" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      const changed = await transaction.cashAccount.updateMany({ where: { userId, reserved: { gte: amount } }, data: { reserved: { decrement: amount }, available: { increment: amount } } });
      if (changed.count !== 1) return { status: "invalid" as const, account: await transaction.cashAccount.findUniqueOrThrow({ where: { userId } }) };
      const account = await transaction.cashAccount.findUniqueOrThrow({ where: { userId } });
      await transaction.cashLedgerEntry.create({ data: { userId, taskId, type: "RELEASE", amount, balanceAfter: account.available, idempotencyKey } });
      return { status: "released" as const, account };
    });
  }

  listPublishedPlans(): Promise<Prisma.PlanGetPayload<{ include: { versions: true } }>[]> {
    return this.database.plan.findMany({ where: { status: "PUBLISHED" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { sortOrder: "asc" } });
  }

  listUserOrders(userId: string): Promise<Prisma.BillingOrderGetPayload<{ include: { planVersion: { include: { plan: true } } } }>[]> {
    return this.database.billingOrder.findMany({ where: { userId }, include: { planVersion: { include: { plan: true } } }, orderBy: { createdAt: "desc" } });
  }

  async createOrder(userId: string, planVersionId: string, idempotencyKey: string): Promise<{ status: "missing"; order?: undefined } | { status: "created" | "replayed"; order: OrderWithPlan }> {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.billingOrder.findUnique({ where: { idempotencyKey }, include: { planVersion: { include: { plan: true } } } });
      if (replay) return { status: "replayed" as const, order: replay };
      const version = await transaction.planVersion.findFirst({ where: { id: planVersionId, plan: { status: "PUBLISHED" } }, include: { plan: true } });
      if (!version) return { status: "missing" as const };
      const order = await transaction.billingOrder.create({ data: { userId, planVersionId, amountCents: version.priceCents, idempotencyKey }, include: { planVersion: { include: { plan: true } } } });
      return { status: "created" as const, order };
    });
  }

  async processPayment(input: { provider: string; providerEventId: string; orderId: string; paidAmountCents: number; payload: Record<string, unknown> }): Promise<{ status: "replayed" | "rejected" | "processed"; order: OrderWithPlan | null; entitlement?: { id: string; userId: string; planVersionId: string; orderId: string | null; available: number; reserved: number; expiresAt: Date; status: string } }> {
    return this.database.$transaction(async (transaction) => {
      const event = await transaction.paymentEvent.findUnique({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } } });
      if (event) return { status: "replayed" as const, order: event.orderId ? await transaction.billingOrder.findUnique({ where: { id: event.orderId }, include: { planVersion: { include: { plan: true } } } }) : null };
      const order = await transaction.billingOrder.findUnique({ where: { id: input.orderId }, include: { planVersion: { include: { plan: true } } } });
      if (!order || order.amountCents !== input.paidAmountCents || order.status !== "PENDING") {
        await transaction.paymentEvent.create({ data: { provider: input.provider, providerEventId: input.providerEventId, orderId: order?.id, status: "IGNORED", payload: input.payload as Prisma.InputJsonValue, errorMessage: "订单不存在、金额不一致或已处理" } });
        return { status: "rejected" as const, order: order ?? null };
      }
      const now = new Date();
      const updated = await transaction.billingOrder.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now }, include: { planVersion: { include: { plan: true } } } });
      const entitlement = await transaction.userEntitlement.create({ data: { userId: order.userId, planVersionId: order.planVersionId, orderId: order.id, available: order.planVersion.imageCount, expiresAt: new Date(now.getTime() + order.planVersion.validDays * 86_400_000) } });
      await transaction.entitlementLedgerEntry.create({ data: { userId: order.userId, entitlementId: entitlement.id, type: "GRANT", amount: entitlement.available, balanceAfter: entitlement.available, idempotencyKey: `grant:${order.id}` } });
      await transaction.paymentEvent.create({ data: { provider: input.provider, providerEventId: input.providerEventId, orderId: order.id, status: "PROCESSED", payload: input.payload as Prisma.InputJsonValue, processedAt: now } });
      return { status: "processed" as const, order: updated, entitlement };
    });
  }

  listEntitlements(userId: string) {
    return this.database.userEntitlement.findMany({ where: { userId }, orderBy: { expiresAt: "asc" } });
  }

  async reserveEntitlements(userId: string, amount: number, idempotencyKey: string, taskId?: string) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.entitlementLedgerEntry.findFirst({ where: { userId, idempotencyKey: { startsWith: `${idempotencyKey}:` }, type: "RESERVE" } });
      if (replay) return { status: "replayed" as const, reserved: replay.amount };
      if (!Number.isInteger(amount) || amount <= 0) return { status: "invalid" as const, reserved: 0, remaining: amount };
      const candidates = await transaction.userEntitlement.findMany({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() }, available: { gt: 0 } }, orderBy: { expiresAt: "asc" } });
      const totalAvailable = candidates.reduce((sum, entitlement) => sum + entitlement.available, 0);
      if (totalAvailable < amount) return { status: "insufficient" as const, reserved: 0, remaining: amount };
      let remaining = amount;
      let reserved = 0;
      for (const entitlement of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, entitlement.available);
        const changed = await transaction.userEntitlement.updateMany({ where: { id: entitlement.id, status: "ACTIVE", available: { gte: take } }, data: { available: { decrement: take }, reserved: { increment: take } } });
        if (changed.count !== 1) continue;
        const next = await transaction.userEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
        await transaction.entitlementLedgerEntry.create({ data: { userId, entitlementId: entitlement.id, taskId, type: "RESERVE", amount: take, balanceAfter: next.available, idempotencyKey: `${idempotencyKey}:${entitlement.id}` } });
        remaining -= take; reserved += take;
      }
      return { status: "reserved" as const, reserved, remaining: 0 };
    });
  }

  async refundOrder(userId: string | null, input: { orderId: string; amountCents: number; reason: string; idempotencyKey: string }) {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) return { status: "replayed" as const, refund: replay };
      const order = await transaction.billingOrder.findFirst({ where: { id: input.orderId, ...(userId ? { userId } : {}) }, include: { entitlement: true, planVersion: true } });
      if (!order || order.status !== "PAID" || input.amountCents !== order.amountCents - order.refundedCents || !order.entitlement || order.entitlement.reserved !== 0 || order.entitlement.available !== order.planVersion.imageCount) return { status: "rejected" as const };
      const now = new Date();
      const refund = await transaction.refund.create({ data: { orderId: order.id, amountCents: input.amountCents, reason: input.reason, idempotencyKey: input.idempotencyKey, status: "COMPLETED", completedAt: now } });
      await transaction.userEntitlement.update({ where: { id: order.entitlement.id }, data: { available: 0, status: "REFUNDED" } });
      await transaction.entitlementLedgerEntry.create({ data: { userId: order.userId, entitlementId: order.entitlement.id, type: "REFUND", amount: order.entitlement.available, balanceAfter: 0, idempotencyKey: `refund-entitlement:${refund.id}` } });
      const refundedCents = order.refundedCents + input.amountCents;
      const updatedOrder = await transaction.billingOrder.update({ where: { id: order.id }, data: { refundedCents, status: refundedCents === order.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      return { status: "completed" as const, refund, order: updatedOrder };
    });
  }

  listAllPlans(): Promise<Prisma.PlanGetPayload<{ include: { versions: true } }>[]> {
    return this.database.plan.findMany({ include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { sortOrder: "asc" } });
  }

  async createPlan(input: { code: string; name: string; description: string; priceCents: number; imageCount: number; validDays: number }): Promise<{ plan: { id: string; code: string; name: string; description: string; status: string }; version: { version: number; priceCents: number; imageCount: number; validDays: number; modelAllowlist: unknown; resolutionAllowlist: unknown; dailyLimit: number | null; concurrencyLimit: number | null } }> {
    return this.database.$transaction(async (transaction) => {
      const plan = await transaction.plan.create({ data: { code: input.code, name: input.name, description: input.description, status: "DRAFT" } });
      const version = await transaction.planVersion.create({ data: { planId: plan.id, version: 1, priceCents: input.priceCents, imageCount: input.imageCount, validDays: input.validDays } });
      return { plan, version };
    });
  }

  async publishPlan(id: string): Promise<{ id: string; code: string; name: string; description: string; status: string; versions: Array<{ version: number; priceCents: number; imageCount: number; validDays: number; modelAllowlist: unknown; resolutionAllowlist: unknown; dailyLimit: number | null; concurrencyLimit: number | null }> }> {
    return this.database.plan.update({ where: { id }, data: { status: "PUBLISHED" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  }
}
