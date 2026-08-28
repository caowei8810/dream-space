import type { AdminDashboardSummary } from "@dream-space/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { AdminDashboardRepository } from "./admin-dashboard.repository";

function shanghaiDayWindow(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const from = new Date(`${day}T00:00:00+08:00`);
  const to = new Date(from.getTime() + 86_400_000);
  return { from, to };
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(AdminDashboardRepository) private readonly repository: AdminDashboardRepository,
  ) {}

  async summary(now = new Date()): Promise<AdminDashboardSummary> {
    const window = shanghaiDayWindow(now);
    const result = await this.repository.summary(window.from, window.to);
    const total = result.generation.total;

    return {
      window: {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        timezone: "Asia/Shanghai",
      },
      generation: {
        ...result.generation,
        averageLatencyMs:
          result.generation.averageLatencyMs === null
            ? null
            : Math.round(result.generation.averageLatencyMs),
        successRate:
          total === 0 ? 0 : Math.round((result.generation.succeeded / total) * 10_000) / 100,
      },
      users: {
        total: result.totalUsers,
        active: result.userCounts.active,
        restricted: result.userCounts.restricted,
        banned: result.userCounts.banned,
        newToday: result.newUsers,
      },
      revenue: {
        available: true,
        grossCents: result.revenue.grossCents,
        refundCents: result.revenue.refundCents,
        note: "按今日支付完成时间统计实收，退款按完成时间统计。",
      },
      generatedAt: now.toISOString(),
    };
  }
}
