import type {
  AdminPermission,
  AdminRoleActionInput,
  AdminRoleCreateInput,
  AdminRoleUpdateInput,
} from "@dream-space/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminRolesService } from "./admin-roles.service";

@Controller("admin/roles")
@UseGuards(AdminPermissionGuard)
export class AdminRolesController {
  constructor(
    @Inject(AdminRolesService) private readonly service: AdminRolesService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @RequireAdminPermission("roles:read")
  list() {
    return this.service.list();
  }

  @Get(":id")
  @RequireAdminPermission("roles:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequireAdminPermission("roles:write")
  async create(
    @Body() input: AdminRoleCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.create(input, await this.actor(cookie, "roles:write"), requestId);
  }

  @Patch(":id")
  @RequireAdminPermission("roles:write")
  async update(
    @Param("id") id: string,
    @Body() input: AdminRoleUpdateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.service.update(id, input, await this.actor(cookie, "roles:write"), requestId);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequireAdminPermission("roles:write")
  async remove(
    @Param("id") id: string,
    @Body() input: AdminRoleActionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    await this.service.remove(id, input, await this.actor(cookie, "roles:write"), requestId);
  }

  private actor(cookie: string | undefined, permission: AdminPermission) {
    return this.auth.requirePermission(cookie, permission);
  }
}
