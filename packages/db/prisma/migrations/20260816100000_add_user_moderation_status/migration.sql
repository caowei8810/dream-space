CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'BANNED');

ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "statusReason" TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3);

CREATE INDEX "User_status_updatedAt_idx" ON "User"("status", "updatedAt");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "updatedAt") VALUES
  ('permission-users-read', 'users:read', '查看注册用户', '查看注册用户', 'MEDIUM', true, CURRENT_TIMESTAMP),
  ('permission-users-write', 'users:write', '处置注册用户状态', '处置注册用户状态', 'HIGH', true, CURRENT_TIMESTAMP),
  ('permission-user-sessions-revoke', 'user-sessions:revoke', '撤销用户会话', '撤销用户会话', 'HIGH', true, CURRENT_TIMESTAMP);

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT 'role-owner', "id" FROM "AdminPermission"
WHERE "code" IN ('users:read', 'users:write', 'user-sessions:revoke');
