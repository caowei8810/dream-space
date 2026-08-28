import type { DatabaseClient } from "@dream-space/db";
import type { HealthResponse, ReadinessResponse } from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import { Controller, Get, Headers, HttpException, HttpStatus, Inject, UnauthorizedException } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";
import { requestMetricSnapshot } from "../../observability";

@Controller("health")
export class HealthController {
  private readonly env = parseApiEnv(process.env);
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("live")
  getLiveness(): HealthResponse {
    return this.getHealth();
  }

  @Get("ready")
  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.database.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException({ service: "api", status: "not_ready", timestamp: new Date().toISOString(), dependencies: { database: "unavailable" } }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { service: "api", status: "ready", timestamp: new Date().toISOString(), dependencies: { database: "ok" } };
  }

  @Get("metrics")
  getMetrics(@Headers("authorization") authorization?: string) {
    if (this.env.METRICS_TOKEN && authorization !== `Bearer ${this.env.METRICS_TOKEN}`) {
      throw new UnauthorizedException("指标访问令牌无效");
    }
    return { service: "api", timestamp: new Date().toISOString(), http: requestMetricSnapshot() };
  }
}
