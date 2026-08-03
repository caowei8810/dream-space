import type {
  CreateGenerationTaskRequest,
  RenameGenerationSessionRequest,
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
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { GenerationService } from "./generation.service";

@Controller("generation")
export class GenerationController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("quota")
  async getQuota(@Headers("cookie") cookie: string | undefined) {
    return this.service.getQuota(await this.requireUserId(cookie));
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
    return this.service.createTask(await this.requireUserId(cookie), input);
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
}
