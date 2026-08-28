import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { GenerationResultAssetsService } from "../generation/generation-result-assets.service";
import { AdminInspirationsService } from "./admin-inspirations.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminAuthService } from "./admin-auth.service";

@Controller("admin/inspirations")
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission("inspirations:read")
export class AdminInspirationsController {
  constructor(
    @Inject(AdminInspirationsService) private readonly service: AdminInspirationsService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get()
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
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @RequireAdminPermission("inspirations:publish")
  async unpublish(
    @Param("id") id: string,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    const actor = await this.auth.requirePermission(cookie, "inspirations:publish");
    return this.service.unpublish(id, actor.id, requestId);
  }
}

@Controller("admin/inspiration-candidates")
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission("inspirations:read")
export class AdminInspirationCandidatesController {
  constructor(
    @Inject(AdminInspirationsService) private readonly service: AdminInspirationsService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Get()
  list(
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.candidates({ query, page, pageSize });
  }

  @Get(":resultId/content")
  async content(
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(await this.assets.readAny(resultId, "content"), response);
  }

  @Get(":resultId/thumbnail")
  async thumbnail(
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(await this.assets.readAny(resultId, "thumbnail"), response);
  }

  @Post(":resultId/publish")
  @HttpCode(200)
  @RequireAdminPermission("inspirations:publish")
  async publish(
    @Param("resultId") resultId: string,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    const actor = await this.auth.requirePermission(cookie, "inspirations:publish");
    return this.service.publishCandidate(resultId, actor.id, requestId);
  }

  @Get(":resultId")
  get(@Param("resultId") resultId: string) {
    return this.service.getCandidate(resultId);
  }

  private serveAsset(
    asset: { redirectUrl: string | null; data: Buffer | null; mimeType: string },
    response: AssetResponse,
  ) {
    if (asset.redirectUrl) {
      response.redirect(302, asset.redirectUrl);
      return;
    }
    if (!asset.data) return;
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Content-Length", String(asset.data.byteLength));
    response.setHeader("Content-Disposition", 'inline; filename="inspiration-candidate.webp"');
    response.setHeader("Cache-Control", "private, max-age=3600");
    return new StreamableFile(asset.data);
  }
}

interface AssetResponse {
  redirect(statusCode: number, url: string): void;
  setHeader(name: string, value: string): void;
}
