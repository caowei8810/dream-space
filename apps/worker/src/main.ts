import { parseWorkerEnv } from "@dream-space/config";
import type { GenerationQueueJob } from "@dream-space/contracts";
import { createDatabaseClient, type DatabaseClient } from "@dream-space/db";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { DeterministicMockProvider, GenerationProcessor } from "./generation/generation-processor";
import { PrismaGenerationStore } from "./generation/prisma-generation-store";
import { GENERATION_QUEUE } from "./queues/names";

interface GenerationWorkerRuntime {
  connection: IORedis;
  database: DatabaseClient;
  worker: Worker<GenerationQueueJob>;
}

export function createGenerationWorker(
  redisUrl: string,
  databaseUrl: string,
  generationDelayMs: number,
  externalServicesMode: "mock" | "live" = "mock",
): GenerationWorkerRuntime {
  if (externalServicesMode !== "mock") {
    throw new Error("真实图片模型适配器尚未配置，请使用 EXTERNAL_SERVICES_MODE=mock");
  }
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const database = createDatabaseClient(databaseUrl);
  const processor = new GenerationProcessor(
    new PrismaGenerationStore(database),
    new DeterministicMockProvider(generationDelayMs),
  );
  const worker = new Worker<GenerationQueueJob>(
    GENERATION_QUEUE,
    async (job) => processor.process(job.data),
    { connection },
  );

  worker.on("ready", () => {
    console.log("Dream Space Worker ready on queue " + GENERATION_QUEUE);
  });

  return { connection, database, worker };
}

async function bootstrap() {
  const env = parseWorkerEnv(process.env);
  const { connection, database, worker } = createGenerationWorker(
    env.REDIS_URL,
    env.DATABASE_URL,
    env.MOCK_GENERATION_DELAY_MS,
    env.EXTERNAL_SERVICES_MODE,
  );

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await database.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

if (require.main === module) {
  void bootstrap();
}
