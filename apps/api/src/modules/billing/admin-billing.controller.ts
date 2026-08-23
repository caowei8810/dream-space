import type { AdminBillingPromotionCreateInput, AdminBillingRuleCreateInput, AdminCashGrantInput, AdminPermission, AdminPlanCreateInput, RefundCreateInput } from "@dream-space/contracts";
import { Body, Controller, Headers, Inject, Param, Post, Get, UseGuards } from "@nestjs/common";
import { AdminAuthService } from "../admin/admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "../admin/admin-permission.guard";
import { BillingService } from "./billing.service";

@Controller("admin/billing")
@UseGuards(AdminPermissionGuard)
export class AdminBillingController {
  constructor(
    @Inject(BillingService) private readonly service: BillingService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get("rules")
  @RequireAdminPermission("billing:read")
  list() { return this.service.listRules(); }

  @Post("rules")
  @RequireAdminPermission("billing:write")
  create(@Body() input: AdminBillingRuleCreateInput, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "billing:write", () => this.service.createRule(input));
  }

  @Post("rules/:id/publish")
  @RequireAdminPermission("billing:publish")
  publish(@Param("id") id: string, @Body() input: { reason: string }, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "billing:publish", () => this.service.publishRule(id, input?.reason));
  }

  @Post("promotions")
  @RequireAdminPermission("billing:write")
  createPromotion(@Body() input: AdminBillingPromotionCreateInput, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "billing:write", () => this.service.createPromotion(input));
  }

  @Post("wallets/:userId/grant")
  @RequireAdminPermission("billing:write")
  grant(@Param("userId") userId: string, @Body() input: AdminCashGrantInput, @Headers("cookie") cookie: string | undefined, @Headers("idempotency-key") idempotencyKey: string | undefined) {
    return this.withActor(cookie, "billing:write", () => this.service.grantCash(userId, input, idempotencyKey ?? ""));
  }

  @Post("orders/:id/refund")
  @RequireAdminPermission("refunds:create")
  refund(@Param("id") orderId: string, @Body() input: Omit<RefundCreateInput, "orderId">, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "refunds:create", () => this.service.refund(null, { ...input, orderId }));
  }

  @Get("plans")
  @RequireAdminPermission("plans:read")
  plans() { return this.service.adminPlans(); }

  @Post("plans")
  @RequireAdminPermission("plans:write")
  createPlan(@Body() input: AdminPlanCreateInput, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "plans:write", () => this.service.createPlan(input));
  }

  @Post("plans/:id/publish")
  @RequireAdminPermission("plans:publish")
  publishPlan(@Param("id") id: string, @Body() input: { reason: string }, @Headers("cookie") cookie: string | undefined) {
    return this.withActor(cookie, "plans:publish", () => this.service.publishPlan(id, input?.reason));
  }

  private withActor(cookie: string | undefined, permission: AdminPermission, callback: () => unknown) {
    return this.auth.requirePermission(cookie, permission).then(callback);
  }
}
