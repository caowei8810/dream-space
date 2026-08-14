import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { GenerationResultAssetsService } from "../generation/generation-result-assets.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminTasksService } from "./admin-tasks.service";

@Controller("admin/tasks")
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission("tasks:read")
export class AdminTasksController {
  constructor(
    @Inject(AdminTasksService) private readonly service: AdminTasksService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
  ) {}

  @Get()
  list(
    @Query("status") status?: string,
    @Query("model") model?: string,
    @Query("query") query?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.list({ status, model, query, createdFrom, createdTo, page, pageSize });
  }

  @Get("results/:resultId/content")
  async readResult(
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(await this.assets.readAny(resultId, "content"), response);
  }

  @Get("results/:resultId/thumbnail")
  async readResultThumbnail(
    @Param("resultId") resultId: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    return this.serveAsset(await this.assets.readAny(resultId, "thumbnail"), response);
  }

  @Get("reconciliation/runs")
  listReconciliationRuns() {
    return this.service.listReconciliationRuns();
  }

  @Get(":taskId")
  get(@Param("taskId") taskId: string) {
    return this.service.get(taskId);
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

interface AssetResponse {
  redirect(statusCode: number, url: string): void;
  setHeader(name: string, value: string): void;
}
