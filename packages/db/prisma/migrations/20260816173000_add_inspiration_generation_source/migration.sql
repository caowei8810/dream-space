ALTER TABLE "Inspiration"
ADD COLUMN "sourceResultId" TEXT;

CREATE UNIQUE INDEX "Inspiration_sourceResultId_key"
ON "Inspiration"("sourceResultId");

ALTER TABLE "Inspiration"
ADD CONSTRAINT "Inspiration_sourceResultId_fkey"
FOREIGN KEY ("sourceResultId") REFERENCES "GenerationResult"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "Inspiration"
SET "status" = 'ARCHIVED', "publishedAt" = NULL
WHERE "sourceResultId" IS NULL AND "status" = 'PUBLISHED';
