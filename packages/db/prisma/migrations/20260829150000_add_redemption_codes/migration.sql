CREATE TYPE "RedemptionCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DISABLED');

CREATE TABLE "RedemptionCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "status" "RedemptionCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "redeemedById" TEXT,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RedemptionCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RedemptionCode_code_key" ON "RedemptionCode"("code");
CREATE INDEX "RedemptionCode_planVersionId_status_idx" ON "RedemptionCode"("planVersionId", "status");
CREATE INDEX "RedemptionCode_redeemedById_redeemedAt_idx" ON "RedemptionCode"("redeemedById", "redeemedAt");

ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
