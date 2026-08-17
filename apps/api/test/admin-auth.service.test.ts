import type { AdminLoginRequest } from "@dream-space/contracts";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AdminAuthService } from "../src/modules/admin/admin-auth.service";

function challenge(id = "admin-challenge") {
  return {
    id,
    phone: "18800000000",
    codeHash: createHash("sha256").update(`${id}:123456`).digest("hex"),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    createdAt: new Date(),
  };
}

function admin(role: "owner" | "operator" | "viewer" = "owner") {
  const permissions =
    role === "owner"
      ? [
          "tasks:read",
          "inspirations:read",
          "inspirations:publish",
          "admin-accounts:read",
          "admin-accounts:write",
          "admin-sessions:revoke",
        ]
      : role === "operator"
        ? ["tasks:read", "inspirations:read", "inspirations:publish"]
        : ["tasks:read", "inspirations:read"];
  return {
    id: "admin-1",
    employeeNo: "ADM0001",
    phone: "18800000000",
    displayName: "本地管理员",
    status: "ACTIVE" as const,
    roles: [
      {
        role: {
          id: `role-${role}`,
          code: role,
          name: role,
          system: true,
          active: true,
          permissions: permissions.map((code) => ({
            permission: { code, active: true },
          })),
        },
      },
    ],
    createdAt: new Date("2026-08-03T00:00:00Z"),
    updatedAt: new Date("2026-08-03T00:00:00Z"),
  };
}

describe("admin auth service", () => {
  it("creates an isolated admin challenge and session cookie payload", async () => {
    const repository = {
      findActiveAdminByPhone: vi.fn().mockResolvedValue(admin()),
      findReusableChallenge: vi.fn().mockResolvedValue(null),
      createChallenge: vi.fn().mockResolvedValue(undefined),
      findChallenge: vi.fn().mockResolvedValue(challenge()),
      recordFailedAttempt: vi.fn(),
      completeLogin: vi.fn().mockResolvedValue(admin()),
      findSession: vi.fn(),
      deleteSession: vi.fn(),
    };
    const service = new AdminAuthService(repository as never);

    const sent = await service.sendCode({ phone: "188 0000 0000" });
    expect(sent.demoCode).toBe("123456");
    expect(repository.createChallenge).toHaveBeenCalledOnce();

    const result = await service.login({
      phone: "18800000000",
      challengeId: "admin-challenge",
      code: "123456",
    } satisfies AdminLoginRequest);
    expect(result.response.user).toMatchObject({
      displayName: "本地管理员",
      employeeNo: "ADM0001",
      roles: [expect.objectContaining({ code: "owner" })],
      permissions: expect.arrayContaining(["tasks:read", "inspirations:publish"]),
    });
    expect(repository.completeLogin).toHaveBeenCalledOnce();
  });

  it("rejects a normal user phone from the admin login flow", async () => {
    const repository = {
      findActiveAdminByPhone: vi.fn().mockResolvedValue(null),
    };
    const service = new AdminAuthService(repository as never);

    await expect(service.sendCode({ phone: "13800138000" })).rejects.toThrow("管理员账号不存在");
  });

  it("returns 401 without an admin session and 403 without the required role permission", async () => {
    const repository = {
      findSession: vi.fn().mockResolvedValue(admin("viewer")),
    };
    const service = new AdminAuthService(repository as never);

    await expect(service.requirePermission(undefined, "tasks:read")).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.requirePermission("dreamspace_admin_session=viewer-token", "inspirations:publish"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.requirePermission("dreamspace_admin_session=viewer-token", "tasks:read"),
    ).resolves.toMatchObject({ roles: [expect.objectContaining({ code: "viewer" })] });
  });
});
