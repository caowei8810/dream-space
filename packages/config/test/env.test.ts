import { describe, expect, it } from "vitest";
import { parseApiEnv, parseWorkerEnv } from "../src";

describe("environment configuration", () => {
  it("provides local API defaults", () => {
    expect(parseApiEnv({}).API_PORT).toBe(4000);
    expect(parseApiEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
    expect(parseWorkerEnv({}).EXTERNAL_SERVICES_MODE).toBe("mock");
  });

  it("rejects an invalid Redis URL", () => {
    expect(() => parseWorkerEnv({ REDIS_URL: "invalid" })).toThrow();
  });

  it("accepts live mode only when explicitly configured", () => {
    expect(parseApiEnv({ EXTERNAL_SERVICES_MODE: "live" }).EXTERNAL_SERVICES_MODE).toBe("live");
    expect(() => parseApiEnv({ EXTERNAL_SERVICES_MODE: "invalid" })).toThrow();
  });
});
