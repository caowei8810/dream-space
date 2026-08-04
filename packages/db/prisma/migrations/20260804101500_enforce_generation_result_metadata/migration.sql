ALTER TABLE "GenerationResult"
DROP CONSTRAINT "GenerationResult_object_metadata_check";

ALTER TABLE "GenerationResult"
ADD CONSTRAINT "GenerationResult_object_metadata_check" CHECK (
  ("objectKey" IS NULL AND "thumbnailObjectKey" IS NULL AND "checksumSha256" IS NULL
    AND "thumbnailWidth" IS NULL AND "thumbnailHeight" IS NULL AND "thumbnailByteSize" IS NULL)
  OR
  ("objectKey" IS NOT NULL AND "thumbnailObjectKey" IS NOT NULL
    AND "checksumSha256" IS NOT NULL AND "checksumSha256" ~ '^[0-9a-f]{64}$'
    AND "thumbnailWidth" IS NOT NULL AND "thumbnailWidth" > 0
    AND "thumbnailHeight" IS NOT NULL AND "thumbnailHeight" > 0
    AND "thumbnailByteSize" IS NOT NULL AND "thumbnailByteSize" > 0)
);
