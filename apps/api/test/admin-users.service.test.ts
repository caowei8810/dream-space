import type { AdminUser } from "@dream-space/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminUsersService } from "../src/modules/admin/admin-users.service";

const actor: AdminUser = {
  id: "admin-owner",
  employeeNo: "ADM0001",
  displayName: "系统负责人",
  phoneMasked: "188****0000",
  roles: [{ id: "role-owner", code: "owner", name: "系统负责人", system: true }],
  permissions: ["users:read", "users:write", "user-sessions:revoke"],
};

function user(input: { id?: string; status?: string } = {}) {
  return {
    id: input.id ?? "user-1",
    phone: "13800138000",
    status: input.status ?? "ACTIVE",
    statusReason: null,
    statusChangedAt: null,
    createdAt: new Date("2026-08-16T00:00:00Z"),
    updatedAt: new Date("2026-08-16T00:00:00Z"),
    _count: { sessions: 2, generationTasks: 3, referenceUploads: 1 },
  };
}

describe("admin users service", () => {
  it("lists registered users with masked phone and operational counts", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [user()], total: 1 }),
    };
    const service = new AdminUsersService(repository as never);

    await expect(service.list({ query: "138", status: "active" })).resolves.toMatchObject({
      total: 1,
      items: [{ phoneMasked: "138****8000", status: "active", generationTaskCount: 3 }],
    });
    expect(repository.list).toHaveBeenCalledWith({
      query: "138",
      status: "active",
      page: 1,
      pageSize: 20,
    });
  });

  it("requires a reason and writes a real status transition", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(user()),
      changeStatus: vi.fn().mockResolvedValue(user({ status: "RESTRICTED" })),
    };
    const service = new AdminUsersService(repository as never);

    await expect(
      service.changeStatus("user-1", "RESTRICTED", { reason: "触发风控" }, actor, "request-1"),
    ).resolves.toMatchObject({ status: "restricted" });
    expect(repository.changeStatus).toHaveBeenCalledWith({
      id: "user-1",
      status: "RESTRICTED",
      reason: "触发风控",
      actorId: actor.id,
      requestId: "request-1",
    });
    await expect(
      service.changeStatus("user-1", "BANNED", { reason: "" }, actor),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("revokes all sessions through the repository", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(user()),
      revokeSessions: vi.fn().mockResolvedValue(2),
    };
    const service = new AdminUsersService(repository as never);

    await expect(
      service.revokeSessions("user-1", { reason: "账号疑似泄露" }, actor),
    ).resolves.toEqual({ revokedSessionCount: 2 });
  });
});
