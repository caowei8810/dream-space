import type { GenerationRatio, GenerationResolution } from "@dream-space/contracts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import {
  GenerationRatio as DatabaseGenerationRatioValue,
  GenerationResolution as DatabaseGenerationResolutionValue,
} from "./generated/client/enums";

export { Prisma } from "./generated/client/client";

export {
  AdminRole as DatabaseAdminRole,
  GenerationTaskStatus as DatabaseGenerationTaskStatus,
  GenerationRatio as DatabaseGenerationRatio,
  GenerationResolution as DatabaseGenerationResolution,
  InspirationCategory as DatabaseInspirationCategory,
  InspirationSourceType,
  InspirationStatus,
  QuotaLedgerType,
} from "./generated/client/enums";
export type { InspirationModel } from "./generated/client/models/Inspiration";

const defaultDatabaseUrl = "postgresql://dreamspace:dreamspace_dev@localhost:5432/dreamspace";

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

const generationRatioToDatabase = {
  smart: DatabaseGenerationRatioValue.SMART,
  "21:9": DatabaseGenerationRatioValue.RATIO_21_9,
  "16:9": DatabaseGenerationRatioValue.RATIO_16_9,
  "3:2": DatabaseGenerationRatioValue.RATIO_3_2,
  "4:3": DatabaseGenerationRatioValue.RATIO_4_3,
  "1:1": DatabaseGenerationRatioValue.RATIO_1_1,
  "3:4": DatabaseGenerationRatioValue.RATIO_3_4,
  "2:3": DatabaseGenerationRatioValue.RATIO_2_3,
  "9:16": DatabaseGenerationRatioValue.RATIO_9_16,
} as const satisfies Record<GenerationRatio, DatabaseGenerationRatioValue>;

const generationRatioFromDatabase = Object.fromEntries(
  Object.entries(generationRatioToDatabase).map(([contract, database]) => [database, contract]),
) as Record<DatabaseGenerationRatioValue, GenerationRatio>;

export function encodeGenerationRatio(value: GenerationRatio) {
  return generationRatioToDatabase[value];
}

export function decodeGenerationRatio(value: DatabaseGenerationRatioValue) {
  return generationRatioFromDatabase[value];
}

export function encodeGenerationResolution(value: GenerationResolution) {
  return value === "4K"
    ? DatabaseGenerationResolutionValue.K4
    : DatabaseGenerationResolutionValue.K2;
}

export function decodeGenerationResolution(value: DatabaseGenerationResolutionValue) {
  return value === DatabaseGenerationResolutionValue.K4 ? "4K" : "2K";
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
