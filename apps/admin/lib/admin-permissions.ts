import type { AdminPermission, AdminSessionResponse } from "@dream-space/contracts";

export function hasAdminPermission(
  session: AdminSessionResponse | null,
  permission: AdminPermission,
) {
  return session?.authenticated === true && session.user.permissions.includes(permission);
}
