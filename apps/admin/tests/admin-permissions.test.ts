import type { AdminSessionResponse } from "@dream-space/contracts";
import { describe, expect, it } from "vitest";
import { hasAdminPermission } from "../lib/admin-permissions";

const session = {
  authenticated: true,
  user: {
    id: "admin-1",
    employeeNo: "ADM0001",
    displayName: "运营管理员",
    phoneMasked: "188****0000",
    roles: [{ id: "role-operator", code: "operator", name: "内容运营", system: true }],
    permissions: ["tasks:read", "inspirations:read"],
  },
} satisfies AdminSessionResponse;

describe("admin permissions", () => {
  it("checks permissions from the authenticated session", () => {
    expect(hasAdminPermission(session, "tasks:read")).toBe(true);
    expect(hasAdminPermission(session, "inspirations:publish")).toBe(false);
  });

  it("rejects missing and anonymous sessions", () => {
    expect(hasAdminPermission(null, "tasks:read")).toBe(false);
    expect(hasAdminPermission({ authenticated: false }, "tasks:read")).toBe(false);
  });
});
