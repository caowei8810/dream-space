import { describe, expect, it } from "vitest";
import { HealthController } from "../src/modules/health/health.controller";

describe("HealthController", () => {
  it("reports the API as healthy", () => {
    const result = new HealthController().getHealth();

    expect(result.service).toBe("api");
    expect(result.status).toBe("ok");
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
