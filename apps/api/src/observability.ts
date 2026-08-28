import { Logger } from "@nestjs/common";

export interface RequestMetricSnapshot {
  total: number;
  errors: number;
  byMethod: Record<string, number>;
  byStatusClass: Record<string, number>;
}

const logger = new Logger("http");
const metrics: RequestMetricSnapshot = { total: 0, errors: 0, byMethod: {}, byStatusClass: {} };

export function recordRequest(method: string, statusCode: number) {
  metrics.total += 1;
  metrics.byMethod[method] = (metrics.byMethod[method] ?? 0) + 1;
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  metrics.byStatusClass[statusClass] = (metrics.byStatusClass[statusClass] ?? 0) + 1;
  if (statusCode >= 500) metrics.errors += 1;
}

export function requestMetricSnapshot(): RequestMetricSnapshot {
  return { total: metrics.total, errors: metrics.errors, byMethod: { ...metrics.byMethod }, byStatusClass: { ...metrics.byStatusClass } };
}

export function logRequest(input: { requestId: string; method: string; path: string; statusCode: number; durationMs: number }) {
  logger.log(JSON.stringify({ event: "http.request", ...input }));
}

export function safeRequestPath(value: string) {
  return value.split("?", 1)[0] || "/";
}

export function resetRequestMetrics() {
  metrics.total = 0;
  metrics.errors = 0;
  metrics.byMethod = {};
  metrics.byStatusClass = {};
}
