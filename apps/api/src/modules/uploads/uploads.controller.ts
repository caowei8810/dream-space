import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { type ReferenceUploadFile, UploadsService } from "./uploads.service";

interface ContentResponse {
  setHeader(name: string, value: string): void;
}

@Controller("uploads")
export class UploadsController {
  constructor(
    @Inject(UploadsService) private readonly service: UploadsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("references")
  @UseInterceptors(FileInterceptor("file", { limits: { files: 1, fileSize: 10 * 1024 * 1024 } }))
  async createReference(
    @Headers("cookie") cookie: string | undefined,
    @UploadedFile() file: ReferenceUploadFile | undefined,
  ) {
    return this.service.createReference(
      (await this.auth.requireActiveUser(readSessionToken(cookie))).id,
      file,
    );
  }

  @Get("references/:uploadId/content")
  async readReference(
    @Headers("cookie") cookie: string | undefined,
    @Param("uploadId") uploadId: string,
    @Res({ passthrough: true }) response: ContentResponse,
  ) {
    const result = await this.service.readReference(await this.requireUserId(cookie), uploadId);
    response.setHeader("Content-Type", result.record.mimeType);
    response.setHeader("Content-Length", String(result.data.byteLength));
    response.setHeader("Content-Disposition", 'inline; filename="reference.webp"');
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(result.data);
  }

  private async requireUserId(cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return session.user.id;
  }
}
