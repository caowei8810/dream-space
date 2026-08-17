import type { AdminUserStatusInput, AdminPermission } from "@dream-space/contracts";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminUsersService } from "./admin-users.service";
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";

@Controller("admin/users")
@UseGuards(AdminPermissionGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService) private readonly service: AdminUsersService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @RequireAdminPermission("users:read")
  list(
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.list({ query, status, page, pageSize });
  }

  @Get(":id")
  @RequireAdminPermission("users:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post(":id/restrict")
  @HttpCode(200)
  @RequireAdminPermission("users:write")
  restrict(
    @Param("id") id: string,
    @Body() input: AdminUserStatusInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.changeStatus(id, "RESTRICTED", input, cookie, requestId, "users:write");
  }

  @Post(":id/ban")
  @HttpCode(200)
  @RequireAdminPermission("users:write")
  ban(
    @Param("id") id: string,
    @Body() input: AdminUserStatusInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.changeStatus(id, "BANNED", input, cookie, requestId, "users:write");
  }

  @Post(":id/activate")
  @HttpCode(200)
  @RequireAdminPermission("users:write")
  activate(
    @Param("id") id: string,
    @Body() input: AdminUserStatusInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.changeStatus(id, "ACTIVE", input, cookie, requestId, "users:write");
  }

  @Post(":id/revoke-sessions")
  @HttpCode(200)
  @RequireAdminPermission("user-sessions:revoke")
  async revokeSessions(
    @Param("id") id: string,
    @Body() input: AdminUserStatusInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.revokeSessions(
      id,
      input,
      await this.actor(cookie, "user-sessions:revoke"),
      requestId,
    );
  }

  private changeStatus(
    id: string,
    status: "ACTIVE" | "RESTRICTED" | "BANNED",
    input: AdminUserStatusInput,
    cookie: string | undefined,
    requestId: string | undefined,
    permission: AdminPermission,
  ) {
    return this.actor(cookie, permission).then((actor) =>
      this.service.changeStatus(id, status, input, actor, requestId),
    );
  }

  private actor(cookie: string | undefined, permission: AdminPermission) {
    return this.auth.requirePermission(cookie, permission);
  }
}
