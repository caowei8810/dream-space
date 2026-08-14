import type { DatabaseClient, Prisma } from "@dream-space/db";

const activeStatuses = ["QUEUED", "GENERATING"] as const;

export interface ReconciliationSummary {
  runId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  scannedUsers: number;
  scannedTasks: number;
  mismatchCount: number;
  repairedCount: number;
}

export interface QuotaReconciliationOptions {
  windowMs?: number;
  now?: Date;
  userIds?: string[];
}

/**
 * Reconciles only facts that can be derived from the task and ledger state.
 * Ambiguous balance drift is recorded for review instead of being guessed.
 */
export class QuotaReconciliationService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly options: { windowMs: number } = { windowMs: 60 * 60 * 1000 },
  ) {}

  async run(options: QuotaReconciliationOptions = {}): Promise<ReconciliationSummary> {
    const now = options.now ?? new Date();
    const windowMs = options.windowMs ?? this.options.windowMs;
    const scopeKey = options.userIds?.length ? `:${options.userIds.slice().sort().join(",")}` : "";
    const windowKey = `quota${scopeKey}:${Math.floor(now.getTime() / windowMs)}`;
    const claimed = await this.createOrGetRun(windowKey);
    const run = claimed.run;
    if (!claimed.acquired || run.status !== "RUNNING") return this.summary(run);

    try {
      const accounts = await this.database.quotaAccount.findMany({
        where: options.userIds?.length ? { userId: { in: options.userIds } } : undefined,
        select: { userId: true, total: true, available: true, reserved: true },
      });
      let scannedTasks = 0;
      let mismatchCount = 0;
      let repairedCount = 0;

      for (const account of accounts) {
        const tasks = await this.database.generationTask.findMany({
          where: { userId: account.userId },
          select: {
            id: true,
            status: true,
            totalCost: true,
            errorCode: true,
            errorMessage: true,
          },
        });
        scannedTasks += tasks.length;
        const expectedReserved = tasks
          .filter((task) => activeStatuses.includes(task.status as (typeof activeStatuses)[number]))
          .reduce((sum, task) => sum + task.totalCost, 0);

        for (const task of tasks) {
          const ledgerType = activeStatuses.includes(task.status as (typeof activeStatuses)[number])
            ? "RESERVE"
            : task.status === "SUCCEEDED" || task.status === "PARTIALLY_SUCCEEDED"
              ? "CONSUME"
              : task.status === "FAILED" || task.status === "CANCELLED"
                ? "RELEASE"
                : null;
          if (!ledgerType) continue;
          const ledger = await this.database.quotaLedgerEntry.findFirst({
            where: { taskId: task.id, type: ledgerType },
            select: { id: true, amount: true },
          });
          if (ledger?.amount === task.totalCost) continue;

          mismatchCount += 1;
          const kind = ledger
            ? "SETTLEMENT_AMOUNT_MISMATCH"
            : ledgerType === "RESERVE"
              ? "MISSING_RESERVE"
              : ledgerType === "CONSUME"
                ? "MISSING_CONSUME"
                : "MISSING_RELEASE";
          const key = `reconciliation:${kind.toLowerCase()}:${task.id}`;
          const finding = await this.recordFinding({
            runId: run.id,
            userId: account.userId,
            taskId: task.id,
            kind,
            key,
            expectedAmount: task.totalCost,
            actualAmount: ledger?.amount ?? 0,
            details: {
              taskStatus: task.status,
              errorCode: task.errorCode,
              errorMessage: task.errorMessage,
            },
          });
          if (finding.status === "REPAIRED") continue;

          const repaired = ledger
            ? false
            : ledgerType === "CONSUME"
              ? await this.repairMissingConsume(task.id, account.userId, task.totalCost)
              : ledgerType === "RELEASE"
                ? await this.repairMissingRelease(
                    task.id,
                    account.userId,
                    task.totalCost,
                    expectedReserved,
                  )
                : false;
          await this.finishFinding(finding.id, repaired ? "REPAIRED" : "BLOCKED");
          if (repaired) repairedCount += 1;
        }

        const [currentAccount, ledgers] = await Promise.all([
          this.database.quotaAccount.findUniqueOrThrow({
            where: { userId: account.userId },
            select: { total: true, available: true, reserved: true },
          }),
          this.database.quotaLedgerEntry.findMany({
            where: { userId: account.userId },
            select: { type: true, amount: true },
          }),
        ]);
        const expectedTotal = this.sumLedger(ledgers, "GRANT");
        const expectedLedgerReserved =
          this.sumLedger(ledgers, "RESERVE") -
          this.sumLedger(ledgers, "CONSUME") -
          this.sumLedger(ledgers, "RELEASE");
        const expectedAvailable =
          expectedTotal - this.sumLedger(ledgers, "RESERVE") + this.sumLedger(ledgers, "RELEASE");

        if (currentAccount.total !== expectedTotal) {
          mismatchCount += 1;
          const finding = await this.recordFinding({
            runId: run.id,
            userId: account.userId,
            kind: "TOTAL_DRIFT",
            key: `reconciliation:total-drift:${account.userId}`,
            expectedAmount: expectedTotal,
            actualAmount: currentAccount.total,
            details: { source: "quota_ledger" },
          });
          if (finding.status !== "REPAIRED") await this.finishFinding(finding.id, "BLOCKED");
        }
        if (currentAccount.reserved !== expectedLedgerReserved) {
          mismatchCount += 1;
          const key = `reconciliation:reserved-drift:${account.userId}`;
          const finding = await this.recordFinding({
            runId: run.id,
            userId: account.userId,
            kind: "RESERVED_DRIFT",
            key,
            expectedAmount: expectedLedgerReserved,
            actualAmount: currentAccount.reserved,
            details: {
              available: currentAccount.available,
              reserved: currentAccount.reserved,
              activeTaskReserved: expectedReserved,
              source: "quota_ledger",
            },
          });
          if (finding.status !== "REPAIRED") await this.finishFinding(finding.id, "BLOCKED");
        }
        if (currentAccount.available !== expectedAvailable) {
          mismatchCount += 1;
          const finding = await this.recordFinding({
            runId: run.id,
            userId: account.userId,
            kind: "AVAILABLE_DRIFT",
            key: `reconciliation:available-drift:${account.userId}`,
            expectedAmount: expectedAvailable,
            actualAmount: currentAccount.available,
            details: {
              total: account.total,
              source: "quota_ledger",
            },
          });
          if (finding.status !== "REPAIRED") await this.finishFinding(finding.id, "BLOCKED");
        }
      }

      const completed = await this.database.quotaReconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          scannedUsers: accounts.length,
          scannedTasks,
          mismatchCount,
          repairedCount,
        },
      });
      return this.summary(completed);
    } catch (error) {
      const failed = await this.database.quotaReconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      return this.summary(failed);
    }
  }

  private async createOrGetRun(windowKey: string) {
    const existing = await this.database.quotaReconciliationRun.findUnique({
      where: { windowKey },
    });
    if (existing) return { run: existing, acquired: false } as const;
    try {
      const run = await this.database.quotaReconciliationRun.create({ data: { windowKey } });
      return { run, acquired: true } as const;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const run = await this.database.quotaReconciliationRun.findUniqueOrThrow({
        where: { windowKey },
      });
      return { run, acquired: false } as const;
    }
  }

  private async recordFinding(input: {
    runId: string;
    userId: string;
    taskId?: string;
    kind:
      | "MISSING_RESERVE"
      | "MISSING_RELEASE"
      | "MISSING_CONSUME"
      | "SETTLEMENT_AMOUNT_MISMATCH"
      | "TOTAL_DRIFT"
      | "RESERVED_DRIFT"
      | "AVAILABLE_DRIFT";
    key: string;
    expectedAmount: number;
    actualAmount: number;
    details: Prisma.InputJsonObject;
  }) {
    return this.database.quotaReconciliationFinding.upsert({
      where: { runId_idempotencyKey: { runId: input.runId, idempotencyKey: input.key } },
      create: {
        runId: input.runId,
        userId: input.userId,
        taskId: input.taskId,
        kind: input.kind,
        idempotencyKey: input.key,
        expectedAmount: input.expectedAmount,
        actualAmount: input.actualAmount,
        details: input.details,
      },
      update: {
        runId: input.runId,
        expectedAmount: input.expectedAmount,
        actualAmount: input.actualAmount,
        details: input.details,
      },
    });
  }

  private async finishFinding(findingId: string, status: "REPAIRED" | "BLOCKED"): Promise<void> {
    await this.database.quotaReconciliationFinding.update({
      where: { id: findingId },
      data: { status, repairedAt: status === "REPAIRED" ? new Date() : null },
    });
  }

  private async repairMissingConsume(taskId: string, userId: string, amount: number) {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({
        where: { id: taskId },
        select: { status: true },
      });
      if (task?.status !== "SUCCEEDED") return false;
      const ledger = await transaction.quotaLedgerEntry.findFirst({
        where: { taskId, type: "CONSUME" },
        select: { id: true },
      });
      if (ledger) return true;
      const account = await transaction.quotaAccount.findUniqueOrThrow({ where: { userId } });
      await transaction.quotaLedgerEntry.create({
        data: {
          userId,
          taskId,
          type: "CONSUME",
          amount,
          balanceAfter: account.available,
          idempotencyKey: `consume:${taskId}`,
        },
      });
      return true;
    });
  }

  private async repairMissingRelease(
    taskId: string,
    userId: string,
    amount: number,
    expectedReserved: number,
  ) {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findUnique({
        where: { id: taskId },
        select: { status: true },
      });
      if (!task || (task.status !== "FAILED" && task.status !== "CANCELLED")) return false;
      const ledger = await transaction.quotaLedgerEntry.findFirst({
        where: { taskId, type: "RELEASE" },
        select: { id: true },
      });
      if (ledger) return true;
      const changed = await transaction.quotaAccount.updateMany({
        where: { userId, reserved: { gte: expectedReserved + amount } },
        data: { available: { increment: amount }, reserved: { decrement: amount } },
      });
      if (changed.count !== 1) return false;
      const account = await transaction.quotaAccount.findUniqueOrThrow({ where: { userId } });
      await transaction.quotaLedgerEntry.create({
        data: {
          userId,
          taskId,
          type: "RELEASE",
          amount,
          balanceAfter: account.available,
          idempotencyKey: `failure-release:${taskId}`,
        },
      });
      return true;
    });
  }

  private summary(run: {
    id: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    scannedUsers: number;
    scannedTasks: number;
    mismatchCount: number;
    repairedCount: number;
  }): ReconciliationSummary {
    return {
      runId: run.id,
      status: run.status,
      scannedUsers: run.scannedUsers,
      scannedTasks: run.scannedTasks,
      mismatchCount: run.mismatchCount,
      repairedCount: run.repairedCount,
    };
  }

  private sumLedger(
    entries: Array<{ type: string; amount: number }>,
    type: "GRANT" | "RESERVE" | "CONSUME" | "RELEASE",
  ) {
    return entries
      .filter((entry) => entry.type === type)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
