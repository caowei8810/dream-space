import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public readonly input: unknown) {}
  }
  return {
    S3Client: class {
      send = mocks.send;
    },
    PutObjectCommand: Command,
    GetObjectCommand: Command,
    DeleteObjectCommand: Command,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.getSignedUrl }));

import { S3ObjectStorage } from "../src";

function createStorage() {
  return new S3ObjectStorage({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "dreamspace-local",
    accessKey: "test-access",
    secretKey: "test-secret",
    forcePathStyle: true,
  });
}

describe("S3ObjectStorage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes and deletes objects in the configured bucket", async () => {
    mocks.send.mockResolvedValue({});
    const storage = createStorage();

    await storage.put("results/task-1/result-1.webp", Buffer.from("image"), "image/webp");
    await storage.delete("results/task-1/result-1.webp");

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "dreamspace-local",
          Key: "results/task-1/result-1.webp",
          ContentType: "image/webp",
        }),
      }),
    );
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: { Bucket: "dreamspace-local", Key: "results/task-1/result-1.webp" },
      }),
    );
  });

  it("reads streamed bytes and signs a bounded GET request", async () => {
    mocks.send.mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) },
    });
    mocks.getSignedUrl.mockResolvedValue("http://localhost:9000/signed");
    const storage = createStorage();

    await expect(storage.get("results/task-1/result-1.webp")).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    await expect(storage.createSignedGetUrl("results/task-1/result-1.webp", 300)).resolves.toBe(
      "http://localhost:9000/signed",
    );
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: { Bucket: "dreamspace-local", Key: "results/task-1/result-1.webp" },
      }),
      { expiresIn: 300 },
    );
  });

  it("rejects keys outside the owned object namespaces", async () => {
    const storage = createStorage();

    await expect(storage.get("../private.webp")).rejects.toThrow("invalid object key");
    expect(() => storage.createSignedGetUrl("other/task-1/result.webp", 300)).toThrow(
      "invalid object key",
    );
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });
});
