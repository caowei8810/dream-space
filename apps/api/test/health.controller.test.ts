import { afterEach, describe, expect, it } from "vitest";
import { HealthController } from "../src/modules/health/health.controller";

describe("HealthController", () => {
  const database = { $queryRaw: async () => [{ ok: 1 }] } as never;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMetricsToken = process.env.METRICS_TOKEN;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalMetricsToken === undefined) delete process.env.METRICS_TOKEN; else process.env.METRICS_TOKEN = originalMetricsToken;
  });

  it("reports the API as healthy", () => {
    const result = new HealthController(database).getHealth();

    expect(result.service).toBe("api");
    expect(result.status).toBe("ok");
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it("reports readiness only when the database responds", async () => {
    const result = await new HealthController(database).getReadiness();
    expect(result.status).toBe("ready");
    expect(result.dependencies.database).toBe("ok");
  });

  it("keeps liveness independent from the database", () => {
    expect(new HealthController({ $queryRaw: async () => { throw new Error("offline"); } } as never).getLiveness().status).toBe("ok");
  });

  it("returns service unavailable when readiness dependencies fail", async () => {
    await expect(new HealthController({ $queryRaw: async () => { throw new Error("offline"); } } as never).getReadiness()).rejects.toMatchObject({ status: 503 });
  });

  it("exposes aggregate HTTP metrics without request contents", () => {
    expect(new HealthController(database).getMetrics()).toMatchObject({ service: "api", http: { total: expect.any(Number), errors: expect.any(Number) } });
  });

  it("protects metrics with the production token", () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_TOKEN = "x".repeat(32);
    const controller = new HealthController(database);
    expect(() => controller.getMetrics()).toThrow();
    expect(controller.getMetrics(`Bearer ${"x".repeat(32)}`)).toMatchObject({ service: "api" });
  });
});
