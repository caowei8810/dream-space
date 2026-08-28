import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BillingService } from "../src/modules/billing/billing.service";
import type { BillingRepository } from "../src/modules/billing/billing.repository";

function createService() {
  const repository = {
    findPublishedRule: vi.fn().mockResolvedValue({
      version: 3,
      standardUnitCents: 10,
      currency: "CNY",
      promotions: [{ code: "HALF", discountBps: 5000, priority: 1 }],
    }),
    getCashAccount: vi.fn().mockResolvedValue({ available: 120, reserved: 30 }),
    reserveCash: vi
      .fn()
      .mockResolvedValue({ status: "reserved", account: { available: 20, reserved: 130 } }),
    releaseCash: vi
      .fn()
      .mockResolvedValue({ status: "released", account: { available: 120, reserved: 30 } }),
    settleCash: vi
      .fn()
      .mockResolvedValue({ status: "consumed", account: { available: 120, reserved: 0 } }),
    grantCash: vi
      .fn()
      .mockResolvedValue({ status: "granted", account: { available: 1120, reserved: 30 } }),
    listPublishedPlans: vi.fn().mockResolvedValue([]),
    createOrder: vi.fn().mockResolvedValue({
      status: "created",
      order: {
        id: "order-1",
        planVersionId: "pv-1",
        amountCents: 1000,
        refundedCents: 0,
        status: "PENDING",
        createdAt: new Date(),
        paidAt: null,
        planVersion: { plan: { code: "starter", name: "入门" } },
      },
    }),
    listUserOrders: vi.fn().mockResolvedValue([]),
    listAdminOrders: vi.fn().mockResolvedValue({
      total: 1,
      items: [
        {
          id: "order-1",
          userId: "user-1",
          planVersionId: "pv-1",
          status: "PAID",
          amountCents: 1000,
          refundedCents: 0,
          createdAt: new Date("2026-08-26T00:00:00.000Z"),
          paidAt: new Date("2026-08-26T00:01:00.000Z"),
          user: { phone: "18800000000" },
          planVersion: { imageCount: 500, plan: { code: "starter", name: "入门" } },
          entitlement: { available: 500, reserved: 0 },
        },
      ],
    }),
    listEntitlements: vi.fn().mockResolvedValue([]),
    processPayment: vi.fn().mockResolvedValue({ status: "processed", order: null }),
    refundOrder: vi.fn().mockResolvedValue({ status: "completed", refund: { id: "refund-1" } }),
  };
  return { repository, service: new BillingService(repository as unknown as BillingRepository) };
}

describe("BillingService", () => {
  it("quotes against the published rule and promotion snapshot", async () => {
    const { service } = createService();
    await expect(service.quote({ imageCount: 2, promotionCode: "half" })).resolves.toMatchObject({
      standardTotalCents: 20,
      finalTotalCents: 10,
      finalUnitCents: 5,
      promotionCode: "HALF",
      ruleVersion: 3,
      currency: "CNY",
    });
  });

  it("rejects missing rules, invalid counts and unknown promotions", async () => {
    const { repository, service } = createService();
    await expect(service.quote({ imageCount: 0 })).rejects.toBeInstanceOf(BadRequestException);
    vi.mocked(repository.findPublishedRule).mockResolvedValue(null);
    await expect(service.quote({ imageCount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    vi.mocked(repository.findPublishedRule).mockResolvedValue({
      version: 3,
      standardUnitCents: 10,
      currency: "CNY",
      promotions: [],
    });
    await expect(service.quote({ imageCount: 1, promotionCode: "NOPE" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("exposes cash wallet and validates idempotent ledger operations", async () => {
    const { repository, service } = createService();
    await expect(service.wallet("user-1")).resolves.toEqual({
      currency: "CNY",
      availableCents: 120,
      reservedCents: 30,
    });
    await service.reserveCash("user-1", 100, "reserve-key-1", "task-1");
    expect(repository.reserveCash).toHaveBeenCalledWith("user-1", 100, "reserve-key-1", "task-1");
    await service.releaseCash("user-1", 100, "release-key-1", "task-1");
    await service.settleCash("user-1", 100, "consume-key-1", "task-1");
    await expect(service.reserveCash("user-1", 0, "bad-key-1")).rejects.toThrow();
    await service.grantCash(
      "user-1",
      { amountCents: 1000, reason: "测试充值" },
      "grant-key-1",
      "admin-1",
      "request-1",
    );
    expect(repository.grantCash).toHaveBeenCalledWith("user-1", 1000, "grant-key-1", undefined, {
      actorId: "admin-1",
      reason: "测试充值",
      requestId: "request-1",
    });
  });

  it("creates idempotent orders and rejects malformed payment callbacks", async () => {
    const { repository, service } = createService();
    await expect(
      service.createOrder("user-1", { planVersionId: "pv-1", idempotencyKey: "order-key-1" }),
    ).resolves.toMatchObject({ id: "order-1", status: "pending" });
    await expect(
      service.paymentCallback({
        provider: "mock",
        providerEventId: "evt-1",
        orderId: "order-1",
        paidAmountCents: 0,
      }),
    ).rejects.toThrow();
    await service.paymentCallback({
      provider: "mock",
      providerEventId: "evt-1",
      orderId: "order-1",
      paidAmountCents: 1000,
    });
    expect(repository.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({ providerEventId: "evt-1", payload: {} }),
    );
  });

  it("lists masked administrator orders and derives the refund guard from entitlement state", async () => {
    const { repository, service } = createService();
    await expect(
      service.adminOrders({ page: "1", pageSize: "20", status: "paid", query: "188" }),
    ).resolves.toMatchObject({
      total: 1,
      page: 1,
      pageCount: 1,
      items: [{ userPhoneMasked: "188****0000", canRefund: true }],
    });
    expect(repository.listAdminOrders).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "PAID",
      query: "188",
    });
    await expect(service.adminOrders({ status: "unknown" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
