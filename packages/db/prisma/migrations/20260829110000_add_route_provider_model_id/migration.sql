ALTER TABLE "ModelRoute" ADD COLUMN "providerModelId" TEXT;

UPDATE "ModelRoute" AS route
SET "providerModelId" = model."providerModelId"
FROM "Model" AS model
WHERE route."modelId" = model."id";

ALTER TABLE "ModelRoute" ALTER COLUMN "providerModelId" SET NOT NULL;
