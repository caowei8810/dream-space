import { z } from "zod";

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.url().default("http://localhost:3001"),
  AUTH_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

const workerEnvSchema = z.object({
  REDIS_URL: z.url().default("redis://localhost:6379"),
  DATABASE_URL: z.url().default("postgresql://dreamspace:dreamspace_dev@localhost:5432/dreamspace"),
  MOCK_GENERATION_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(200),
});

export function parseApiEnv(input: NodeJS.ProcessEnv) {
  return apiEnvSchema.parse(input);
}

export function parseWorkerEnv(input: NodeJS.ProcessEnv) {
  return workerEnvSchema.parse(input);
}
