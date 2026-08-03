import { describe, expect, it } from "vitest";
import { parseApiEnv, parseWorkerEnv } from "../src";

describe("environment configuration", () => {
  it("provides local API defaults", () => {
    expect(parseApiEnv({}).API_PORT).toBe(4000);
  });

  it("rejects an invalid Redis URL", () => {
    expect(() => parseWorkerEnv({ REDIS_URL: "invalid" })).toThrow();
  });
});
