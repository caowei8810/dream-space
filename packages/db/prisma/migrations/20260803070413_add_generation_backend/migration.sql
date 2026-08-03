-- CreateEnum
CREATE TYPE "GenerationTaskStatus" AS ENUM ('QUEUED', 'GENERATING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotaLedgerType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'RELEASE');

-- CreateTable
CREATE TABLE "GenerationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "draft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GenerationTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ratio" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "referenceImageUrls" JSONB NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "queueJobId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationTaskEvent" (
    "id" BIGSERIAL NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "GenerationTaskStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaAccount" (
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 100,
    "available" INTEGER NOT NULL DEFAULT 100,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "QuotaLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "type" "QuotaLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationSession_userId_updatedAt_idx" ON "GenerationSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "GenerationTask_sessionId_createdAt_idx" ON "GenerationTask"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationTask_userId_status_createdAt_idx" ON "GenerationTask"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationTask_userId_idempotencyKey_key" ON "GenerationTask"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GenerationResult_taskId_idx" ON "GenerationResult"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationResult_taskId_index_key" ON "GenerationResult"("taskId", "index");

-- CreateIndex
CREATE INDEX "GenerationTaskEvent_taskId_id_idx" ON "GenerationTaskEvent"("taskId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaLedgerEntry_idempotencyKey_key" ON "QuotaLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "QuotaLedgerEntry_userId_createdAt_idx" ON "QuotaLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuotaLedgerEntry_taskId_idx" ON "QuotaLedgerEntry"("taskId");

-- AddForeignKey
ALTER TABLE "GenerationSession" ADD CONSTRAINT "GenerationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTask" ADD CONSTRAINT "GenerationTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTask" ADD CONSTRAINT "GenerationTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationResult" ADD CONSTRAINT "GenerationResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTaskEvent" ADD CONSTRAINT "GenerationTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaAccount" ADD CONSTRAINT "QuotaAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaLedgerEntry" ADD CONSTRAINT "QuotaLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaLedgerEntry" ADD CONSTRAINT "QuotaLedgerEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
