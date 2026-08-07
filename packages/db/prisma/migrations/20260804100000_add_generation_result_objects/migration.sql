ALTER TABLE "GenerationResult"
ADD COLUMN "objectKey" TEXT,
ADD COLUMN "thumbnailObjectKey" TEXT,
ADD COLUMN "checksumSha256" TEXT,
ADD COLUMN "thumbnailWidth" INTEGER,
ADD COLUMN "thumbnailHeight" INTEGER,
ADD COLUMN "thumbnailByteSize" INTEGER;

CREATE UNIQUE INDEX "GenerationResult_objectKey_key" ON "GenerationResult"("objectKey");
CREATE UNIQUE INDEX "GenerationResult_thumbnailObjectKey_key" ON "GenerationResult"("thumbnailObjectKey");

ALTER TABLE "GenerationResult"
ADD CONSTRAINT "GenerationResult_object_metadata_check" CHECK (
  ("objectKey" IS NULL AND "thumbnailObjectKey" IS NULL AND "checksumSha256" IS NULL
    AND "thumbnailWidth" IS NULL AND "thumbnailHeight" IS NULL AND "thumbnailByteSize" IS NULL)
  OR
  ("objectKey" IS NOT NULL AND "thumbnailObjectKey" IS NOT NULL
    AND "checksumSha256" ~ '^[0-9a-f]{64}$'
    AND "thumbnailWidth" > 0 AND "thumbnailHeight" > 0 AND "thumbnailByteSize" > 0)
);
