import { describe, expect, it, vi } from "vitest";
import { BillingRepository } from "../src/modules/billing/billing.repository";

function createRepository(options: { replay?: boolean; changed?: number } = {}) {
  const account = { userId: "user-1", available: 80, reserved: 20 };
  const transaction = {
    cashLedgerEntry: {
      findUnique: vi.fn().mockResolvedValue(options.replay ? { id: "entry-1" } : null),
      create: vi.fn().mockResolvedValue({}),
    },
    cashAccount: {
      upsert: vi.fn().mockResolvedValue(account),
      update: vi.fn().mockResolvedValue({ ...account, available: 100 }),
      updateMany: vi.fn().mockResolvedValue({ count: options.changed ?? 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(account),
    },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const database = { $transaction: vi.fn((callback) => callback(transaction)) };
  return { transaction, repository: new BillingRepository(database as never) };
}

describe("BillingRepository cash ledger", () => {
  it("writes an administrator audit event in the same transaction as a cash grant", async () => {
    const { transaction, repository } = createRepository();
    await expect(
      repository.grantCash("user-1", 20, "grant-key-1", undefined, {
        actorId: "admin-1",
        reason: "运营补发",
        requestId: "request-1",
      }),
    ).resolves.toMatchObject({ status: "granted" });

    expect(transaction.cashLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminUserId: "admin-1",
        action: "billing.wallet.grant",
        resourceId: "user-1",
        reason: "运营补发",
        requestId: "request-1",
      }),
    });

    const replay = createRepository({ replay: true });
    await expect(
      replay.repository.grantCash("user-1", 20, "grant-key-1", undefined, {
        actorId: "admin-1",
        reason: "运营补发",
        requestId: "request-2",
      }),
    ).resolves.toMatchObject({ status: "replayed" });
    expect(replay.transaction.cashAccount.update).not.toHaveBeenCalled();
    expect(replay.transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("reserves with a conditional balance update and writes one ledger entry", async () => {
    const { transaction, repository } = createRepository();
    await expect(
      repository.reserveCash("user-1", 20, "reserve-key-1", "task-1"),
    ).resolves.toMatchObject({ status: "reserved" });
    expect(transaction.cashAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", available: { gte: 20 } },
      data: { available: { decrement: 20 }, reserved: { increment: 20 } },
    });
    expect(transaction.cashLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("does not overdraw or duplicate a replayed reservation", async () => {
    const insufficient = createRepository({ changed: 0 });
    await expect(
      insufficient.repository.reserveCash("user-1", 100, "reserve-key-2"),
    ).resolves.toMatchObject({ status: "insufficient" });
    expect(insufficient.transaction.cashLedgerEntry.create).not.toHaveBeenCalled();

    const replay = createRepository({ replay: true });
    await expect(
      replay.repository.reserveCash("user-1", 20, "reserve-key-1"),
    ).resolves.toMatchObject({ status: "replayed" });
    expect(replay.transaction.cashAccount.updateMany).not.toHaveBeenCalled();
  });
});

describe("BillingRepository administrator audit", () => {
  it("writes the pricing rule and its audit event in one transaction", async () => {
    const transaction = {
      billingRule: {
        findFirst: vi.fn().mockResolvedValue({ version: 2 }),
        create: vi.fn().mockResolvedValue({
          id: "rule-3",
          version: 3,
          standardUnitCents: 12,
          status: "DRAFT",
          promotions: [],
        }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const repository = new BillingRepository({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await repository.createRule(12, {
      actorId: "admin-1",
      reason: "调整标准价格",
      requestId: "request-1",
    });

    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminUserId: "admin-1",
        action: "billing.rule.create",
        resourceId: "rule-3",
        reason: "调整标准价格",
        requestId: "request-1",
      }),
    });
  });
});

describe("BillingRepository entitlement reservation", () => {
  it("fails atomically when the combined entitlements cannot cover the request", async () => {
    const entries = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
    const entitlements = {
      findMany: vi.fn().mockResolvedValue([
        { id: "ent-1", available: 2 },
        { id: "ent-2", available: 1 },
      ]),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    };
    const database = {
      $transaction: vi.fn((callback) =>
        callback({ entitlementLedgerEntry: entries, userEntitlement: entitlements }),
      ),
    };
    const repository = new BillingRepository(database as never);
    await expect(repository.reserveEntitlements("user-1", 4, "ent-key-1")).resolves.toMatchObject({
      status: "insufficient",
      reserved: 0,
    });
    expect(entitlements.updateMany).not.toHaveBeenCalled();
    expect(entries.create).not.toHaveBeenCalled();
  });
});
