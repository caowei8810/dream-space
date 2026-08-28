import { Prisma, type DatabaseClient } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

interface GenerationSummaryRow {
  total: number;
  succeeded: number;
  failed: number;
  averageLatencyMs: number | null;
  pendingReview: number;
}

@Injectable()
export class AdminDashboardRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async summary(from: Date, to: Date) {
    const [
      generationRows,
      totalUsers,
      activeUsers,
      restrictedUsers,
      bannedUsers,
      newUsers,
      paidOrders,
      completedRefunds,
    ] = await this.database.$transaction([
      this.database.$queryRaw<GenerationSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE "status" = 'SUCCEEDED')::int AS "succeeded",
          COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed",
          AVG(
            CASE
              WHEN "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL
              THEN EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) * 1000
              ELSE NULL
            END
          )::float AS "averageLatencyMs",
          COUNT(*) FILTER (
            WHERE "inputModerationStatus" = 'PENDING'
               OR ("status" = 'SUCCEEDED' AND "outputModerationStatus" = 'PENDING')
          )::int AS "pendingReview"
        FROM "GenerationTask"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      `),
      this.database.user.count(),
      this.database.user.count({ where: { status: "ACTIVE" } }),
      this.database.user.count({ where: { status: "RESTRICTED" } }),
      this.database.user.count({ where: { status: "BANNED" } }),
      this.database.user.count({ where: { createdAt: { gte: from, lt: to } } }),
      this.database.billingOrder.aggregate({
        where: { paidAt: { gte: from, lt: to } },
        _sum: { amountCents: true },
      }),
      this.database.refund.aggregate({
        where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      generation: generationRows[0] ?? {
        total: 0,
        succeeded: 0,
        failed: 0,
        averageLatencyMs: null,
        pendingReview: 0,
      },
      userCounts: { active: activeUsers, restricted: restrictedUsers, banned: bannedUsers },
      totalUsers,
      newUsers,
      revenue: {
        grossCents: paidOrders._sum.amountCents ?? 0,
        refundCents: completedRefunds._sum.amountCents ?? 0,
      },
    };
  }
}
