import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";

export {
  InspirationCategory as DatabaseInspirationCategory,
  InspirationSourceType,
  InspirationStatus,
} from "./generated/client/enums";
export type { InspirationModel } from "./generated/client/models/Inspiration";

const defaultDatabaseUrl = "postgresql://dreamspace:dreamspace_dev@localhost:5432/dreamspace";

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
