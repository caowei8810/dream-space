import { describe, expect, it, vi } from "vitest";
import { AdminRolesService } from "../src/modules/admin/admin-roles.service";

const permission = {
  id: "permission-1",
  code: "roles:read",
  name: "角色查看",
  description: "查看角色",
  risk: "LOW",
  active: true,
};

const role = (overrides: Record<string, unknown> = {}) => ({
  id: "role-1",
  code: "operator",
  name: "运营",
  description: "运营角色",
  system: false,
  active: true,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
  permissions: [{ permissionId: permission.id, permission }],
  _count: { users: 0 },
  ...overrides,
});

const actor = { id: "admin-1", roles: [] } as never;

function setup(current = role()) {
  const repository = {
    findById: vi.fn().mockResolvedValue(current),
    findByCode: vi.fn().mockResolvedValue(null),
    findActivePermissions: vi.fn().mockResolvedValue([permission]),
    create: vi.fn().mockResolvedValue(current),
    update: vi.fn().mockResolvedValue(current),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { repository, service: new AdminRolesService(repository as never) };
}

describe("admin roles service", () => {
  it("protects the owner role and a role assigned to the actor", async () => {
    const owner = setup(role({ code: "owner", system: true }));
    await expect(
      owner.service.update(
        "role-1",
        {
          name: "负责人",
          description: "负责人",
          active: true,
          permissionIds: [permission.id],
          reason: "测试保护",
        },
        actor,
      ),
    ).rejects.toThrow("系统负责人角色不可修改");

    const assigned = setup(role({ id: "role-assigned" }));
    const assignedActor = { id: "admin-1", roles: [{ id: "role-assigned" }] } as never;
    await expect(
      assigned.service.remove("role-assigned", { reason: "测试保护" }, assignedActor),
    ).rejects.toThrow("不能修改自己当前所属的角色");
  });

  it("blocks deactivation and deletion while administrators are assigned", async () => {
    const { service } = setup(role({ _count: { users: 1 } }));
    const input = {
      name: "运营",
      description: "运营角色",
      active: false,
      permissionIds: [permission.id],
      reason: "测试关联保护",
    };
    await expect(service.update("role-1", input, actor)).rejects.toThrow(
      "请先移除该角色关联的管理员账号",
    );
    await expect(service.remove("role-1", { reason: "测试关联保护" }, actor)).rejects.toThrow(
      "请先移除该角色关联的管理员账号",
    );
  });

  it("rejects malformed role codes and unknown permissions", async () => {
    const { service, repository } = setup();
    await expect(
      service.create(
        {
          code: "X",
          name: "运营",
          description: "运营角色",
          permissionIds: [permission.id],
          reason: "创建",
        },
        actor,
      ),
    ).rejects.toThrow("角色编码");
    repository.findActivePermissions.mockResolvedValue([]);
    await expect(
      service.create(
        {
          code: "content-operator",
          name: "运营",
          description: "运营角色",
          permissionIds: ["missing"],
          reason: "创建",
        },
        actor,
      ),
    ).rejects.toThrow("所选权限点不存在或已停用");
  });
});
