import type {
  AdminPermission,
  AdminRiskRuleCreateInput,
  AdminRiskRuleActionInput,
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
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminRiskService } from "./admin-risk.service";

@Controller("admin/risk")
@UseGuards(AdminPermissionGuard)
export class AdminRiskController {
  constructor(
    @Inject(AdminRiskService)
    private readonly service: AdminRiskService,
    @Inject(AdminAuthService)
    private readonly auth: AdminAuthService,
  ) {}

  @Get("rules")
  @RequireAdminPermission("risk-rules:read")
  listRules() {
    return this.service.listRules();
  }

  @Get("hits")
  @RequireAdminPermission("risk-rules:read")
  listHits(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
  ) {
    return this.service.listHits({ page, pageSize, status });
  }

  @Post("rules")
  @RequireAdminPermission("risk-rules:write")
  create(
    @Body() input: AdminRiskRuleCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "risk-rules:write", (actor) =>
      this.service.create(input, actor, requestId),
    );
  }

  @Post("rules/:id/publish")
  @RequireAdminPermission("risk-rules:publish")
  publish(
    @Param("id") id: string,
    @Body() input: AdminRiskRuleActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "risk-rules:publish", (actor) =>
      this.service.publish(id, input?.reason, actor, requestId),
    );
  }

  @Post("rules/:id/archive")
  @RequireAdminPermission("risk-rules:publish")
  archive(
    @Param("id") id: string,
    @Body() input: AdminRiskRuleActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "risk-rules:publish", (actor) =>
      this.service.archive(id, input?.reason, actor, requestId),
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
