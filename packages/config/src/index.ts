import { z } from "zod";

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.url().default("http://localhost:3001"),
});

const workerEnvSchema = z.object({
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export function parseApiEnv(input: NodeJS.ProcessEnv) {
  return apiEnvSchema.parse(input);
}

export function parseWorkerEnv(input: NodeJS.ProcessEnv) {
  return workerEnvSchema.parse(input);
}
