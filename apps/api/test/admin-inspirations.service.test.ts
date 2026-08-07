import type { AdminInspirationInput } from "@dream-space/contracts";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminInspirationsService } from "../src/modules/admin/admin-inspirations.service";

const input: AdminInspirationInput = {
  slug: "rainy-glasshouse",
  title: "雨后的玻璃花房",
  prompt: "雨后的玻璃花房，柔和自然光",
  category: "photography",
  imageUrl: "/inspiration/photography-01.webp",
  thumbnailUrl: "/inspiration/photography-01.webp",
  width: 1080,
  height: 1440,
  modelName: "image-4.7",
  ratio: "3:4",
  resolutionLabel: "1080 × 1440",
  authorDisplayName: "运营精选",
  sourceType: "internal",
  sourceName: "造梦空间",
  sourceUrl: null,
  licenseBasis: "内部生成素材",
  isAiGenerated: true,
  likeCount: 0,
  sortOrder: 10,
};

function record(status: "DRAFT" | "PUBLISHED" | "ARCHIVED" = "DRAFT") {
  return {
    id: "inspiration-1",
    ...input,
    imagePath: input.imageUrl,
    thumbnailPath: input.thumbnailUrl,
    category: "PHOTOGRAPHY",
    sourceType: "INTERNAL",
    status,
    sourceUrl: null,
    publishedAt: status === "PUBLISHED" ? new Date("2026-08-03T10:00:00Z") : null,
    createdAt: new Date("2026-08-03T09:00:00Z"),
    updatedAt: new Date("2026-08-03T10:00:00Z"),
  };
}

function createService() {
  const repository = {
    list: vi.fn().mockResolvedValue({ items: [record("PUBLISHED")], total: 21 }),
    findById: vi.fn().mockResolvedValue(record()),
    slugExists: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(record()),
    update: vi.fn().mockResolvedValue(record()),
    publish: vi.fn().mockResolvedValue(record("PUBLISHED")),
    unpublish: vi.fn().mockResolvedValue(record("ARCHIVED")),
  };
  return { repository, service: new AdminInspirationsService(repository as never) };
}

describe("admin inspirations service", () => {
  it("filters and maps paginated management records", async () => {
    const { repository, service } = createService();

    const response = await service.list({
      status: "published",
      category: "photography",
      query: "  玻璃 花房  ",
      page: "2",
      pageSize: "10",
    });

    expect(repository.list).toHaveBeenCalledWith({
      status: "published",
      category: "photography",
      query: "玻璃 花房",
      page: 2,
      pageSize: 10,
    });
    expect(response).toMatchObject({ total: 21, page: 2, pageSize: 10, pageCount: 3 });
    expect(response.items[0]).toMatchObject({
      category: "photography",
      sourceType: "internal",
      status: "published",
    });
  });

  it("validates and creates a draft record", async () => {
    const { repository, service } = createService();

    const created = await service.create({ ...input, slug: "  Rainy-Glasshouse " });

    expect(repository.create).toHaveBeenCalledWith({ ...input, slug: "rainy-glasshouse" });
    expect(created.status).toBe("draft");
  });

  it("rejects duplicate slugs and invalid managed fields", async () => {
    const duplicate = createService();
    duplicate.repository.slugExists.mockResolvedValue(true);

    await expect(duplicate.service.create(input)).rejects.toBeInstanceOf(ConflictException);

    const { service } = createService();
    await expect(
      service.create({ ...input, sourceType: "unknown" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...input, imageUrl: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list({ status: "unknown" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publishes and unpublishes through explicit state operations", async () => {
    const { repository, service } = createService();

    await expect(service.publish("inspiration-1")).resolves.toMatchObject({ status: "published" });
    await expect(service.unpublish("inspiration-1")).resolves.toMatchObject({ status: "archived" });
    expect(repository.publish).toHaveBeenCalledWith("inspiration-1");
    expect(repository.unpublish).toHaveBeenCalledWith("inspiration-1");
  });
});
