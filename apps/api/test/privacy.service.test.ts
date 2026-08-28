import { describe, expect, it, vi } from "vitest";
import { PrivacyService } from "../src/modules/privacy/privacy.service";

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "privacy-1",
  userId: "user-1",
  type: "DELETE",
  status: "REQUESTED",
  reason: "我要删除账户",
  requestedAt: new Date("2026-08-25T00:00:00Z"),
  processedAt: null,
  decisionNote: null,
  user: { id: "user-1", phone: "13812345678", status: "ACTIVE" },
  ...overrides,
});

describe("PrivacyService", () => {
  it("returns an existing pending delete request idempotently", async () => {
    const repository = {
      findPendingOwnRequest: vi.fn().mockResolvedValue(record()),
      createRequest: vi.fn(),
    };
    const result = await new PrivacyService(repository as never).create("user-1", {
      reason: "再次申请",
    });
    expect(result.id).toBe("privacy-1");
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it("rejects a blank reason", async () => {
    const repository = { findPendingOwnRequest: vi.fn() };
    await expect(
      new PrivacyService(repository as never).create("user-1", { reason: "  " }),
    ).rejects.toThrow("请填写操作原因");
  });

  it("maps admin list records and validates pagination", async () => {
    const repository = { list: vi.fn().mockResolvedValue([[record()], 1]) };
    const service = new PrivacyService(repository as never);
    await expect(service.listAdmin(0, 20)).rejects.toThrow("页码不正确");
    const result = await service.listAdmin(1, 20);
    expect(result.items[0]).toMatchObject({ phoneMasked: "138****5678", status: "requested" });
  });

  it("creates export requests independently from delete requests", async () => {
    const repository = {
      findPendingOwnRequest: vi.fn().mockResolvedValue(null),
      createRequest: vi.fn().mockResolvedValue(record({ type: "EXPORT", reason: "导出数据" })),
    };
    const result = await new PrivacyService(repository as never).create("user-1", {
      type: "export",
      reason: "导出我的数据",
    });
    expect(repository.findPendingOwnRequest).toHaveBeenCalledWith("user-1", "EXPORT");
    expect(repository.createRequest).toHaveBeenCalledWith({
      userId: "user-1",
      type: "EXPORT",
      reason: "导出我的数据",
    });
    expect(result.type).toBe("export");
  });

  it("only exposes a completed export belonging to the current user", async () => {
    const repository = {
      getCompletedExport: vi.fn().mockResolvedValue(null),
    };
    await expect(
      new PrivacyService(repository as never).exportOwn("user-1", "other-request"),
    ).rejects.toThrow("尚未完成");
    expect(repository.getCompletedExport).toHaveBeenCalledWith("user-1", "other-request");
  });

  it("does not reopen a rejected request", async () => {
    const repository = {
      findRequest: vi.fn().mockResolvedValue(record({ status: "REJECTED" })),
      completeDelete: vi.fn(),
      completeExport: vi.fn(),
    };
    await expect(
      new PrivacyService(repository as never).complete("privacy-1", "admin-1", "处理请求"),
    ).rejects.toThrow("不能重新完成");
    expect(repository.completeDelete).not.toHaveBeenCalled();
  });

  it("previews deleted uploads without touching storage", async () => {
    const repository = {
      listDeletedUploads: vi
        .fn()
        .mockResolvedValue([{ id: "upload-1", objectKey: "references/user-1/file.webp" }]),
      deleteUploadMetadata: vi.fn(),
      recordCleanupAudit: vi.fn().mockResolvedValue(undefined),
    };
    const storage = { delete: vi.fn() };
    const result = await new PrivacyService(repository as never).cleanupDeletedUploads({
      actorId: "admin-1",
      retentionDays: 30,
      dryRun: true,
      reason: "预览清理",
      requestId: "req-1",
      storage,
    });
    expect(result).toMatchObject({ dryRun: true, candidates: 1, deleted: 0, failed: 0 });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(repository.recordCleanupAudit).toHaveBeenCalled();
  });

  it("deletes storage first and keeps failed objects retryable", async () => {
    const repository = {
      listDeletedUploads: vi.fn().mockResolvedValue([
        { id: "upload-1", objectKey: "references/user-1/file.webp" },
        { id: "upload-2", objectKey: "references/user-1/other.webp" },
      ]),
      deleteUploadMetadata: vi.fn().mockResolvedValue({ count: 1 }),
      recordCleanupAudit: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      delete: vi
        .fn()
        .mockRejectedValueOnce(new Error("object store unavailable"))
        .mockResolvedValueOnce(undefined),
    };
    const result = await new PrivacyService(repository as never).cleanupDeletedUploads({
      actorId: "admin-1",
      retentionDays: 7,
      dryRun: false,
      reason: "执行清理",
      requestId: "req-2",
      storage,
    });
    expect(result).toMatchObject({ candidates: 2, deleted: 1, failed: 1 });
    expect(repository.deleteUploadMetadata).toHaveBeenCalledTimes(1);
    expect(repository.deleteUploadMetadata.mock.calls[0][0]).toBe("upload-2");
  });
});
