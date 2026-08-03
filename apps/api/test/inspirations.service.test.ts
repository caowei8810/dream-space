import type { InspirationListResponse } from "@dream-space/contracts";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { InspirationsRepository } from "../src/modules/inspirations/inspirations.repository";
import { InspirationsService } from "../src/modules/inspirations/inspirations.service";

const emptyResponse: InspirationListResponse = { items: [], total: 0 };

function createService() {
  const repository = {
    list: vi.fn().mockResolvedValue(emptyResponse),
    findBySlug: vi.fn().mockResolvedValue(null),
  } as unknown as InspirationsRepository;

  return { repository, service: new InspirationsService(repository) };
}

describe("InspirationsService", () => {
  it("normalizes a valid category and search query", async () => {
    const { repository, service } = createService();

    await expect(service.list("portrait", "  柔光  ")).resolves.toEqual(emptyResponse);
    expect(repository.list).toHaveBeenCalledWith("portrait", "柔光");
  });

  it("rejects unsupported categories", async () => {
    const { service } = createService();

    await expect(service.list("unknown")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns not found for an unpublished or missing slug", async () => {
    const { service } = createService();

    await expect(service.getBySlug("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
