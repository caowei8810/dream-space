import { parseWorkerEnv } from "@dream-space/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { FOUNDATION_QUEUE } from "./queues/names";

export function createFoundationWorker(redisUrl: string) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    FOUNDATION_QUEUE,
    async (job) => ({ jobId: job.id, status: "processed" }),
    { connection },
  );

  worker.on("ready", () => {
    console.log(`Dream Space Worker ready on queue ${FOUNDATION_QUEUE}`);
  });

  return { connection, worker };
}

async function bootstrap() {
  const env = parseWorkerEnv(process.env);
  const { connection, worker } = createFoundationWorker(env.REDIS_URL);

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

if (require.main === module) {
  void bootstrap();
}
