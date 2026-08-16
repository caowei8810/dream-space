-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "AdminPermissionRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
ALTER TYPE "AdminRole" RENAME TO "LegacyAdminRole";

-- Extend existing administrator accounts before replacing the legacy role column.
ALTER TABLE "AdminUser"
  ADD COLUMN "employeeNo" TEXT,
  ADD COLUMN "status" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT;

UPDATE "AdminUser"
SET "employeeNo" = 'LEGACY-' || UPPER(SUBSTRING(MD5("id"), 1, 8)),
    "status" = CASE WHEN "active" THEN 'ACTIVE'::"AdminUserStatus" ELSE 'SUSPENDED'::"AdminUserStatus" END;

ALTER TABLE "AdminUser" ALTER COLUMN "employeeNo" SET NOT NULL;

-- CreateTable
CREATE TABLE "AdminRole" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPermission" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "risk" "AdminPermissionRisk" NOT NULL DEFAULT 'LOW',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminUserRole" (
  "adminUserId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,
  CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("adminUserId", "roleId")
);

CREATE TABLE "AdminRolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "actorAdminUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_employeeNo_key" ON "AdminUser"("employeeNo");
CREATE INDEX "AdminUser_status_updatedAt_idx" ON "AdminUser"("status", "updatedAt");
CREATE INDEX "AdminUser_displayName_idx" ON "AdminUser"("displayName");
CREATE UNIQUE INDEX "AdminRole_code_key" ON "AdminRole"("code");
CREATE INDEX "AdminRole_active_name_idx" ON "AdminRole"("active", "name");
CREATE UNIQUE INDEX "AdminPermission_code_key" ON "AdminPermission"("code");
CREATE INDEX "AdminPermission_active_risk_idx" ON "AdminPermission"("active", "risk");
CREATE INDEX "AdminUserRole_roleId_adminUserId_idx" ON "AdminUserRole"("roleId", "adminUserId");
CREATE INDEX "AdminRolePermission_permissionId_roleId_idx" ON "AdminRolePermission"("permissionId", "roleId");
CREATE INDEX "AdminAuditLog_actorAdminUserId_createdAt_idx" ON "AdminAuditLog"("actorAdminUserId", "createdAt");
CREATE INDEX "AdminAuditLog_resourceType_resourceId_createdAt_idx" ON "AdminAuditLog"("resourceType", "resourceId", "createdAt");
CREATE INDEX "AdminAuditLog_requestId_idx" ON "AdminAuditLog"("requestId");

ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AdminPermission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing roles and permissions as normalized built-in records.
INSERT INTO "AdminRole" ("id", "code", "name", "description", "system", "active", "updatedAt") VALUES
  ('role-owner', 'owner', '系统负责人', '平台最高权限角色', true, true, CURRENT_TIMESTAMP),
  ('role-operator', 'operator', '内容运营', '管理任务和灵感内容', true, true, CURRENT_TIMESTAMP),
  ('role-viewer', 'viewer', '只读审阅员', '只读查看任务和灵感', true, true, CURRENT_TIMESTAMP);

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "updatedAt") VALUES
  ('permission-tasks-read', 'tasks:read', '查看生成任务', '查看生成任务', 'LOW', true, CURRENT_TIMESTAMP),
  ('permission-inspirations-read', 'inspirations:read', '查看灵感', '查看灵感', 'LOW', true, CURRENT_TIMESTAMP),
  ('permission-inspirations-write', 'inspirations:write', '管理灵感', '管理灵感', 'MEDIUM', true, CURRENT_TIMESTAMP),
  ('permission-admin-accounts-read', 'admin-accounts:read', '查看管理员账号', '查看管理员账号', 'MEDIUM', true, CURRENT_TIMESTAMP),
  ('permission-admin-accounts-write', 'admin-accounts:write', '管理管理员账号', '管理管理员账号', 'HIGH', true, CURRENT_TIMESTAMP),
  ('permission-admin-sessions-revoke', 'admin-sessions:revoke', '撤销管理员会话', '撤销管理员会话', 'HIGH', true, CURRENT_TIMESTAMP);

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT 'role-owner', "id" FROM "AdminPermission";
INSERT INTO "AdminRolePermission" ("roleId", "permissionId") VALUES
  ('role-operator', 'permission-tasks-read'),
  ('role-operator', 'permission-inspirations-read'),
  ('role-operator', 'permission-inspirations-write'),
  ('role-viewer', 'permission-tasks-read'),
  ('role-viewer', 'permission-inspirations-read');

INSERT INTO "AdminUserRole" ("adminUserId", "roleId")
SELECT "id", CASE "role"::text
  WHEN 'ADMIN' THEN 'role-owner'
  WHEN 'OPERATOR' THEN 'role-operator'
  ELSE 'role-viewer'
END
FROM "AdminUser";

DROP INDEX "AdminUser_active_role_idx";
ALTER TABLE "AdminUser" DROP COLUMN "active", DROP COLUMN "role";
DROP TYPE "LegacyAdminRole";
