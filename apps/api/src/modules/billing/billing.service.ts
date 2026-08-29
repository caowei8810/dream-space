import { calculateBillingQuote } from "@dream-space/core";
import type {
  AdminBillingOrderListResponse,
  AdminPlanCreateInput,
  AdminPlanListResponse,
  BillingQuoteRequest,
  BillingQuoteResponse,
  CashWalletResponse,
  EntitlementRecord,
  OrderCreateInput,
  OrderListResponse,
  PaymentCallbackInput,
  PlanListResponse,
  RefundCreateInput,
  AdminRedemptionCodeBatchCreateInput,
  AdminRedemptionCodeBatchCreateResponse,
  AdminRedemptionCodeListResponse,
  RedemptionCodeRedeemInput,
  RedemptionCodeRedeemResponse,
} from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AdminBillingPromotionCreateInput,
  AdminBillingRuleCreateInput,
  AdminCashGrantInput,
} from "@dream-space/contracts";
import { BillingRepository } from "./billing.repository";

@Injectable()
export class BillingService {
  constructor(@Inject(BillingRepository) private readonly repository: BillingRepository) {}

  async quote(input: BillingQuoteRequest): Promise<BillingQuoteResponse> {
    if (!Number.isInteger(input?.imageCount) || input.imageCount < 1 || input.imageCount > 8) {
      throw new BadRequestException("图片数量必须为 1-8 的整数");
    }
    const now = new Date();
    const rule = await this.repository.findPublishedRule(now);
    if (!rule) throw new NotFoundException("当前没有已发布的计费规则");
    const code = input.promotionCode?.trim().toUpperCase();
    const promotion = code ? rule.promotions.find((item) => item.code === code) : undefined;
    if (code && !promotion) throw new BadRequestException("活动编码不存在或已失效");
    const quote = calculateBillingQuote(
      input.imageCount,
      promotion
        ? { code: promotion.code, discountBps: promotion.discountBps, priority: promotion.priority }
        : undefined,
      rule.standardUnitCents,
    );
    if (rule.currency !== "CNY") throw new NotFoundException("当前计费规则货币不受支持");
    return { ...quote, currency: "CNY", ruleVersion: rule.version };
  }

  async wallet(userId: string): Promise<CashWalletResponse> {
    const account = await this.repository.getCashAccount(userId);
    return { currency: "CNY", availableCents: account.available, reservedCents: account.reserved };
  }

  async reserveCash(userId: string, amountCents: number, idempotencyKey: string, taskId?: string) {
    this.validateMoney(amountCents, idempotencyKey);
    return this.repository.reserveCash(userId, amountCents, idempotencyKey, taskId);
  }

  async releaseCash(userId: string, amountCents: number, idempotencyKey: string, taskId?: string) {
    this.validateMoney(amountCents, idempotencyKey);
    return this.repository.releaseCash(userId, amountCents, idempotencyKey, taskId);
  }

  async settleCash(userId: string, amountCents: number, idempotencyKey: string, taskId?: string) {
    this.validateMoney(amountCents, idempotencyKey);
    return this.repository.settleCash(userId, amountCents, idempotencyKey, taskId);
  }

  async grantCash(
    userId: string,
    input: AdminCashGrantInput,
    idempotencyKey: string,
    actorId: string,
    requestId?: string,
  ) {
    this.reason(input?.reason);
    this.validateMoney(input?.amountCents, idempotencyKey);
    return this.repository.grantCash(userId, input.amountCents, idempotencyKey, undefined, {
      actorId,
      reason: input.reason.trim(),
      requestId: this.requestId(requestId),
    });
  }

  async plans(): Promise<PlanListResponse> {
    const plans = await this.repository.listPublishedPlans();
    return {
      items: plans.flatMap((plan) =>
        plan.versions.map((version) => ({
          id: plan.id,
          versionId: version.id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          version: version.version,
          priceCents: version.priceCents,
          imageCount: version.imageCount,
          validDays: version.validDays,
          modelAllowlist: this.stringArray(version.modelAllowlist),
          resolutionAllowlist: this.stringArray(version.resolutionAllowlist),
          dailyLimit: version.dailyLimit,
          concurrencyLimit: version.concurrencyLimit,
        })),
      ),
    };
  }

  async createOrder(userId: string, input: OrderCreateInput) {
    this.validateIdempotency(input?.idempotencyKey);
    const result = await this.repository.createOrder(
      userId,
      input.planVersionId,
      input.idempotencyKey,
    );
    if (result.status === "missing") throw new NotFoundException("套餐不存在或未发布");
    return this.mapOrder(result.order);
  }


  async orders(userId: string): Promise<OrderListResponse> {
    const items = await this.repository.listUserOrders(userId);
    return { items: items.map((item) => this.mapOrder(item)) };
  }

  async adminOrders(input: {
    page?: string;
    pageSize?: string;
    status?: string;
    query?: string;
  }): Promise<AdminBillingOrderListResponse> {
    const page = this.integer(input.page, 1, 1, 10_000);
    const pageSize = this.integer(input.pageSize, 20, 1, 100);
    const rawStatus = input.status?.trim().toUpperCase();
    if (
      rawStatus &&
      !["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(rawStatus)
    ) {
      throw new BadRequestException("订单状态不正确");
    }
    const status = rawStatus as
      "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | undefined;
    const query = input.query?.trim().slice(0, 100) || undefined;
    const result = await this.repository.listAdminOrders({ page, pageSize, status, query });
    return {
      items: result.items.map((item) => ({
        ...this.mapOrder(item),
        userId: item.userId,
        userPhoneMasked: `${item.user.phone.slice(0, 3)}****${item.user.phone.slice(-4)}`,
        entitlementAvailable: item.entitlement?.available ?? null,
        entitlementReserved: item.entitlement?.reserved ?? null,
        canRefund:
          item.status === "PAID" &&
          item.refundedCents === 0 &&
          item.entitlement?.reserved === 0 &&
          item.entitlement.available === item.planVersion.imageCount,
      })),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    };
  }

  async entitlements(userId: string): Promise<{ items: EntitlementRecord[] }> {
    const items = await this.repository.listEntitlements(userId);
    return {
      items: items.map((item) => ({
        id: item.id,
        planVersionId: item.planVersionId,
        available: item.available,
        reserved: item.reserved,
        expiresAt: item.expiresAt.toISOString(),
        status: item.status.toLowerCase() as EntitlementRecord["status"],
      })),
    };
  }

  async createRedemptionCodes(input: AdminRedemptionCodeBatchCreateInput, actorId: string, requestId?: string): Promise<AdminRedemptionCodeBatchCreateResponse> {
    this.reason(input?.reason);
    if (!input?.planVersionId || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 500) throw new BadRequestException("套餐和生成数量不正确");
    const result = await this.repository.createRedemptionCodes(input.planVersionId, input.quantity, { actorId, reason: input.reason.trim(), requestId: this.requestId(requestId) });
    if (result.status === "missing") throw new NotFoundException("套餐不存在或未发布");
    return { quantity: result.items.length, items: result.items.map((item: any) => this.mapRedemption(item.record, item.code)) };
  }

  async adminRedemptionCodes(input: { page?: string; pageSize?: string }): Promise<AdminRedemptionCodeListResponse> {
    const page = this.integer(input.page, 1, 1, 10000);
    const pageSize = this.integer(input.pageSize, 50, 1, 100);
    const result = await this.repository.listRedemptionCodes(page, pageSize);
    return { total: result.total, items: result.items.map((item: any) => this.mapRedemption(item, `${item.code.slice(0, 7)}****${item.code.slice(-4)}`)) };
  }

  async disableRedemptionCode(id: string, reason: string, actorId: string, requestId?: string) {
    this.reason(reason);
    const result = await this.repository.disableRedemptionCode(id, { actorId, reason: reason.trim(), requestId: this.requestId(requestId) });
    if (!result) throw new BadRequestException("兑换码不存在或已使用");
    return this.mapRedemption(result, `${result.code.slice(0, 7)}****${result.code.slice(-4)}`);
  }

  async redeemCode(userId: string, input: RedemptionCodeRedeemInput): Promise<RedemptionCodeRedeemResponse> {
    if (!input?.code?.trim()) throw new BadRequestException("请输入兑换码");
    const result = await this.repository.redeemCode(userId, input.code);
    if (result.status === "invalid") throw new BadRequestException("兑换码无效");
    if (result.status === "disabled") throw new BadRequestException("兑换码已禁用");
    if (result.status === "redeemed") throw new BadRequestException("兑换码已兑换");
    if (!result.current || !result.entitlement) throw new BadRequestException("兑换失败");
    return { planName: result.current.planVersion.plan.name, planCode: result.current.planVersion.plan.code, imageCount: result.current.planVersion.imageCount, validDays: result.current.planVersion.validDays, expiresAt: result.entitlement.expiresAt.toISOString(), available: result.entitlement.available };
  }

  private mapRedemption(item: any, code: string) {
    return { id: item.id, code, planVersionId: item.planVersionId, planName: item.planVersion.plan.name, planCode: item.planVersion.plan.code, imageCount: item.planVersion.imageCount, validDays: item.planVersion.validDays, status: item.status.toLowerCase(), redeemedAt: item.redeemedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() };
  }

  async paymentCallback(input: PaymentCallbackInput) {
    if (
      !input.provider?.trim() ||
      !input.providerEventId?.trim() ||
      !input.orderId ||
      !Number.isInteger(input.paidAmountCents) ||
      input.paidAmountCents <= 0
    )
      throw new BadRequestException("支付回调参数不正确");
    const result = await this.repository.processPayment({ ...input, payload: input.payload ?? {} });
    return { status: result.status, order: result.order ? this.mapOrder(result.order) : null };
  }

  async refund(
    userId: string | null,
    input: RefundCreateInput,
    admin?: { actorId: string; requestId?: string },
  ) {
    this.reason(input?.reason);
    this.validateMoney(input?.amountCents, input?.idempotencyKey);
    const result = await this.repository.refundOrder(
      userId,
      input,
      admin
        ? {
            actorId: admin.actorId,
            reason: input.reason.trim(),
            requestId: this.requestId(admin.requestId),
          }
        : undefined,
    );
    if (result.status === "rejected")
      throw new BadRequestException("订单状态、金额或权益状态不允许退款");
    return result;
  }

  async adminPlans(): Promise<AdminPlanListResponse> {
    const plans = await this.repository.listAllPlans();
    return {
      items: plans.flatMap((plan) =>
        plan.versions.map((version) => ({
          ...this.mapPlan(plan, version),
          status: plan.status.toLowerCase() as "draft" | "published" | "archived",
        })),
      ),
      total: plans.length,
    };
  }

  async createPlan(input: AdminPlanCreateInput, actorId?: string, requestId?: string) {
    this.reason(input?.reason);
    if (
      !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(input?.code ?? "") ||
      !input.name?.trim() ||
      !input.description?.trim()
    )
      throw new BadRequestException("套餐基本信息不正确");
    if (
      !Number.isInteger(input.priceCents) ||
      input.priceCents <= 0 ||
      !Number.isInteger(input.imageCount) ||
      input.imageCount <= 0 ||
      input.imageCount > 100_000 ||
      !Number.isInteger(input.validDays) ||
      input.validDays <= 0 ||
      input.validDays > 3650
    )
      throw new BadRequestException("套餐价格、张数或有效期不正确");
    const result = await this.repository.createPlan(
      {
        code: input.code,
        name: input.name.trim(),
        description: input.description.trim(),
        priceCents: input.priceCents,
        imageCount: input.imageCount,
        validDays: input.validDays,
      },
      actorId
        ? { actorId, reason: input.reason.trim(), requestId: this.requestId(requestId) }
        : undefined,
    );
    return { ...this.mapPlan(result.plan, result.version), status: "draft" as const };
  }

  async publishPlan(id: string, reason: string, actorId?: string, requestId?: string) {
    this.reason(reason);
    try {
      const plan = await this.repository.publishPlan(
        id,
        actorId
          ? { actorId, reason: reason.trim(), requestId: this.requestId(requestId) }
          : undefined,
      );
      const version = plan.versions[0];
      if (!version) throw new Error("missing version");
      return { ...this.mapPlan(plan, version), status: "published" as const };
    } catch {
      throw new NotFoundException("套餐不存在");
    }
  }

  async listRules() {
    const items = await this.repository.listRules();
    return { items: items.map((item) => this.mapRule(item)), total: items.length };
  }

  async createRule(input: AdminBillingRuleCreateInput, actorId?: string, requestId?: string) {
    this.reason(input?.reason);
    if (
      !Number.isInteger(input?.standardUnitCents) ||
      input.standardUnitCents <= 0 ||
      input.standardUnitCents > 100_000
    ) {
      throw new BadRequestException("标准单价必须为正整数分值");
    }
    return this.mapRule(
      await this.repository.createRule(
        input.standardUnitCents,
        actorId
          ? { actorId, reason: input.reason.trim(), requestId: this.requestId(requestId) }
          : undefined,
      ),
    );
  }

  async publishRule(id: string, reason: string, actorId?: string, requestId?: string) {
    this.reason(reason);
    try {
      return this.mapRule(
        await this.repository.publishRule(
          id,
          actorId
            ? { actorId, reason: reason.trim(), requestId: this.requestId(requestId) }
            : undefined,
        ),
      );
    } catch {
      throw new NotFoundException("计费规则不存在");
    }
  }

  async createPromotion(
    input: AdminBillingPromotionCreateInput,
    actorId?: string,
    requestId?: string,
  ) {
    this.reason(input?.reason);
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (
      !input.code?.trim() ||
      !input.name?.trim() ||
      !Number.isFinite(startsAt.getTime()) ||
      (endsAt && !Number.isFinite(endsAt.getTime()))
    ) {
      throw new BadRequestException("活动参数不正确");
    }
    if (!Number.isInteger(input.discountBps) || input.discountBps < 0 || input.discountBps > 10_000)
      throw new BadRequestException("折扣范围不正确");
    return this.repository.createPromotion(
      {
        ruleVersion: input.ruleVersion,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        discountBps: input.discountBps,
        priority: input.priority ?? 0,
        stacking: input.stacking ?? false,
        startsAt,
        endsAt,
      },
      actorId
        ? { actorId, reason: input.reason.trim(), requestId: this.requestId(requestId) }
        : undefined,
    );
  }

  private mapRule(item: Awaited<ReturnType<BillingRepository["listRules"]>>[number]) {
    return {
      id: item.id,
      version: item.version,
      standardUnitCents: item.standardUnitCents,
      currency: "CNY" as const,
      status: item.status.toLowerCase() as "draft" | "published" | "archived",
      publishedAt: item.publishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      promotions: item.promotions.map((promotion) => ({
        id: promotion.id,
        code: promotion.code,
        name: promotion.name,
        discountBps: promotion.discountBps,
        priority: promotion.priority,
        stacking: promotion.stacking,
        startsAt: promotion.startsAt.toISOString(),
        endsAt: promotion.endsAt?.toISOString() ?? null,
        status: promotion.status.toLowerCase() as "draft" | "published" | "archived",
      })),
    };
  }

  private reason(value: unknown) {
    if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 500)
      throw new BadRequestException("操作原因长度应为 2-500 个字符");
  }

  private validateMoney(amountCents: number, idempotencyKey: string) {
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000)
      throw new BadRequestException("金额必须为正整数分值");
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length < 8 ||
      idempotencyKey.length > 200
    )
      throw new BadRequestException("幂等键不正确");
  }

  private validateIdempotency(value: unknown) {
    if (typeof value !== "string" || value.trim().length < 8 || value.length > 200)
      throw new BadRequestException("幂等键不正确");
  }
  private integer(value: string | undefined, fallback: number, min: number, max: number) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException("分页参数不正确");
    }
    return parsed;
  }
  private requestId(value?: string) {
    return typeof value === "string" && value.trim() && value.length <= 128
      ? value.trim()
      : randomUUID();
  }
  private stringArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }
  private mapOrder(item: {
    id: string;
    planVersionId: string;
    status: string;
    amountCents: number;
    refundedCents: number;
    createdAt: Date;
    paidAt: Date | null;
    planVersion: { plan: { code: string; name: string } };
  }) {
    return {
      id: item.id,
      planVersionId: item.planVersionId,
      planCode: item.planVersion.plan.code,
      planName: item.planVersion.plan.name,
      status: item.status.toLowerCase() as
        "pending" | "paid" | "failed" | "refunded" | "partially_refunded",
      amountCents: item.amountCents,
      refundedCents: item.refundedCents,
      createdAt: item.createdAt.toISOString(),
      paidAt: item.paidAt?.toISOString() ?? null,
    };
  }
  private mapPlan(
    plan: { id: string; code: string; name: string; description: string },
    version: {
      id: string;
      version: number;
      priceCents: number;
      imageCount: number;
      validDays: number;
      modelAllowlist: unknown;
      resolutionAllowlist: unknown;
      dailyLimit: number | null;
      concurrencyLimit: number | null;
    },
  ) {
    return {
      id: plan.id,
      versionId: version.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      version: version.version,
      priceCents: version.priceCents,
      imageCount: version.imageCount,
      validDays: version.validDays,
      modelAllowlist: this.stringArray(version.modelAllowlist),
      resolutionAllowlist: this.stringArray(version.resolutionAllowlist),
      dailyLimit: version.dailyLimit,
      concurrencyLimit: version.concurrencyLimit,
    };
  }
}
