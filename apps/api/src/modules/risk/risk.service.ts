import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { RiskRepository, type RiskRuleRuntimeRecord } from "./risk.repository";

@Injectable()
export class RiskService {
  constructor(@Inject(RiskRepository) private readonly repository: RiskRepository) {}

  async inspectPrompt(userId: string, prompt: string, requestId: string) {
    const normalized = prompt.normalize("NFKC").toLocaleLowerCase("zh-CN");
    const rules = await this.repository.listActiveRules();
    const rule = rules.find((candidate) => this.matches(candidate, normalized));
    if (!rule) return;

    await this.repository.recordHitAndApply({
      userId,
      rule,
      inputHash: createHash("sha256").update(prompt).digest("hex"),
      inputLength: [...prompt].length,
      requestId,
    });
    const payload = {
      code: rule.action === "MANUAL_REVIEW" ? "RISK_REVIEW_REQUIRED" : "RISK_REJECTED",
      message:
        rule.action === "MANUAL_REVIEW"
          ? "该提示词需要人工审核，暂不能生成"
          : "该提示词不符合内容安全要求",
      category: rule.category,
    };
    if (rule.action === "MANUAL_REVIEW") throw new ConflictException(payload);
    throw new ForbiddenException(payload);
  }

  private matches(rule: RiskRuleRuntimeRecord, normalizedPrompt: string) {
    if (rule.matchType === "KEYWORD") {
      return rule.pattern
        .split(/\r?\n/)
        .map((value) => value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN"))
        .filter(Boolean)
        .some((value) => normalizedPrompt.includes(value));
    }
    try {
      return new RegExp(rule.pattern, "iu").test(normalizedPrompt);
    } catch {
      return false;
    }
  }
}
