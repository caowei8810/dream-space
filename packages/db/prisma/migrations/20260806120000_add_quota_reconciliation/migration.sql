CREATE TYPE "QuotaReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TYPE "QuotaReconciliationFindingKind" AS ENUM ('MISSING_RESERVE', 'MISSING_RELEASE', 'MISSING_CONSUME', 'SETTLEMENT_AMOUNT_MISMATCH', 'RESERVED_DRIFT', 'AVAILABLE_DRIFT');

CREATE TYPE "QuotaReconciliationFindingStatus" AS ENUM ('OPEN', 'REPAIRED', 'BLOCKED');

CREATE TABLE "QuotaReconciliationRun" (
    "id" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "status" "QuotaReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "scannedUsers" INTEGER NOT NULL DEFAULT 0,
    "scannedTasks" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "repairedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotaReconciliationFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" "QuotaReconciliationFindingKind" NOT NULL,
    "status" "QuotaReconciliationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT NOT NULL,
    "expectedAmount" INTEGER,
    "actualAmount" INTEGER,
    "details" JSONB NOT NULL,
    "repairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaReconciliationFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotaReconciliationRun_windowKey_key" ON "QuotaReconciliationRun"("windowKey");
CREATE INDEX "QuotaReconciliationRun_createdAt_status_idx" ON "QuotaReconciliationRun"("createdAt", "status");
CREATE UNIQUE INDEX "QuotaReconciliationFinding_runId_idempotencyKey_key" ON "QuotaReconciliationFinding"("runId", "idempotencyKey");
CREATE INDEX "QuotaReconciliationFinding_runId_status_idx" ON "QuotaReconciliationFinding"("runId", "status");
CREATE INDEX "QuotaReconciliationFinding_userId_createdAt_idx" ON "QuotaReconciliationFinding"("userId", "createdAt");
CREATE INDEX "QuotaReconciliationFinding_taskId_kind_idx" ON "QuotaReconciliationFinding"("taskId", "kind");

ALTER TABLE "QuotaReconciliationFinding"
  ADD CONSTRAINT "QuotaReconciliationFinding_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "QuotaReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotaReconciliationFinding"
  ADD CONSTRAINT "QuotaReconciliationFinding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotaReconciliationFinding"
  ADD CONSTRAINT "QuotaReconciliationFinding_userId_quotaAccount_fkey"
  FOREIGN KEY ("userId") REFERENCES "QuotaAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
