CREATE TYPE "RiskRuleMatchType" AS ENUM ('KEYWORD', 'REGEX');
CREATE TYPE "RiskRuleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "RiskAction" AS ENUM ('REJECT', 'RESTRICT', 'BAN', 'MANUAL_REVIEW');
CREATE TYPE "RiskHitStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');
CREATE TYPE "RiskSubjectType" AS ENUM ('PROMPT');

CREATE TABLE "RiskRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "matchType" "RiskRuleMatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" "RiskAction" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "RiskRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskHit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "ruleId" TEXT,
    "ruleVersion" INTEGER,
    "subjectType" "RiskSubjectType" NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputLength" INTEGER NOT NULL,
    "action" "RiskAction" NOT NULL,
    "status" "RiskHitStatus" NOT NULL DEFAULT 'RESOLVED',
    "decision" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "RiskHit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskRule_code_version_key" ON "RiskRule"("code", "version");
CREATE INDEX "RiskRule_status_enabled_priority_idx" ON "RiskRule"("status", "enabled", "priority");
CREATE INDEX "RiskRule_startsAt_endsAt_idx" ON "RiskRule"("startsAt", "endsAt");
CREATE INDEX "RiskHit_userId_createdAt_idx" ON "RiskHit"("userId", "createdAt");
CREATE UNIQUE INDEX "RiskHit_userId_requestId_key" ON "RiskHit"("userId", "requestId");
CREATE INDEX "RiskHit_status_createdAt_idx" ON "RiskHit"("status", "createdAt");
CREATE INDEX "RiskHit_ruleId_createdAt_idx" ON "RiskHit"("ruleId", "createdAt");
CREATE INDEX "RiskHit_taskId_idx" ON "RiskHit"("taskId");

ALTER TABLE "RiskHit" ADD CONSTRAINT "RiskHit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskHit" ADD CONSTRAINT "RiskHit_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskHit" ADD CONSTRAINT "RiskHit_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "RiskRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt") VALUES
  ('permission-risk-read', 'risk:read', '查看提示词风控规则', '查看提示词风控规则和命中记录', 'MEDIUM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-risk-write', 'risk:write', '管理提示词风控规则', '创建、发布和归档提示词风控规则', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "AdminRole" r
JOIN "AdminPermission" p ON p."code" IN ('risk:read', 'risk:write')
WHERE r."code" = 'owner'
ON CONFLICT DO NOTHING;
