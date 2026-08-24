CREATE TYPE "BillingRuleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "BillingPromotionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "BillingRule" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "standardUnitCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" "BillingRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingRule_version_key" ON "BillingRule"("version");
CREATE INDEX "BillingRule_status_publishedAt_idx" ON "BillingRule"("status", "publishedAt");

CREATE TABLE "BillingPromotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountBps" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stacking" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "BillingPromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "ruleVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingPromotion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingPromotion_code_key" ON "BillingPromotion"("code");
CREATE INDEX "BillingPromotion_status_startsAt_endsAt_priority_idx" ON "BillingPromotion"("status", "startsAt", "endsAt", "priority");
CREATE INDEX "BillingPromotion_ruleVersion_idx" ON "BillingPromotion"("ruleVersion");
ALTER TABLE "BillingPromotion" ADD CONSTRAINT "BillingPromotion_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "BillingRule"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BillingRule" ("id", "version", "standardUnitCents", "currency", "status", "publishedAt", "updatedAt")
VALUES ('billing-rule-v1', 1, 10, 'CNY', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("version") DO NOTHING;

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt") VALUES
  ('permission-billing-read', 'billing:read', '查看计费规则', '查看标准价格和活动折扣', 'MEDIUM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-billing-write', 'billing:write', '编辑计费规则', '创建计费规则和活动草稿', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-billing-publish', 'billing:publish', '发布计费规则', '发布或下线计费规则和活动', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;
INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "AdminRole" r JOIN "AdminPermission" p ON p."code" IN ('billing:read', 'billing:write', 'billing:publish')
WHERE r."code" IN ('owner', 'operator') ON CONFLICT DO NOTHING;

CREATE TYPE "CashLedgerType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'RELEASE', 'REFUND', 'ADJUSTMENT');
CREATE TABLE "CashAccount" (
    "userId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "CashAccount_balance_check" CHECK ("available" >= 0 AND "reserved" >= 0)
);
CREATE INDEX "CashAccount_available_reserved_idx" ON "CashAccount"("available", "reserved");
CREATE TABLE "CashLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "type" "CashLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashLedgerEntry_idempotencyKey_key" ON "CashLedgerEntry"("idempotencyKey");
CREATE INDEX "CashLedgerEntry_userId_createdAt_idx" ON "CashLedgerEntry"("userId", "createdAt");
CREATE INDEX "CashLedgerEntry_taskId_type_idx" ON "CashLedgerEntry"("taskId", "type");
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_account_fkey" FOREIGN KEY ("userId") REFERENCES "CashAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD COLUMN "billingRuleVersion" INTEGER;
ALTER TABLE "GenerationTask" ADD COLUMN "billingPromotionCode" TEXT;
ALTER TABLE "GenerationTask" ADD COLUMN "billingUnitCents" INTEGER;
ALTER TABLE "GenerationTask" ADD COLUMN "billingTotalCents" INTEGER;
ALTER TABLE "GenerationTask" ADD COLUMN "entitlementReserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GenerationTask" ADD COLUMN "cashReservedCents" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REFUNDED');
CREATE TYPE "EntitlementLedgerType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'RELEASE', 'EXPIRE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'COMPLETED', 'FAILED');

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT', "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_status_sortOrder_idx" ON "Plan"("status", "sortOrder");

CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "version" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL, "imageCount" INTEGER NOT NULL, "validDays" INTEGER NOT NULL,
    "modelAllowlist" JSONB, "resolutionAllowlist" JSONB, "dailyLimit" INTEGER, "concurrencyLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");
CREATE INDEX "PlanVersion_planId_createdAt_idx" ON "PlanVersion"("planId", "createdAt");
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BillingOrder" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planVersionId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING', "amountCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0, "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT, "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "BillingOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingOrder_idempotencyKey_key" ON "BillingOrder"("idempotencyKey");
CREATE UNIQUE INDEX "BillingOrder_providerOrderId_key" ON "BillingOrder"("providerOrderId");
CREATE INDEX "BillingOrder_userId_createdAt_idx" ON "BillingOrder"("userId", "createdAt");
CREATE INDEX "BillingOrder_status_createdAt_idx" ON "BillingOrder"("status", "createdAt");
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "providerEventId" TEXT NOT NULL, "orderId" TEXT,
    "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED', "payload" JSONB NOT NULL,
    "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");
CREATE INDEX "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserEntitlement" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planVersionId" TEXT NOT NULL, "orderId" TEXT,
    "available" INTEGER NOT NULL, "reserved" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "UserEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserEntitlement_orderId_key" ON "UserEntitlement"("orderId");
CREATE INDEX "UserEntitlement_userId_status_expiresAt_idx" ON "UserEntitlement"("userId", "status", "expiresAt");
ALTER TABLE "UserEntitlement" ADD CONSTRAINT "UserEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserEntitlement" ADD CONSTRAINT "UserEntitlement_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserEntitlement" ADD CONSTRAINT "UserEntitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EntitlementLedgerEntry" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "entitlementId" TEXT NOT NULL, "taskId" TEXT,
    "type" "EntitlementLedgerType" NOT NULL, "amount" INTEGER NOT NULL, "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntitlementLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EntitlementLedgerEntry_idempotencyKey_key" ON "EntitlementLedgerEntry"("idempotencyKey");
CREATE INDEX "EntitlementLedgerEntry_userId_createdAt_idx" ON "EntitlementLedgerEntry"("userId", "createdAt");
CREATE INDEX "EntitlementLedgerEntry_entitlementId_createdAt_idx" ON "EntitlementLedgerEntry"("entitlementId", "createdAt");
CREATE INDEX "EntitlementLedgerEntry_taskId_type_idx" ON "EntitlementLedgerEntry"("taskId", "type");
ALTER TABLE "EntitlementLedgerEntry" ADD CONSTRAINT "EntitlementLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementLedgerEntry" ADD CONSTRAINT "EntitlementLedgerEntry_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "UserEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementLedgerEntry" ADD CONSTRAINT "EntitlementLedgerEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt") VALUES
  ('permission-plans-read', 'plans:read', '查看套餐', '查看已发布和草稿套餐', 'MEDIUM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-plans-write', 'plans:write', '编辑套餐', '创建套餐和版本草稿', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-plans-publish', 'plans:publish', '发布套餐', '发布或下线套餐版本', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-refunds-create', 'refunds:create', '发起退款', '按订单和权益状态执行退款', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;
INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "AdminRole" r JOIN "AdminPermission" p ON p."code" IN ('plans:read', 'plans:write', 'plans:publish', 'refunds:create')
WHERE r."code" IN ('owner', 'operator') ON CONFLICT DO NOTHING;
