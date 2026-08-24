import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GenerationResultAssetsService } from "../src/modules/generation/generation-result-assets.service";

const storedResult = {
  id: "result-1",
  taskId: "task-1",
  index: 0,
  imagePath: "/generation/results/result-1/content",
  objectKey: "results/task-1/result-1.webp",
  thumbnailObjectKey: "thumbnails/task-1/result-1.webp",
  checksumSha256: "a".repeat(64),
  width: 2048,
  height: 2048,
  mimeType: "image/webp",
  byteSize: 1024,
  thumbnailWidth: 480,
  thumbnailHeight: 480,
  thumbnailByteSize: 256,
  moderationStatus: "APPROVED",
  isAiGenerated: true,
  createdAt: new Date(),
};

function createService() {
  const repository = {
    findOwnedResult: vi.fn().mockResolvedValue(storedResult),
    findResult: vi.fn().mockResolvedValue(storedResult),
  };
  const storage = {
    put: vi.fn(),
    get: vi.fn().mockResolvedValue(Buffer.from("stored-image")),
    delete: vi.fn(),
    createSignedGetUrl: vi.fn().mockResolvedValue(null),
  };
  return {
    repository,
    service: new GenerationResultAssetsService(repository as never, storage as never),
    storage,
  };
}

describe("GenerationResultAssetsService", () => {
  it("checks user ownership before reading a local result", async () => {
    const { repository, service, storage } = createService();

    await expect(service.readOwned("user-1", "result-1", "thumbnail")).resolves.toMatchObject({
      redirectUrl: null,
      data: Buffer.from("stored-image"),
      mimeType: "image/webp",
    });
    expect(repository.findOwnedResult).toHaveBeenCalledWith("user-1", "result-1");
    expect(storage.get).toHaveBeenCalledWith(storedResult.thumbnailObjectKey);
  });

  it("does not disclose another user's result", async () => {
    const { repository, service, storage } = createService();
    repository.findOwnedResult.mockResolvedValue(null);

    await expect(service.readOwned("user-2", "result-1", "content")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed S3 URL without loading object bytes", async () => {
    const { service, storage } = createService();
    storage.createSignedGetUrl.mockResolvedValue("http://localhost:9000/signed-result");

    await expect(service.readAny("result-1", "content")).resolves.toMatchObject({
      redirectUrl: "http://localhost:9000/signed-result",
      data: null,
    });
    expect(storage.createSignedGetUrl).toHaveBeenCalledWith(storedResult.objectKey, 300);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("rejects legacy rows that have no protected object", async () => {
    const { repository, service } = createService();
    repository.findResult.mockResolvedValue({
      ...storedResult,
      objectKey: null,
      thumbnailObjectKey: null,
    });

    await expect(service.readAny("result-1", "content")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not expose assets before moderation approval", async () => {
    const { repository, service, storage } = createService();
    repository.findResult.mockResolvedValue({ ...storedResult, moderationStatus: "PENDING" });

    await expect(service.readAny("result-1", "content")).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.createSignedGetUrl).not.toHaveBeenCalled();
  });
});
