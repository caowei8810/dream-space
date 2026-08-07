import { describe, expect, it } from "vitest";
import { parseApiEnv, parseWorkerEnv } from "../src";

describe("environment configuration", () => {
  it("provides local API defaults", () => {
    expect(parseApiEnv({}).API_PORT).toBe(4000);
    expect(parseApiEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
    expect(parseApiEnv({}).OBJECT_STORAGE_MODE).toBe("local");
    expect(parseWorkerEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
    expect(parseWorkerEnv({}).OBJECT_STORAGE_MODE).toBe("local");
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
    expect(parseApiEnv({ EXTERNAL_SERVICES_MODE: "live" }).EXTERNAL_SERVICES_MODE).toBe("live");
    expect(() => parseApiEnv({ EXTERNAL_SERVICES_MODE: "invalid" })).toThrow();
  });
});
