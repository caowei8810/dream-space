import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import type { ModerationRepository } from "../src/modules/moderation/moderation.repository";

const actor = { id: "admin-1" } as never;

function createService() {
  const queue = { enqueue: vi.fn() };
  const repository = {
    listReviews: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    claimReview: vi.fn().mockResolvedValue({ id: "review-1" }),
    decideReview: vi.fn().mockResolvedValue({ id: "review-1" }),
    createAppeal: vi.fn().mockResolvedValue({
      id: "appeal-1",
      taskId: "task-1",
      resultId: null,
      reason: "希望复核",
      status: "OPEN",
      decisionNote: null,
      createdAt: new Date(),
      decidedAt: null,
    }),
    listUserAppeals: vi.fn().mockResolvedValue([]),
    listAppeals: vi.fn().mockResolvedValue([]),
    reviewResultId: vi.fn(),
    decideAppeal: vi.fn(),
  };
  return {
    repository,
    queue,
    service: new ModerationService(repository as unknown as ModerationRepository, queue as never),
  };
}

describe("ModerationService", () => {
  it("claims reviews through an atomic repository operation", async () => {
    const { repository, service } = createService();
    await service.claimReview("review-1", actor, "request-1");
    expect(repository.claimReview).toHaveBeenCalledWith("review-1", "admin-1", "request-1");
  });

  it("rejects a second decision when the review is no longer claimed by the actor", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.decideReview).mockResolvedValue(null);
    await expect(
      service.decideReview("review-1", { decision: "approved", note: "复核通过" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("requeues an input review after manual approval", async () => {
    const { repository, queue, service } = createService();
    vi.mocked(repository.decideReview).mockResolvedValue({
      reviewId: "review-1",
      taskId: "task-1",
      taskStatus: "queued",
      shouldEnqueue: true,
    });
    await service.decideReview("review-1", { decision: "approved", note: "复核通过" }, actor);
    expect(queue.enqueue).toHaveBeenCalledWith("task-1");
  });

  it("requires an appeal target and normalizes the reason", async () => {
    const { repository, service } = createService();
    await expect(service.createAppeal("user-1", { reason: "没有目标" })).rejects.toThrow();
    await service.createAppeal("user-1", { taskId: "task-1", reason: "  希望复核  " });
    expect(repository.createAppeal).toHaveBeenCalledWith("user-1", {
      taskId: "task-1",
      reason: "希望复核",
    });
  });
});
