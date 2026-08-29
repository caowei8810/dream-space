import type {
  AdminModelCreateInput,
  AdminModelRouteUpdateInput,
  AdminModelVersionInput,
  AdminProviderCreateInput,
  AdminProviderUpdateInput,
} from "@dream-space/contracts";
import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminModelsService } from "./admin-models.service";

@Controller("admin/models")
@UseGuards(AdminPermissionGuard)
export class AdminModelsController {
  constructor(
    @Inject(AdminModelsService) private readonly service: AdminModelsService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}
  @Get()
  @RequireAdminPermission("models:read")
  list() {
    return this.service.list();
  }
  @Post("providers")
  @RequireAdminPermission("models:write")
  createProvider(
    @Body() input: AdminProviderCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.createProvider(input, actor.id, requestId));
  }
  @Patch("providers/:id")
  @RequireAdminPermission("models:write")
  updateProvider(
    @Param("id") id: string,
    @Body() input: AdminProviderUpdateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.updateProvider(id, input, actor.id, requestId));
  }
  @Post("providers/:id/health-check")
  @RequireAdminPermission("models:write")
  healthCheck(
    @Param("id") id: string,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.healthCheck(id, actor.id, input?.reason, requestId));
  }
  @Get("providers/:id/models")
  @RequireAdminPermission("models:write")
  listProviderModels(@Param("id") id: string) {
    return this.service.listProviderModels(id);
  }
  @Patch(":id/routes/:providerId")
  @RequireAdminPermission("models:write")
  updateRoute(
    @Param("id") id: string,
    @Param("providerId") providerId: string,
    @Body() input: AdminModelRouteUpdateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.updateRoute(id, providerId, input, actor.id, requestId));
  }
  @Post()
  @RequireAdminPermission("models:write")
  create(
    @Body() input: AdminModelCreateInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.create(input, actor.id, requestId));
  }
  @Post(":id/versions")
  @RequireAdminPermission("models:write")
  createVersion(
    @Param("id") id: string,
    @Body() input: AdminModelVersionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:write")
      .then((actor) => this.service.createVersion(id, input, actor.id, requestId));
  }
  @Post(":id/publish")
  @RequireAdminPermission("models:publish")
  publish(
    @Param("id") id: string,
    @Query("version", ParseIntPipe) version: number,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:publish")
      .then((actor) => this.service.publish(id, version, input?.reason, actor.id, requestId));
  }
  @Post(":id/rollback")
  @RequireAdminPermission("models:publish")
  rollback(
    @Param("id") id: string,
    @Body() input: { reason: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth
      .requirePermission(cookie, "models:publish")
      .then((actor) => this.service.rollback(id, input?.reason, actor.id, requestId));
  }
}
