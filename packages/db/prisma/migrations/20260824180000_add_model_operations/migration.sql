CREATE TYPE "ProviderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
CREATE TYPE "ModelStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ModelConfigVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ROLLED_BACK');

CREATE TABLE "Provider" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProviderStatus" NOT NULL DEFAULT 'DRAFT',
  "baseUrl" TEXT,
  "secretRef" TEXT,
  "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "retryLimit" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Provider_code_key" ON "Provider"("code");

CREATE TABLE "Model" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerModelId" TEXT NOT NULL,
  "status" "ModelStatus" NOT NULL DEFAULT 'DRAFT',
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "capabilities" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Model_code_key" ON "Model"("code");
CREATE INDEX "Model_status_visible_idx" ON "Model"("status", "visible");
CREATE INDEX "Model_providerId_status_idx" ON "Model"("providerId", "status");
ALTER TABLE "Model" ADD CONSTRAINT "Model_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ModelRoute" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 100,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "health" TEXT NOT NULL DEFAULT 'unknown',
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelRoute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelRoute_weight_check" CHECK ("weight" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "ModelRoute_modelId_providerId_key" ON "ModelRoute"("modelId", "providerId");
CREATE INDEX "ModelRoute_enabled_priority_idx" ON "ModelRoute"("enabled", "priority");
ALTER TABLE "ModelRoute" ADD CONSTRAINT "ModelRoute_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelRoute" ADD CONSTRAINT "ModelRoute_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ModelConfigVersion" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ModelConfigVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "config" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelConfigVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelConfigVersion_modelId_version_key" ON "ModelConfigVersion"("modelId", "version");
CREATE INDEX "ModelConfigVersion_modelId_status_idx" ON "ModelConfigVersion"("modelId", "status");
ALTER TABLE "ModelConfigVersion" ADD CONSTRAINT "ModelConfigVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationTask"
  ADD COLUMN "modelConfigSnapshot" JSONB,
  ADD COLUMN "modelConfigVersionId" TEXT;
ALTER TABLE "GenerationTask" ADD CONSTRAINT "GenerationTask_modelConfigVersionId_fkey" FOREIGN KEY ("modelConfigVersionId") REFERENCES "ModelConfigVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "GenerationTask_modelConfigVersionId_idx" ON "GenerationTask"("modelConfigVersionId");

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt") VALUES
  ('permission-models-read', 'models:read', '查看模型配置', '查看模型、供应商、路由和配置版本', 'MEDIUM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-models-write', 'models:write', '编辑模型配置', '创建模型和配置版本草稿', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-models-publish', 'models:publish', '发布与回滚模型配置', '发布、灰度或回滚模型配置', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "AdminRole" r CROSS JOIN "AdminPermission" p
WHERE r."code" IN ('owner', 'operator') AND p."code" IN ('models:read', 'models:write', 'models:publish')
ON CONFLICT DO NOTHING;
