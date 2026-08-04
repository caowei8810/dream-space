import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalReferenceObjectStorage } from "../src/modules/uploads/local-reference-object-storage";
import type { ReferenceObjectStorage } from "../src/modules/uploads/reference-object-storage";
import type { UploadsRepository } from "../src/modules/uploads/uploads.repository";
import { UploadsService } from "../src/modules/uploads/uploads.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function createPng() {
  return sharp({
    create: { width: 12, height: 8, channels: 4, background: { r: 12, g: 120, b: 88, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

function createService() {
  const stored = new Map<string, Buffer>();
  const storage: ReferenceObjectStorage = {
    put: vi.fn(async (key, data) => void stored.set(key, data)),
    get: vi.fn(async (key) => stored.get(key) ?? Buffer.alloc(0)),
    delete: vi.fn(async (key) => void stored.delete(key)),
  };
  const repository = {
    create: vi.fn(async (input) => ({
      id: "upload-1",
      createdAt: new Date(),
      deletedAt: null,
      ...input,
    })),
    findOwned: vi.fn().mockResolvedValue(null),
    countOwned: vi.fn().mockResolvedValue(1),
  } as unknown as UploadsRepository;
  return { repository, service: new UploadsService(repository, storage), storage, stored };
}

describe("UploadsService", () => {
  it("decodes, strips and stores a real image as WebP", async () => {
    const source = await createPng();
    const { service, storage, stored } = createService();

    const result = await service.createReference("user-1", {
      buffer: source,
      originalname: "../reference.png",
      mimetype: "image/png",
      size: source.byteLength,
    });

    expect(result).toMatchObject({
      id: "upload-1",
      filename: "reference.png",
      mimeType: "image/webp",
      width: 12,
      height: 8,
    });
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.url).toBe("http://localhost:4000/uploads/references/upload-1/content");
    expect(storage.put).toHaveBeenCalledOnce();
    const output = [...stored.values()][0];
    expect(output).toBeDefined();
    await expect(sharp(output).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 12,
      height: 8,
    });
  });

  it("rejects spoofed and foreign reference images", async () => {
    const source = await createPng();
    const { repository, service, storage } = createService();

    await expect(
      service.createReference("user-1", {
        buffer: source,
        originalname: "spoofed.jpg",
        mimetype: "image/jpeg",
        size: source.byteLength,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();

    vi.mocked(repository.countOwned).mockResolvedValue(0);
    await expect(
      service.assertOwnedReferenceUrls("user-1", [
        "http://localhost:4000/uploads/references/upload-2/content",
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertOwnedReferenceUrls("user-1", [
        "https://attacker.example/uploads/references/upload-1/content",
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not reveal another user's stored object", async () => {
    const { service } = createService();
    await expect(service.readReference("user-2", "upload-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("LocalReferenceObjectStorage", () => {
  it("writes atomically inside the configured root and blocks traversal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dream-space-upload-"));
    temporaryDirectories.push(directory);
    const storage = new LocalReferenceObjectStorage(directory);
    const key = "references/user-1/upload-1.webp";

    await storage.put(key, Buffer.from("image"));

    await expect(readFile(join(directory, key), "utf8")).resolves.toBe("image");
    await expect(storage.get("../secret.webp")).rejects.toThrow("invalid reference object key");
  });
});
