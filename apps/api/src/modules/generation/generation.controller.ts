import type {
  CreateGenerationTaskRequest,
  RenameGenerationSessionRequest,
  UpdateGenerationSessionDraftRequest,
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
  Sse,
  Res,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { GenerationResultAssetsService } from "./generation-result-assets.service";
import { GenerationService } from "./generation.service";

interface AssetResponse {
  redirect(statusCode: number, url: string): void;
  setHeader(name: string, value: string): void;
}

@Controller("generation")
export class GenerationController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("results/:resultId/content")
  async readResult(
    @Headers("cookie") cookie: string | undefined,
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(
      await this.assets.readOwned(await this.requireUserId(cookie), resultId, "content"),
      response,
    );
  }

  @Get("results/:resultId/thumbnail")
  async readResultThumbnail(
    @Headers("cookie") cookie: string | undefined,
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(
      await this.assets.readOwned(await this.requireUserId(cookie), resultId, "thumbnail"),
      response,
    );
  }

  @Get("quota")
  async getQuota(@Headers("cookie") cookie: string | undefined) {
    return this.service.getQuota(await this.requireUserId(cookie));
  }

  @Get("options")
  async getOptions(@Headers("cookie") cookie: string | undefined) {
    await this.requireUserId(cookie);
    return this.service.getRuntimeOptions();
  }

  @Get("sessions")
  async listSessions(@Headers("cookie") cookie: string | undefined) {
    return this.service.listSessions(await this.requireUserId(cookie));
  }

  @Get("sessions/:sessionId")
  async getSession(
    @Headers("cookie") cookie: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.getSession(await this.requireUserId(cookie), sessionId);
  }

  @Patch("sessions/:sessionId")
  async renameSession(
    @Headers("cookie") cookie: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() input: RenameGenerationSessionRequest,
  ) {
    return this.service.renameSession(await this.requireUserId(cookie), sessionId, input?.title);
  }

  @Patch("sessions/:sessionId/draft")
  async updateSessionDraft(
    @Headers("cookie") cookie: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() input: UpdateGenerationSessionDraftRequest,
  ) {
    return this.service.updateSessionDraft(await this.requireUserId(cookie), sessionId, input);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  async deleteSession(
    @Headers("cookie") cookie: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    await this.service.deleteSession(await this.requireUserId(cookie), sessionId);
  }

  @Post("tasks")
  async createTask(
    @Headers("cookie") cookie: string | undefined,
    @Body() input: CreateGenerationTaskRequest,
  ) {
    return this.service.createTask(
      (await this.auth.requireActiveUser(readSessionToken(cookie))).id,
      input,
    );
  }

  @Get("tasks/:taskId")
  async getTask(@Headers("cookie") cookie: string | undefined, @Param("taskId") taskId: string) {
    return this.service.getTask(await this.requireUserId(cookie), taskId);
  }

  @Post("tasks/:taskId/cancel")
  async cancelTask(@Headers("cookie") cookie: string | undefined, @Param("taskId") taskId: string) {
    return this.service.cancelTask(await this.requireUserId(cookie), taskId);
  }

  @Sse("tasks/:taskId/events")
  async events(
    @Headers("cookie") cookie: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Param("taskId") taskId: string,
  ) {
    return this.service.streamTaskEvents(await this.requireUserId(cookie), taskId, lastEventId);
  }

  private async requireUserId(cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return session.user.id;
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
    response.setHeader("Content-Disposition", 'inline; filename="generation-result.webp"');
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(asset.data);
  }
}
