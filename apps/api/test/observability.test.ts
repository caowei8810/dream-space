import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logRequest,
  recordRequest,
  requestMetricSnapshot,
  resetRequestMetrics,
  safeRequestPath,
} from "../src/observability";

afterEach(() => {
  resetRequestMetrics();
  vi.restoreAllMocks();
});

describe("HTTP observability", () => {
  it("records request totals by method and status class", () => {
    recordRequest("GET", 200);
    recordRequest("POST", 503);
    recordRequest("POST", 429);
    expect(requestMetricSnapshot()).toEqual({
      total: 3,
      errors: 1,
      byMethod: { GET: 1, POST: 2 },
      byStatusClass: { "2xx": 1, "5xx": 1, "4xx": 1 },
    });
  });

  it("logs only safe request metadata", () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    logRequest({
      requestId: "req-1",
      method: "GET",
      path: "/health",
      statusCode: 200,
      durationMs: 4,
    });
    expect(spy).toHaveBeenCalledWith(expect.not.stringContaining("Cookie"));
    expect(spy).toHaveBeenCalledWith(expect.not.stringContaining("Authorization"));
  });

  it("removes query strings before logging request paths", () => {
    expect(safeRequestPath("/admin/users?query=13800138000&page=1")).toBe("/admin/users");
  });
});
