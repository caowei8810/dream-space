CREATE TYPE "ModerationReviewStatus" AS ENUM ('OPEN', 'CLAIMED', 'APPROVED', 'REJECTED');
CREATE TYPE "ModerationReviewStage" AS ENUM ('INPUT', 'OUTPUT');
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');
ALTER TYPE "GenerationTaskStatus" ADD VALUE IF NOT EXISTS 'REVIEWING';
ALTER TABLE "GenerationResult" DROP CONSTRAINT IF EXISTS "GenerationResult_published_moderation_check";
ALTER TABLE "GenerationResult" ADD CONSTRAINT "GenerationResult_moderation_object_check" CHECK (
  "objectKey" IS NULL OR "moderationStatus" IN ('PENDING', 'APPROVED')
);

CREATE TABLE "ModerationReview" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "resultId" TEXT,
    "stage" "ModerationReviewStage" NOT NULL,
    "status" "ModerationReviewStatus" NOT NULL DEFAULT 'OPEN',
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT,
    "assignedToId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "resultId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationReview_status_createdAt_idx" ON "ModerationReview"("status", "createdAt");
CREATE INDEX "ModerationReview_assignedToId_status_idx" ON "ModerationReview"("assignedToId", "status");
CREATE INDEX "ModerationReview_taskId_stage_idx" ON "ModerationReview"("taskId", "stage");
CREATE INDEX "ModerationReview_resultId_stage_idx" ON "ModerationReview"("resultId", "stage");
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");
CREATE INDEX "ModerationAppeal_userId_createdAt_idx" ON "ModerationAppeal"("userId", "createdAt");
CREATE INDEX "ModerationAppeal_taskId_idx" ON "ModerationAppeal"("taskId");
CREATE INDEX "ModerationAppeal_resultId_idx" ON "ModerationAppeal"("resultId");

ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_resultId_fkey"
  FOREIGN KEY ("resultId") REFERENCES "GenerationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_resultId_fkey"
  FOREIGN KEY ("resultId") REFERENCES "GenerationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
