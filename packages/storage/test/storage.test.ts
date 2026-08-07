import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalObjectStorage } from "../src";

describe("LocalObjectStorage", () => {
  it("writes atomically, reads objects and blocks traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "dream-space-storage-"));
    try {
      const storage = new LocalObjectStorage(root);
      await storage.put("results/task-1/result-1.webp", Buffer.from("image"), "image/webp");
      await expect(readFile(join(root, "results/task-1/result-1.webp"), "utf8")).resolves.toBe(
        "image",
      );
      await expect(storage.get("../secret.webp")).rejects.toThrow("invalid object key");
      await expect(storage.createSignedGetUrl("results/task-1/result-1.webp", 60)).resolves.toBe(
        null,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
