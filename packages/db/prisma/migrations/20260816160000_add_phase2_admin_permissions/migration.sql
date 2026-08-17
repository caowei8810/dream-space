INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "updatedAt") VALUES
  ('permission-dashboard-read', 'dashboard:read', '查看运营总览', '查看运营总览', 'LOW', true, CURRENT_TIMESTAMP),
  ('permission-roles-read', 'roles:read', '查看角色与权限', '查看角色与权限', 'MEDIUM', true, CURRENT_TIMESTAMP),
  ('permission-roles-write', 'roles:write', '管理角色与权限', '管理角色与权限', 'HIGH', true, CURRENT_TIMESTAMP),
  ('permission-permissions-read', 'permissions:read', '查看权限点', '查看权限点', 'MEDIUM', true, CURRENT_TIMESTAMP);

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT 'role-owner', "id" FROM "AdminPermission"
WHERE "code" IN ('dashboard:read', 'roles:read', 'roles:write', 'permissions:read');

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT 'role-viewer', "id" FROM "AdminPermission"
WHERE "code" = 'dashboard:read';
