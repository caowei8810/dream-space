import { describe, expect, it, vi } from "vitest";
import { ModerationRepository } from "../src/modules/moderation/moderation.repository";

describe("ModerationRepository administrator audit", () => {
  it("claims a review and writes its audit event in one transaction", async () => {
    const review = { id: "review-1", status: "CLAIMED", assignedToId: "admin-1" };
    const transaction = {
      moderationReview: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(review),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const repository = new ModerationRepository({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.claimReview("review-1", "admin-1", "request-1")).resolves.toBe(review);
    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminUserId: "admin-1",
        action: "moderation.review.claim",
        resourceId: "review-1",
        requestId: "request-1",
      }),
    });
  });
});
