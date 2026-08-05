CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "GenerationTask"
ADD COLUMN "inputModerationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "outputModerationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "GenerationResult"
ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "GenerationTask"
SET "inputModerationStatus" = 'APPROVED', "outputModerationStatus" = 'APPROVED'
WHERE "status" IN ('SUCCEEDED', 'PARTIALLY_SUCCEEDED');

UPDATE "GenerationResult"
SET "moderationStatus" = 'APPROVED';

ALTER TABLE "GenerationResult"
ADD CONSTRAINT "GenerationResult_published_moderation_check" CHECK (
  "objectKey" IS NULL OR "moderationStatus" = 'APPROVED'
);
