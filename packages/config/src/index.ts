import { z } from "zod";

const externalServicesMode = z.enum(["mock", "live"]).default("mock");
const objectStorageMode = z.enum(["local", "s3"]).default("local");
const booleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");
const disabledBooleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const objectStorageEnv = {
  LOCAL_STORAGE_DIR: z.string().min(1).default("../../.local/storage"),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(3).max(63).default("dreamspace-local"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  S3_FORCE_PATH_STYLE: booleanString,
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
};

function requireObjectStorageCredentials(
  value: { OBJECT_STORAGE_MODE: "local" | "s3"; S3_ACCESS_KEY: string; S3_SECRET_KEY: string },
  context: z.RefinementCtx,
) {
  if (value.OBJECT_STORAGE_MODE !== "s3") return;
  if (value.S3_ACCESS_KEY.length < 3) {
    context.addIssue({
      code: "custom",
      path: ["S3_ACCESS_KEY"],
      message: "S3 access key is required",
    });
  }
  if (value.S3_SECRET_KEY.length < 8) {
    context.addIssue({
      code: "custom",
      path: ["S3_SECRET_KEY"],
      message: "S3 secret key is required",
    });
  }
}

function requireLivePaymentSecret(
  value: {
    NODE_ENV: "development" | "test" | "production";
    EXTERNAL_SERVICES_MODE: "mock" | "live";
    PAYMENT_WEBHOOK_SECRET: string;
  },
  context: z.RefinementCtx,
) {
  if (
    value.NODE_ENV === "production" &&
    value.EXTERNAL_SERVICES_MODE === "live" &&
    value.PAYMENT_WEBHOOK_SECRET.length < 32
  ) {
    context.addIssue({
      code: "custom",
      path: ["PAYMENT_WEBHOOK_SECRET"],
      message: "A 32-character payment webhook secret is required in live mode",
    });
  }
}

function requireProductionMetricsToken(
  value: { NODE_ENV: "development" | "test" | "production"; METRICS_TOKEN: string },
  context: z.RefinementCtx,
) {
  if (value.NODE_ENV === "production" && value.METRICS_TOKEN.length < 32) {
    context.addIssue({
      code: "custom",
      path: ["METRICS_TOKEN"],
      message: "A 32-character metrics token is required in production",
    });
  }
}

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    ADMIN_ORIGIN: z.url().default("http://localhost:3001"),
    API_PUBLIC_URL: z.url().default("http://localhost:4000"),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100_000).default(120),
    AUTH_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    ...objectStorageEnv,
    OBJECT_STORAGE_MODE: objectStorageMode,
    EXTERNAL_SERVICES_MODE: externalServicesMode,
    PAYMENT_WEBHOOK_SECRET: z.string().default(""),
    METRICS_TOKEN: z.string().default(""),
  })
  .superRefine(requireObjectStorageCredentials)
  .superRefine(requireLivePaymentSecret)
  .superRefine(requireProductionMetricsToken);

const workerEnvSchema = z
  .object({
    REDIS_URL: z.url().default("redis://localhost:6379"),
    DATABASE_URL: z
      .url()
      .default("postgresql://dreamspace:dreamspace_dev@localhost:5432/dreamspace"),
    EXTERNAL_SERVICES_MODE: externalServicesMode,
    ...objectStorageEnv,
    OBJECT_STORAGE_MODE: objectStorageMode,
    MOCK_ASSET_DIR: z.string().min(1).default("../../apps/web/public/inspiration"),
    MOCK_GENERATION_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(200),
    QUOTA_RECONCILIATION_ENABLED: booleanString,
    QUOTA_RECONCILIATION_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(24 * 60 * 60 * 1000)
      .default(60 * 60 * 1000),
    PRIVACY_CLEANUP_ENABLED: disabledBooleanString,
    PRIVACY_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(7 * 24 * 60 * 60 * 1000)
      .default(24 * 60 * 60 * 1000),
    PRIVACY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  })
  .superRefine(requireObjectStorageCredentials);

export function parseApiEnv(input: NodeJS.ProcessEnv) {
  return apiEnvSchema.parse(input);
}

export function parseWorkerEnv(input: NodeJS.ProcessEnv) {
  return workerEnvSchema.parse(input);
}
