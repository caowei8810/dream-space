import type { AdminModerationDecisionInput, AppealCreateInput } from "@dream-space/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { AdminAuthService } from "../admin/admin-auth.service";
import { AdminPermissionGuard, RequireAdminPermission } from "../admin/admin-permission.guard";
import { ModerationService } from "./moderation.service";
import { GenerationResultAssetsService } from "../generation/generation-result-assets.service";

@Controller("moderation")
export class ModerationController {
  constructor(
    @Inject(ModerationService) private readonly service: ModerationService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AdminAuthService) private readonly adminAuth: AdminAuthService,
  ) {}

  @Get("appeals")
  async listAppeals(@Headers("cookie") cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.service.listAppeals(session.user.id);
  }

  @Post("appeals")
  async createAppeal(
    @Headers("cookie") cookie: string | undefined,
    @Body() input: AppealCreateInput,
  ) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.service.createAppeal(session.user.id, input);
  }
}

@Controller("admin/moderation")
@UseGuards(AdminPermissionGuard)
export class AdminModerationController {
  constructor(
    @Inject(ModerationService) private readonly service: ModerationService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
  ) {}

  @Get("reviews")
  @RequireAdminPermission("moderation:read")
  listReviews(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
  ) {
    return this.service.listReviews({ page, pageSize, status });
  }

  @Post("reviews/:id/claim")
  @RequireAdminPermission("moderation:write")
  claim(
    @Param("id") id: string,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "moderation:write", (actor) =>
      this.service.claimReview(id, actor, requestId),
    );
  }

  @Post("reviews/:id/decision")
  @RequireAdminPermission("moderation:write")
  decide(
    @Param("id") id: string,
    @Body() input: AdminModerationDecisionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "moderation:write", (actor) =>
      this.service.decideReview(id, input, actor, requestId),
    );
  }

  @Get("reviews/:id/assets/:variant")
  @RequireAdminPermission("moderation:read")
  async asset(
    @Param("id") id: string,
    @Param("variant") variant: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    if (variant !== "content" && variant !== "thumbnail")
      throw new BadRequestException("审核资产类型不正确");
    const resultId = await this.service.reviewResultId(id);
    const asset = await this.assets.readModeration(resultId, variant);
    if (asset.redirectUrl) {
      response.redirect(302, asset.redirectUrl);
      return;
    }
    if (!asset.data) return;
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Content-Length", String(asset.data.byteLength));
    response.setHeader("Content-Disposition", 'inline; filename="moderation.webp"');
    response.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(asset.data);
  }

  @Post("appeals/:id/decision")
  @RequireAdminPermission("moderation:write")
  decideAppeal(
    @Param("id") id: string,
    @Body() input: AdminModerationDecisionInput,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    return this.withActor(cookie, "moderation:write", (actor) =>
      this.service.decideAppeal(id, input, actor, requestId),
    );
  }

  @Get("appeals")
  @RequireAdminPermission("moderation:read")
  listAppeals() {
    return this.service.listAdminAppeals();
  }

  private withActor(
    cookie: string | undefined,
    permission: "moderation:write",
    callback: (actor: Awaited<ReturnType<AdminAuthService["requirePermission"]>>) => unknown,
  ) {
    return this.auth.requirePermission(cookie, permission).then(callback);
  }
}

interface AssetResponse {
  redirect(statusCode: number, url: string): void;
  setHeader(name: string, value: string): void;
}
