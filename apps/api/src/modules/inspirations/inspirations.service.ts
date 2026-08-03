import {
  inspirationCategories,
  type InspirationCategory,
  type InspirationDetail,
  type InspirationListResponse,
} from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InspirationsRepository } from "./inspirations.repository";

const validCategories = new Set<string>(inspirationCategories.map((category) => category.id));

@Injectable()
export class InspirationsService {
  constructor(
    @Inject(InspirationsRepository) private readonly repository: InspirationsRepository,
  ) {}

  async list(category?: string, query?: string): Promise<InspirationListResponse> {
    if (category && !validCategories.has(category)) {
      throw new BadRequestException("Unsupported inspiration category");
    }

    const normalizedQuery = query?.trim();
    if (normalizedQuery && normalizedQuery.length > 100) {
      throw new BadRequestException("Inspiration query is too long");
    }

    return this.repository.list(
      category as InspirationCategory | undefined,
      normalizedQuery || undefined,
    );
  }

  async getBySlug(slug: string): Promise<InspirationDetail> {
    const inspiration = await this.repository.findBySlug(slug);
    if (!inspiration) {
      throw new NotFoundException("Inspiration not found");
    }
    return inspiration;
  }
}
