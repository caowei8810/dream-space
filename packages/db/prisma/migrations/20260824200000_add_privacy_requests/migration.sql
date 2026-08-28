CREATE TYPE "PrivacyRequestType" AS ENUM ('DELETE', 'EXPORT');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED');
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';

CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processedById" TEXT,
  "decisionNote" TEXT,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivacyRequest_userId_type_status_idx" ON "PrivacyRequest"("userId", "type", "status");
CREATE INDEX "PrivacyRequest_status_requestedAt_idx" ON "PrivacyRequest"("status", "requestedAt");
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt") VALUES
  ('permission-privacy-read', 'privacy:read', '查看隐私请求', '查看账户删除和隐私治理请求', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-privacy-write', 'privacy:write', '处理隐私请求', '完成账户删除等高风险隐私操作', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;
INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "AdminRole" r CROSS JOIN "AdminPermission" p
WHERE r."code" IN ('owner', 'operator') AND p."code" IN ('privacy:read', 'privacy:write')
ON CONFLICT DO NOTHING;
