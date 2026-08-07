import type { AdminInspirationInput } from "@dream-space/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminInspirationsService } from "./admin-inspirations.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";

@Controller("admin/inspirations")
@UseGuards(AdminPermissionGuard)
export class AdminInspirationsController {
  constructor(
    @Inject(AdminInspirationsService) private readonly service: AdminInspirationsService,
  ) {}

  @Get()
  @RequireAdminPermission("inspirations:read")
  list(
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.list({ status, category, query, page, pageSize });
  }

  @Get(":id")
  @RequireAdminPermission("inspirations:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequireAdminPermission("inspirations:write")
  create(@Body() input: AdminInspirationInput) {
    return this.service.create(input);
  }

  @Patch(":id")
  @RequireAdminPermission("inspirations:write")
  update(@Param("id") id: string, @Body() input: AdminInspirationInput) {
    return this.service.update(id, input);
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequireAdminPermission("inspirations:write")
  publish(@Param("id") id: string) {
    return this.service.publish(id);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @RequireAdminPermission("inspirations:write")
  unpublish(@Param("id") id: string) {
    return this.service.unpublish(id);
  }
}
