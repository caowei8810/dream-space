import type { AdminUser } from "@dream-space/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminAccountsService } from "../src/modules/admin/admin-accounts.service";

const actor: AdminUser = {
  id: "admin-owner",
  employeeNo: "ADM0001",
  displayName: "系统负责人",
  phoneMasked: "188****0000",
  roles: [{ id: "role-owner", code: "owner", name: "系统负责人", system: true }],
  permissions: ["admin-accounts:read", "admin-accounts:write", "admin-sessions:revoke"],
};

function account(input?: { id?: string; roleCode?: string; status?: string }) {
  const roleCode = input?.roleCode ?? "viewer";
  return {
    id: input?.id ?? "admin-viewer",
    employeeNo: "ADM0002",
    phone: "18800000001",
    displayName: "审阅员",
    status: input?.status ?? "ACTIVE",
    lastLoginAt: null,
    suspendedAt: null,
    suspendedReason: null,
    createdAt: new Date("2026-08-14T00:00:00Z"),
    updatedAt: new Date("2026-08-14T00:00:00Z"),
    roles: [
      {
        roleId: `role-${roleCode}`,
        role: { id: `role-${roleCode}`, code: roleCode, name: roleCode, system: true },
      },
    ],
    _count: { sessions: 0 },
  };
}

function role(id: string, code: string) {
  return { id, code, name: code, system: true, active: true, permissions: [] };
}

describe("admin accounts service", () => {
  it("creates a normalized invited account with validated roles", async () => {
    const created = account({ status: "INVITED" });
    const repository = {
      findConflictingIdentity: vi.fn().mockResolvedValue(null),
      findActiveRoles: vi.fn().mockResolvedValue([role("role-viewer", "viewer")]),
      create: vi.fn().mockResolvedValue(created),
    };
    const service = new AdminAccountsService(repository as never);

    await expect(
      service.create(
        {
          employeeNo: "adm0002",
          displayName: "审阅员",
          phone: "188 0000 0001",
          roleIds: ["role-viewer"],
          reason: "新增审阅账号",
        },
        actor,
        "request-1",
      ),
    ).resolves.toMatchObject({ employeeNo: "ADM0002", status: "invited" });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeNo: "ADM0002",
        phone: "18800000001",
        roleIds: ["role-viewer"],
        actorId: actor.id,
      }),
    );
  });

  it("blocks changing the current administrator's own roles", async () => {
    const current = account({ id: actor.id, roleCode: "owner" });
    const repository = {
      findById: vi.fn().mockResolvedValue(current),
      findConflictingIdentity: vi.fn().mockResolvedValue(null),
      findActiveRoles: vi.fn().mockResolvedValue([role("role-viewer", "viewer")]),
    };
    const service = new AdminAccountsService(repository as never);

    await expect(
      service.update(
        actor.id,
        {
          displayName: "系统负责人",
          roleIds: ["role-viewer"],
          reason: "修改角色",
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("protects the final active owner from suspension", async () => {
    const owner = account({ id: "only-owner", roleCode: "owner" });
    const repository = {
      findById: vi.fn().mockResolvedValue(owner),
      findActiveRoles: vi.fn().mockResolvedValue([]),
      countOtherActiveOwners: vi.fn().mockResolvedValue(0),
    };
    const service = new AdminAccountsService(repository as never);

    await expect(
      service.changeStatus(owner.id, "SUSPENDED", { reason: "人员离职" }, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("blocks revoking the current administrator's own sessions", async () => {
    const repository = { findById: vi.fn().mockResolvedValue(account({ id: actor.id })) };
    const service = new AdminAccountsService(repository as never);

    await expect(
      service.revokeSessions(actor.id, { reason: "清理会话" }, actor),
    ).rejects.toMatchObject({ status: 403 });
  });
});
