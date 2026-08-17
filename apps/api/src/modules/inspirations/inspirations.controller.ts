import type { InspirationDetail, InspirationListResponse } from "@dream-space/contracts";
import { Controller, Get, Inject, Param, Query, Res, StreamableFile } from "@nestjs/common";
import { GenerationResultAssetsService } from "../generation/generation-result-assets.service";
import { InspirationsService } from "./inspirations.service";

@Controller("inspirations")
export class InspirationsController {
  constructor(
    @Inject(InspirationsService) private readonly inspirations: InspirationsService,
    @Inject(GenerationResultAssetsService) private readonly assets: GenerationResultAssetsService,
  ) {}

  @Get()
  list(
    @Query("category") category?: string,
    @Query("q") query?: string,
  ): Promise<InspirationListResponse> {
    return this.inspirations.list(category, query);
  }

  @Get("assets/:slug/:variant")
  async asset(
    @Param("slug") slug: string,
    @Param("variant") variant: string,
    @Res({ passthrough: true }) response: AssetResponse,
  ) {
    if (variant !== "content" && variant !== "thumbnail") {
      throw new Error("Inspiration asset variant is invalid");
    }
    const resultId = await this.inspirations.getPublishedAssetSource(slug);
    const asset = await this.assets.readAny(resultId, variant);
    if (asset.redirectUrl) {
      response.redirect(302, asset.redirectUrl);
      return;
    }
    if (!asset.data) return;
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Content-Length", String(asset.data.byteLength));
    response.setHeader("Content-Disposition", 'inline; filename="inspiration.webp"');
    response.setHeader("Cache-Control", "public, max-age=3600");
    return new StreamableFile(asset.data);
  }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string): Promise<InspirationDetail> {
    return this.inspirations.getBySlug(slug);
  }
}

interface AssetResponse {
  redirect(statusCode: number, url: string): void;
  setHeader(name: string, value: string): void;
}
