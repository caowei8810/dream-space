import type {
  AdminBillingPromotionCreateInput,
  AdminBillingRuleCreateInput,
  AdminCashGrantInput,
  AdminPermission,
  AdminPlanCreateInput,
  AdminRedemptionCodeBatchCreateInput,
  RefundCreateInput,
} from "@dream-space/contracts";
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
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
  list() {
    return this.service.listRules();
  }

  @Post("rules")
  @RequireAdminPermission("billing:write")
  create(
    @Body() input: AdminBillingRuleCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "billing:write", (actor) =>
      this.service.createRule(input, actor.id, requestId),
    );
  }

  @Post("rules/:id/publish")
  @RequireAdminPermission("billing:publish")
  publish(
    @Param("id") id: string,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "billing:publish", (actor) =>
      this.service.publishRule(id, input?.reason, actor.id, requestId),
    );
  }

  @Post("promotions")
  @RequireAdminPermission("billing:write")
  createPromotion(
    @Body() input: AdminBillingPromotionCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "billing:write", (actor) =>
      this.service.createPromotion(input, actor.id, requestId),
    );
  }

  @Post("wallets/:userId/grant")
  @RequireAdminPermission("billing:write")
  grant(
    @Param("userId") userId: string,
    @Body() input: AdminCashGrantInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "billing:write", (actor) =>
      this.service.grantCash(userId, input, idempotencyKey ?? "", actor.id, requestId),
    );
  }

  @Post("orders/:id/refund")
  @RequireAdminPermission("refunds:create")
  refund(
    @Param("id") orderId: string,
    @Body() input: Omit<RefundCreateInput, "orderId">,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "refunds:create", (actor) =>
      this.service.refund(null, { ...input, orderId }, { actorId: actor.id, requestId }),
    );
  }

  @Get("plans")
  @RequireAdminPermission("plans:read")
  plans() {
    return this.service.adminPlans();
  }

  @Get("orders")
  @RequireAdminPermission("billing:read")
  orders(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("query") query?: string,
  ) {
    return this.service.adminOrders({ page, pageSize, status, query });
  }

  @Post("plans")
  @RequireAdminPermission("plans:write")
  createPlan(
    @Body() input: AdminPlanCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "plans:write", (actor) =>
      this.service.createPlan(input, actor.id, requestId),
    );
  }

  @Post("plans/:id/publish")
  @RequireAdminPermission("plans:publish")
  publishPlan(
    @Param("id") id: string,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "plans:publish", (actor) =>
      this.service.publishPlan(id, input?.reason, actor.id, requestId),
    );
  }

  @Get("redemption-codes")
  @RequireAdminPermission("plans:read")
  redemptionCodes(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.service.adminRedemptionCodes({ page, pageSize });
  }

  @Post("redemption-codes/batches")
  @RequireAdminPermission("plans:write")
  createRedemptionCodes(
    @Body() input: AdminRedemptionCodeBatchCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.withActor(cookie, "plans:write", (actor) =>
      this.service.createRedemptionCodes(input, actor.id, requestId),
    );
  }

  @Post("redemption-codes/:id/disable")
  @RequireAdminPermission("plans:write")
  disableRedemptionCode(
    @Param("id") id: string,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.withActor(cookie, "plans:write", (actor) =>
      this.service.disableRedemptionCode(id, input?.reason, actor.id, requestId),
    );
  }

  private withActor(
    cookie: string | undefined,
    permission: AdminPermission,
    callback: (actor: Awaited<ReturnType<AdminAuthService["requirePermission"]>>) => unknown,
  ) {
    return this.auth.requirePermission(cookie, permission).then(callback);
  }
}
