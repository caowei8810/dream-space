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
      updateMany: vi.fn().mockResolvedValue({ count: options.changed ?? 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(account),
    },
  };
  const database = { $transaction: vi.fn((callback) => callback(transaction)) };
  return { transaction, repository: new BillingRepository(database as never) };
}

describe("BillingRepository cash ledger", () => {
  it("reserves with a conditional balance update and writes one ledger entry", async () => {
    const { transaction, repository } = createRepository();
    await expect(repository.reserveCash("user-1", 20, "reserve-key-1", "task-1")).resolves.toMatchObject({ status: "reserved" });
    expect(transaction.cashAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", available: { gte: 20 } },
      data: { available: { decrement: 20 }, reserved: { increment: 20 } },
    });
    expect(transaction.cashLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("does not overdraw or duplicate a replayed reservation", async () => {
    const insufficient = createRepository({ changed: 0 });
    await expect(insufficient.repository.reserveCash("user-1", 100, "reserve-key-2")).resolves.toMatchObject({ status: "insufficient" });
    expect(insufficient.transaction.cashLedgerEntry.create).not.toHaveBeenCalled();

    const replay = createRepository({ replay: true });
    await expect(replay.repository.reserveCash("user-1", 20, "reserve-key-1")).resolves.toMatchObject({ status: "replayed" });
    expect(replay.transaction.cashAccount.updateMany).not.toHaveBeenCalled();
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
    const database = { $transaction: vi.fn((callback) => callback({ entitlementLedgerEntry: entries, userEntitlement: entitlements })) };
    const repository = new BillingRepository(database as never);
    await expect(repository.reserveEntitlements("user-1", 4, "ent-key-1")).resolves.toMatchObject({ status: "insufficient", reserved: 0 });
    expect(entitlements.updateMany).not.toHaveBeenCalled();
    expect(entries.create).not.toHaveBeenCalled();
  });
});
