import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminInspirationsService } from "../src/modules/admin/admin-inspirations.service";

const candidate = {
  id: "result-1",
  width: 1080,
  height: 1440,
  mimeType: "image/webp",
  createdAt: new Date("2026-08-03T09:00:00Z"),
  task: {
    id: "task-1",
    prompt: "雨后的玻璃花房，柔和自然光",
    model: "image-4.7",
    ratio: "RATIO_3_4",
    resolution: "K2",
    inputModerationStatus: "APPROVED",
    outputModerationStatus: "APPROVED",
    createdAt: new Date("2026-08-03T09:00:00Z"),
    user: { phone: "13800138000" },
  },
  inspiration: null,
};

const inspiration = {
  id: "inspiration-1",
  slug: "user-result-result-1",
  title: "雨后的玻璃花房",
  prompt: candidate.task.prompt,
  category: "PHOTOGRAPHY",
  imagePath: "/inspirations/assets/user-result-result-1/content",
  thumbnailPath: "/inspirations/assets/user-result-result-1/thumbnail",
  width: 1080,
  height: 1440,
  modelName: "image-4.7",
  ratio: "3:4",
  resolutionLabel: "2K",
  authorDisplayName: "用户作品",
  sourceType: "INTERNAL",
  sourceName: "用户生成图片",
  sourceUrl: null,
  licenseBasis: "用户生成内容，平台精选发布",
  isAiGenerated: true,
  likeCount: 0,
  sortOrder: 0,
  status: "PUBLISHED",
  publishedAt: new Date("2026-08-03T10:00:00Z"),
  createdAt: new Date("2026-08-03T10:00:00Z"),
  updatedAt: new Date("2026-08-03T10:00:00Z"),
  sourceResultId: "result-1",
};

function createService() {
  const repository = {
    list: vi.fn().mockResolvedValue({ items: [inspiration], total: 1 }),
    listCandidates: vi.fn().mockResolvedValue({ items: [candidate], total: 1 }),
    findCandidate: vi.fn().mockResolvedValue(candidate),
    findById: vi.fn().mockResolvedValue(inspiration),
    publishCandidate: vi.fn().mockResolvedValue(inspiration),
    publish: vi.fn().mockResolvedValue(inspiration),
    unpublish: vi.fn().mockResolvedValue({ ...inspiration, status: "ARCHIVED", publishedAt: null }),
  };
  return { repository, service: new AdminInspirationsService(repository as never) };
}

describe("admin inspirations service", () => {
  it("lists only approved user-generated candidates and maps protected assets", async () => {
    const { repository, service } = createService();
    const response = await service.candidates({ query: "  花房  ", page: "1", pageSize: "20" });

    expect(repository.listCandidates).toHaveBeenCalledWith({
      query: "花房",
      page: 1,
      pageSize: 20,
    });
    expect(response.items[0]).toMatchObject({
      resultId: "result-1",
      userPhoneMasked: "138****8000",
      inputModerationStatus: "approved",
      outputModerationStatus: "approved",
      publishedInspirationId: null,
    });
    expect(response.items[0].imageUrl).toContain("/admin/inspiration-candidates/result-1/content");
  });

  it("publishes a candidate with server-derived curation metadata only", async () => {
    const { repository, service } = createService();
    await service.publishCandidate("result-1");

    expect(repository.publishCandidate).toHaveBeenCalledWith("result-1", {
      title: "雨后的玻璃花房，柔和自然光",
      category: "photography",
      sortOrder: 0,
    });
  });

  it("rejects missing candidates and refuses legacy records", async () => {
    const { service, repository } = createService();
    repository.findCandidate.mockResolvedValue(null);
    await expect(service.publishCandidate("result-1")).rejects.toBeInstanceOf(NotFoundException);
    repository.findById.mockResolvedValue({ ...inspiration, sourceResultId: null });
    await expect(service.publish("legacy-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("supports published list and unpublish without changing the source image", async () => {
    const { repository, service } = createService();
    const response = await service.list({ status: "published", page: "1", pageSize: "20" });
    expect(response.items[0].sourceResultId).toBe("result-1");
    await service.unpublish("inspiration-1");
    expect(repository.unpublish).toHaveBeenCalledWith("inspiration-1");
  });
});
