import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RiskService } from "../src/modules/risk/risk.service";
import type { RiskRepository } from "../src/modules/risk/risk.repository";

function createService(action: "REJECT" | "RESTRICT" | "BAN" | "MANUAL_REVIEW") {
  const repository = {
    listActiveRules: vi.fn().mockResolvedValue([
      {
        id: "rule-1",
        code: "prompt-sensitive",
        version: 2,
        name: "敏感词",
        matchType: "KEYWORD" as const,
        pattern: "敏感词",
        category: "涉敏",
        action,
        priority: 100,
      },
    ]),
    recordHitAndApply: vi.fn().mockResolvedValue({ id: "hit-1" }),
  };
  return { repository, service: new RiskService(repository as unknown as RiskRepository) };
}

describe("RiskService", () => {
  it("allows prompts without an active rule hit", async () => {
    const repository = { listActiveRules: vi.fn().mockResolvedValue([]) };
    await expect(new RiskService(repository as unknown as RiskRepository).inspectPrompt("user-1", "晴天海边", "request-1")).resolves.toBeUndefined();
    expect(repository.listActiveRules).toHaveBeenCalledOnce();
  });

  it("rejects a matched prompt without calling a provider", async () => {
    const { repository, service } = createService("REJECT");
    await expect(service.inspectPrompt("user-1", "包含敏感词的提示", "request-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.recordHitAndApply).toHaveBeenCalledWith(expect.objectContaining({ requestId: "request-1", inputLength: 8 }));
  });

  it("routes manual review to a conflict response", async () => {
    const { service } = createService("MANUAL_REVIEW");
    await expect(service.inspectPrompt("user-1", "敏感词", "request-2")).rejects.toBeInstanceOf(ConflictException);
  });

  it("supports regex rules", async () => {
    const repository = {
      listActiveRules: vi.fn().mockResolvedValue([{ id: "rule-1", code: "regex", version: 1, name: "regex", matchType: "REGEX", pattern: "暴恐|terror", category: "暴恐", action: "BAN", priority: 10 }]),
      recordHitAndApply: vi.fn().mockResolvedValue({ id: "hit-1" }),
    };
    await expect(new RiskService(repository as unknown as RiskRepository).inspectPrompt("user-1", "terror content", "request-3")).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.recordHitAndApply).toHaveBeenCalledOnce();
  });
});
