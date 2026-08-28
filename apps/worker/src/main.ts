import { parseWorkerEnv } from "@dream-space/config";
import type { GenerationQueueJob } from "@dream-space/contracts";
import { createDatabaseClient, type DatabaseClient } from "@dream-space/db";
import {
  createObjectStorage,
  type ObjectStorage,
  type S3ObjectStorageOptions,
} from "@dream-space/storage";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  DeterministicMockProvider,
  GenerationOutputPipeline,
  GenerationProcessor,
} from "./generation/generation-processor";
import { PrismaGenerationStore } from "./generation/prisma-generation-store";
import { DeterministicMockContentModerator } from "./moderation/content-moderator";
import { GENERATION_QUEUE } from "./queues/names";
import { QuotaReconciliationService } from "./reconciliation/quota-reconciliation";
import { cleanupDeletedUploads } from "./privacy/privacy-retention";

interface GenerationWorkerRuntime {
  connection: IORedis;
  database: DatabaseClient;
  storage: ObjectStorage;
  worker: Worker<GenerationQueueJob>;
}

interface GenerationWorkerStorageOptions {
  mode: "local" | "s3";
  localRoot: string;
  mockAssetRoot: string;
  s3: S3ObjectStorageOptions;
}

const defaultStorageOptions: GenerationWorkerStorageOptions = {
  mode: "local",
  localRoot: "../../.local/storage",
  mockAssetRoot: "../../apps/web/public/inspiration",
  s3: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "dreamspace-local",
    accessKey: "",
    secretKey: "",
    forcePathStyle: true,
  },
};

export function createGenerationWorker(
  redisUrl: string,
  databaseUrl: string,
  generationDelayMs: number,
  externalServicesMode: "mock" | "live" = "mock",
  storageOptions: GenerationWorkerStorageOptions = defaultStorageOptions,
): GenerationWorkerRuntime {
  if (externalServicesMode !== "mock") {
    throw new Error("真实图片模型适配器尚未配置，请使用 EXTERNAL_SERVICES_MODE=mock");
  }
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const database = createDatabaseClient(databaseUrl);
  const storage = createObjectStorage({
    mode: storageOptions.mode,
    localRoot: storageOptions.localRoot,
    s3: storageOptions.s3,
  });
  const processor = new GenerationProcessor(
    new PrismaGenerationStore(database),
    new DeterministicMockProvider(generationDelayMs, storageOptions.mockAssetRoot),
    new GenerationOutputPipeline(storage),
    new DeterministicMockContentModerator(),
  );
  const worker = new Worker<GenerationQueueJob>(
    GENERATION_QUEUE,
    async (job) =>
      processor.process(job.data, {
        key: `${job.id}:${job.attemptsMade + 1}`,
        number: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
      }),
    { connection },
  );

  worker.on("ready", () => {
    console.log("Dream Space Worker ready on queue " + GENERATION_QUEUE);
  });

  return { connection, database, storage, worker };
}

async function bootstrap() {
  const env = parseWorkerEnv(process.env);
  const { connection, database, storage, worker } = createGenerationWorker(
    env.REDIS_URL,
    env.DATABASE_URL,
    env.MOCK_GENERATION_DELAY_MS,
    env.EXTERNAL_SERVICES_MODE,
    {
      mode: env.OBJECT_STORAGE_MODE,
      localRoot: env.LOCAL_STORAGE_DIR,
      mockAssetRoot: env.MOCK_ASSET_DIR,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKey: env.S3_ACCESS_KEY,
        secretKey: env.S3_SECRET_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      },
    },
  );
  let reconciliationTimer: NodeJS.Timeout | undefined;
  if (env.QUOTA_RECONCILIATION_ENABLED) {
    const reconciliation = new QuotaReconciliationService(database, {
      windowMs: env.QUOTA_RECONCILIATION_INTERVAL_MS,
    });
    const runReconciliation = async () => {
      const summary = await reconciliation.run();
      console.log(
        `Quota reconciliation ${summary.status.toLowerCase()}: run=${summary.runId} mismatches=${summary.mismatchCount} repaired=${summary.repairedCount}`,
      );
    };
    await runReconciliation();
    reconciliationTimer = setInterval(
      () =>
        void runReconciliation().catch((error: unknown) => {
          console.error("Quota reconciliation failed to start", error);
        }),
      env.QUOTA_RECONCILIATION_INTERVAL_MS,
    );
    reconciliationTimer.unref();
  }
  let privacyCleanupTimer: NodeJS.Timeout | undefined;
  if (env.PRIVACY_CLEANUP_ENABLED) {
    const runPrivacyCleanup = async () => {
      const summary = await cleanupDeletedUploads(database, storage, env.PRIVACY_RETENTION_DAYS);
      console.log(
        `Privacy cleanup: candidates=${summary.candidates} deleted=${summary.deleted} failed=${summary.failed}`,
      );
    };
    await runPrivacyCleanup();
    privacyCleanupTimer = setInterval(
      () =>
        void runPrivacyCleanup().catch((error: unknown) =>
          console.error("Privacy cleanup failed", error),
        ),
      env.PRIVACY_CLEANUP_INTERVAL_MS,
    );
    privacyCleanupTimer.unref();
  }

  const shutdown = async () => {
    if (reconciliationTimer) clearInterval(reconciliationTimer);
    if (privacyCleanupTimer) clearInterval(privacyCleanupTimer);
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
