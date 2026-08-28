import type { AdminPrivacyCleanupInput, PrivacyRequestCreateInput } from "@dream-space/contracts";
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
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AdminAuthService } from "../admin/admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "../admin/admin-permission.guard";
import { PrivacyService } from "./privacy.service";
import {
  REFERENCE_OBJECT_STORAGE,
  type ReferenceObjectStorage,
} from "../uploads/reference-object-storage";

interface ExportResponse {
  setHeader(name: string, value: string): void;
}

@Controller("privacy")
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly service: PrivacyService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("requests")
  @HttpCode(200)
  async create(
    @Headers("cookie") cookie: string | undefined,
    @Body() input: PrivacyRequestCreateInput,
  ) {
    const user = await this.auth.requireActiveUser(cookie ? cookie : null);
    return this.service.create(user.id, input);
  }

  @Get("requests")
  async list(@Headers("cookie") cookie: string | undefined) {
    const user = await this.auth.requireActiveUser(cookie ? cookie : null);
    return this.service.listOwn(user.id);
  }

  @Get("requests/:id/export")
  async export(
    @Param("id") id: string,
    @Headers("cookie") cookie: string | undefined,
    @Res({ passthrough: true }) response: ExportResponse,
  ) {
    const user = await this.auth.requireActiveUser(cookie ? cookie : null);
    const data = await this.service.exportOwn(user.id, id);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="dream-space-export-${id}.json"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    return data;
  }
}

@Controller("admin/privacy/requests")
@UseGuards(AdminPermissionGuard)
export class AdminPrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly service: PrivacyService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(REFERENCE_OBJECT_STORAGE) private readonly storage: ReferenceObjectStorage,
  ) {}

  @Get()
  @RequireAdminPermission("privacy:read")
  list(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.service.listAdmin(Number(page) || 1, Number(pageSize) || 20);
  }

  @Post("cleanup")
  @HttpCode(200)
  @RequireAdminPermission("privacy:write")
  async cleanup(
    @Body() body: AdminPrivacyCleanupInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    const actor = await this.auth.requirePermission(cookie, "privacy:write");
    return this.service.cleanupDeletedUploads({
      actorId: actor.id,
      retentionDays: body.retentionDays,
      dryRun: body.dryRun ?? true,
      reason: body.reason,
      requestId: requestId || `privacy-cleanup-${Date.now()}`,
      storage: this.storage,
    });
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequireAdminPermission("privacy:write")
  async complete(
    @Param("id") id: string,
    @Body() body: { reason: string; decisionNote?: string },
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    const actor = await this.auth.requirePermission(cookie, "privacy:write");
    return this.service.complete(id, actor.id, body.reason, body.decisionNote, requestId);
  }
}
