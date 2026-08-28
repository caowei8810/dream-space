import { describe, expect, it } from "vitest";
import { parseApiEnv, parseWorkerEnv } from "../src";

describe("environment configuration", () => {
  it("provides local API defaults", () => {
    expect(parseApiEnv({}).API_PORT).toBe(4000);
    expect(parseApiEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
    expect(parseApiEnv({}).OBJECT_STORAGE_MODE).toBe("local");
    expect(parseWorkerEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
    expect(parseWorkerEnv({}).OBJECT_STORAGE_MODE).toBe("local");
    expect(parseWorkerEnv({}).QUOTA_RECONCILIATION_ENABLED).toBe(true);
    expect(parseWorkerEnv({}).QUOTA_RECONCILIATION_INTERVAL_MS).toBe(3_600_000);
    expect(parseWorkerEnv({}).PRIVACY_CLEANUP_ENABLED).toBe(false);
    expect(parseWorkerEnv({}).PRIVACY_RETENTION_DAYS).toBe(30);
  });

  it("accepts an explicit S3 object storage mode and signed URL TTL", () => {
    expect(
      parseApiEnv({
        OBJECT_STORAGE_MODE: "s3",
        S3_ACCESS_KEY: "test-access",
        S3_SECRET_KEY: "test-secret",
        S3_SIGNED_URL_TTL_SECONDS: "600",
      }),
    ).toMatchObject({ OBJECT_STORAGE_MODE: "s3", S3_SIGNED_URL_TTL_SECONDS: 600 });
    expect(() => parseWorkerEnv({ OBJECT_STORAGE_MODE: "live" })).toThrow();
    expect(() => parseApiEnv({ OBJECT_STORAGE_MODE: "s3" })).toThrow();
  });

  it("rejects an invalid Redis URL", () => {
    expect(() => parseWorkerEnv({ REDIS_URL: "invalid" })).toThrow();
  });

  it("accepts live mode only when explicitly configured", () => {
    expect(
      parseApiEnv({ EXTERNAL_SERVICES_MODE: "live", PAYMENT_WEBHOOK_SECRET: "x".repeat(32) })
        .EXTERNAL_SERVICES_MODE,
    ).toBe("live");
    expect(() => parseApiEnv({ EXTERNAL_SERVICES_MODE: "invalid" })).toThrow();
  });

  it("validates the quota reconciliation schedule", () => {
    expect(
      parseWorkerEnv({
        QUOTA_RECONCILIATION_ENABLED: "true",
        QUOTA_RECONCILIATION_INTERVAL_MS: "60000",
      }),
    ).toMatchObject({
      QUOTA_RECONCILIATION_ENABLED: true,
      QUOTA_RECONCILIATION_INTERVAL_MS: 60_000,
    });
    expect(() => parseWorkerEnv({ QUOTA_RECONCILIATION_INTERVAL_MS: "1000" })).toThrow();
  });

  it("requires a metrics token in production", () => {
    expect(() => parseApiEnv({ NODE_ENV: "production" })).toThrow();
    expect(
      parseApiEnv({ NODE_ENV: "production", METRICS_TOKEN: "x".repeat(32) }).METRICS_TOKEN,
    ).toHaveLength(32);
  });
});
