import type { InspirationDetail, InspirationListResponse } from "@dream-space/contracts";
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { InspirationsService } from "./inspirations.service";

@Controller("inspirations")
export class InspirationsController {
  constructor(@Inject(InspirationsService) private readonly inspirations: InspirationsService) {}

  @Get()
  list(
    @Query("category") category?: string,
    @Query("q") query?: string,
  ): Promise<InspirationListResponse> {
    return this.inspirations.list(category, query);
  }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string): Promise<InspirationDetail> {
    return this.inspirations.getBySlug(slug);
  }
}
