import type {
  AdminAccountActionInput,
  AdminAccountCreateInput,
  AdminAccountUpdateInput,
  AdminPermission,
} from "@dream-space/contracts";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAccountsService } from "./admin-accounts.service";
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";

@Controller("admin/admin-users")
@UseGuards(AdminPermissionGuard)
export class AdminAccountsController {
  constructor(
    @Inject(AdminAccountsService) private readonly service: AdminAccountsService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @RequireAdminPermission("admin-accounts:read")
  list(
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("roleId") roleId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.list({ query, status, roleId, page, pageSize });
  }

  @Get(":id")
  @RequireAdminPermission("admin-accounts:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequireAdminPermission("admin-accounts:write")
  async create(
    @Body() input: AdminAccountCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.create(input, await this.actor(cookie, "admin-accounts:write"), requestId);
  }

  @Patch(":id")
  @RequireAdminPermission("admin-accounts:write")
  async update(
    @Param("id") id: string,
    @Body() input: AdminAccountUpdateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.update(
      id,
      input,
      await this.actor(cookie, "admin-accounts:write"),
      requestId,
    );
  }

  @Post(":id/activate")
  @HttpCode(200)
  @RequireAdminPermission("admin-accounts:write")
  async activate(
    @Param("id") id: string,
    @Body() input: AdminAccountActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.changeStatus(
      id,
      "ACTIVE",
      input,
      await this.actor(cookie, "admin-accounts:write"),
      requestId,
    );
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @RequireAdminPermission("admin-accounts:write")
  async suspend(
    @Param("id") id: string,
    @Body() input: AdminAccountActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.changeStatus(
      id,
      "SUSPENDED",
      input,
      await this.actor(cookie, "admin-accounts:write"),
      requestId,
    );
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @RequireAdminPermission("admin-accounts:write")
  async revoke(
    @Param("id") id: string,
    @Body() input: AdminAccountActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.changeStatus(
      id,
      "REVOKED",
      input,
      await this.actor(cookie, "admin-accounts:write"),
      requestId,
    );
  }

  @Post(":id/revoke-sessions")
  @HttpCode(200)
  @RequireAdminPermission("admin-sessions:revoke")
  async revokeSessions(
    @Param("id") id: string,
    @Body() input: AdminAccountActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.revokeSessions(
      id,
      input,
      await this.actor(cookie, "admin-sessions:revoke"),
      requestId,
    );
  }

  private actor(cookie: string | undefined, permission: AdminPermission) {
    return this.auth.requirePermission(cookie, permission);
  }
}
