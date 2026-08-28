import { describe, expect, it, vi } from "vitest";
import { AdminDashboardService } from "../src/modules/admin/admin-dashboard.service";

describe("admin dashboard service", () => {
  it("uses the Beijing calendar day and exposes derived metrics", async () => {
    const repository = {
      summary: vi.fn().mockResolvedValue({
        generation: {
          total: 4,
          succeeded: 3,
          failed: 1,
          averageLatencyMs: 1234.4,
          pendingReview: 2,
        },
        userCounts: { active: 8, restricted: 1, banned: 1 },
        totalUsers: 10,
        newUsers: 2,
        revenue: { grossCents: 12_900, refundCents: 2_900 },
      }),
    };
    const service = new AdminDashboardService(repository as never);

    const result = await service.summary(new Date("2026-08-15T16:30:00.000Z"));

    expect(repository.summary).toHaveBeenCalledWith(
      new Date("2026-08-15T16:00:00.000Z"),
      new Date("2026-08-16T16:00:00.000Z"),
    );
    expect(result.generation).toMatchObject({ successRate: 75, averageLatencyMs: 1234 });
    expect(result.users).toMatchObject({ total: 10, newToday: 2 });
    expect(result.revenue).toMatchObject({
      available: true,
      grossCents: 12_900,
      refundCents: 2_900,
    });
  });

  it("returns zero success rate and no latency when there are no tasks", async () => {
    const repository = {
      summary: vi.fn().mockResolvedValue({
        generation: {
          total: 0,
          succeeded: 0,
          failed: 0,
          averageLatencyMs: null,
          pendingReview: 0,
        },
        userCounts: { active: 0, restricted: 0, banned: 0 },
        totalUsers: 0,
        newUsers: 0,
        revenue: { grossCents: 0, refundCents: 0 },
      }),
    };
    const service = new AdminDashboardService(repository as never);

    await expect(service.summary(new Date("2026-08-16T00:00:00.000Z"))).resolves.toMatchObject({
      generation: { successRate: 0, averageLatencyMs: null },
    });
  });
});
