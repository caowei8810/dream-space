import { describe, expect, it, vi } from "vitest";
import { cleanupDeletedUploads } from "../src/privacy/privacy-retention";

describe("scheduled privacy cleanup", () => {
  it("deletes objects before eligible metadata", async () => {
    const database = {
      referenceUpload: {
        findMany: vi.fn().mockResolvedValue([
          { id: "old-1", objectKey: "references/user-1/a.webp" },
          { id: "old-2", objectKey: "references/user-1/b.webp" },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };
    const result = await cleanupDeletedUploads(database as never, storage, 30);
    expect(result).toMatchObject({ candidates: 2, deleted: 2, failed: 0 });
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(database.referenceUpload.deleteMany).toHaveBeenCalledTimes(2);
    expect(database.adminAuditLog.create).toHaveBeenCalledOnce();
  });

  it("retains failed objects for a later retry", async () => {
    const database = {
      referenceUpload: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "old-1", objectKey: "references/user-1/a.webp" }]),
        deleteMany: vi.fn(),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const storage = { delete: vi.fn().mockRejectedValue(new Error("offline")) };
    const result = await cleanupDeletedUploads(database as never, storage, 30);
    expect(result).toMatchObject({ candidates: 1, deleted: 0, failed: 1 });
    expect(database.referenceUpload.deleteMany).not.toHaveBeenCalled();
  });
});
