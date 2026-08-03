-- CreateEnum
CREATE TYPE "GenerationRatio" AS ENUM ('smart', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16');

-- CreateEnum
CREATE TYPE "GenerationResolution" AS ENUM ('2K', '4K');

-- AlterTable
ALTER TABLE "GenerationTask"
  ALTER COLUMN "ratio" TYPE "GenerationRatio" USING ("ratio"::"GenerationRatio"),
  ALTER COLUMN "resolution" TYPE "GenerationResolution" USING ("resolution"::"GenerationResolution");

-- Generation invariants
ALTER TABLE "GenerationTask"
  ADD CONSTRAINT "GenerationTask_imageCount_check" CHECK ("imageCount" BETWEEN 1 AND 8),
  ADD CONSTRAINT "GenerationTask_costs_check" CHECK ("unitCost" > 0 AND "totalCost" > 0);

ALTER TABLE "GenerationResult"
  ADD CONSTRAINT "GenerationResult_dimensions_check" CHECK (
    "index" >= 0 AND "width" > 0 AND "height" > 0 AND "byteSize" > 0
  );

ALTER TABLE "QuotaAccount"
  ADD CONSTRAINT "QuotaAccount_balances_check" CHECK (
    "total" >= 0 AND
    "available" >= 0 AND
    "reserved" >= 0 AND
    "available" + "reserved" <= "total"
  );

ALTER TABLE "QuotaLedgerEntry"
  ADD CONSTRAINT "QuotaLedgerEntry_amount_check" CHECK ("amount" > 0 AND "balanceAfter" >= 0);
