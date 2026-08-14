import type { DatabaseClient } from "@dream-space/db";
import { describe, expect, it, vi } from "vitest";
import { QuotaReconciliationService } from "../src/reconciliation/quota-reconciliation";

describe("QuotaReconciliationService", () => {
  it("repairs a missing terminal release once and reuses the completed window", async () => {
    let run: Record<string, unknown> | null = null;
    let reserved = 5;
    let available = 95;
    let releaseCreated = false;
    const findingUpdate = vi.fn().mockResolvedValue({});
    const transaction = {
      generationTask: {
        findUnique: vi.fn().mockResolvedValue({ status: "FAILED" }),
      },
      quotaLedgerEntry: {
        findFirst: vi.fn(async () => (releaseCreated ? { id: "ledger-1" } : null)),
        create: vi.fn(async () => {
          releaseCreated = true;
          return {};
        }),
      },
      quotaAccount: {
        updateMany: vi.fn(async () => {
          if (reserved < 5) return { count: 0 };
          reserved -= 5;
          available += 5;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => ({ total: 100, available, reserved })),
      },
    };
    const database = {
      quotaReconciliationRun: {
        findUnique: vi.fn(async () => run),
        findUniqueOrThrow: vi.fn(async () => run),
        create: vi.fn(async ({ data }) => {
          run = {
            id: "run-1",
            status: "RUNNING",
            scannedUsers: 0,
            scannedTasks: 0,
            mismatchCount: 0,
            repairedCount: 0,
            ...data,
          };
          return run;
        }),
        update: vi.fn(async ({ data }) => {
          run = { ...run, ...data, id: "run-1" };
          return run;
        }),
      },
      quotaAccount: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1", total: 100, available, reserved }]),
        findUniqueOrThrow: vi.fn(async () => ({ total: 100, available, reserved })),
      },
      generationTask: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "task-1",
            status: "FAILED",
            totalCost: 5,
            errorCode: "PROVIDER_ERROR",
            errorMessage: "failed",
          },
        ]),
      },
      quotaLedgerEntry: {
        findFirst: vi.fn(async () => (releaseCreated ? { id: "ledger-1" } : null)),
        findMany: vi.fn(async () => [
          { type: "GRANT", amount: 100 },
          { type: "RESERVE", amount: 5 },
          ...(releaseCreated ? [{ type: "RELEASE", amount: 5 }] : []),
        ]),
      },
      quotaReconciliationFinding: {
        upsert: vi.fn().mockResolvedValue({ id: "finding-1", status: "OPEN" }),
        update: findingUpdate,
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as DatabaseClient;
    const service = new QuotaReconciliationService(database, { windowMs: 60_000 });
    const now = new Date("2026-08-06T06:00:00.000Z");

    await expect(service.run({ now })).resolves.toMatchObject({
      status: "COMPLETED",
      mismatchCount: 1,
      repairedCount: 1,
    });
    expect(reserved).toBe(0);
    expect(available).toBe(100);
    expect(transaction.quotaLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REPAIRED" }) }),
    );

    await expect(service.run({ now })).resolves.toMatchObject({
      status: "COMPLETED",
      repairedCount: 1,
    });
    expect(transaction.quotaLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("records ambiguous reserved drift without changing the account", async () => {
    const transaction = vi.fn();
    const database = {
      quotaReconciliationRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "run-2",
          status: "RUNNING",
          scannedUsers: 0,
          scannedTasks: 0,
          mismatchCount: 0,
          repairedCount: 0,
        }),
        update: vi.fn(async ({ data }) => ({ id: "run-2", ...data })),
      },
      quotaAccount: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-2", total: 100, available: 90, reserved: 10 }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ total: 100, available: 90, reserved: 10 }),
      },
      generationTask: { findMany: vi.fn().mockResolvedValue([]) },
      quotaLedgerEntry: {
        findMany: vi.fn().mockResolvedValue([{ type: "GRANT", amount: 100 }]),
      },
      quotaReconciliationFinding: {
        upsert: vi.fn().mockResolvedValue({ id: "finding-2", status: "OPEN" }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: transaction,
    } as unknown as DatabaseClient;
    const service = new QuotaReconciliationService(database);

    await expect(service.run()).resolves.toMatchObject({
      status: "COMPLETED",
      mismatchCount: 2,
      repairedCount: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
