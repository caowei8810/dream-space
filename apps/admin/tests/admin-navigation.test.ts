import { describe, expect, it } from "vitest";
import { adminNavigationItems, requiredPermissionForPath } from "../lib/admin-navigation";

describe("admin navigation", () => {
  it("maps current and nested routes to their required permission", () => {
    expect(requiredPermissionForPath("/dashboard")).toBe("dashboard:read");
    expect(requiredPermissionForPath("/tasks")).toBe("tasks:read");
    expect(requiredPermissionForPath("/tasks/task-1")).toBe("tasks:read");
    expect(requiredPermissionForPath("/inspirations")).toBe("inspirations:read");
    expect(requiredPermissionForPath("/admin-users")).toBe("admin-accounts:read");
    expect(requiredPermissionForPath("/roles/role-1")).toBe("roles:read");
    expect(requiredPermissionForPath("/models")).toBe("models:read");
    expect(requiredPermissionForPath("/privacy")).toBe("privacy:read");
  });

  it("does not claim routes outside the available admin modules", () => {
    expect(requiredPermissionForPath("/login")).toBeUndefined();
    expect(requiredPermissionForPath("/unknown")).toBeUndefined();
  });

  it("uses unique paths for navigation items", () => {
    expect(new Set(adminNavigationItems.map((item) => item.href)).size).toBe(
      adminNavigationItems.length,
    );
  });
});
