import { describe, expect, it } from "vitest";
import {
  calculateGenerationCost,
  createGenerationSessionTitle,
  resolveOutputDimensions,
} from "../src/generation-input";

describe("generation input rules", () => {
  it("calculates cost from resolution and image count", () => {
    expect(calculateGenerationCost(4, "2K")).toBe(4);
    expect(calculateGenerationCost(4, "4K")).toBe(8);
  });

  it("creates bounded Chinese and English session names", () => {
    expect(createGenerationSessionTitle("  一幅  安静的森林晨景  ")).toBe("一幅 安静的森林晨景");
    expect(createGenerationSessionTitle("这是一个超过十四个中文字符的会话标题示例")).toBe(
      "这是一个超过十四个中文字符的...",
    );
    expect(
      createGenerationSessionTitle("A cinematic portrait with soft natural window light"),
    ).toBe("A cinematic portrait with so...");
  });

  it("keeps output dimensions inside the requested long edge", () => {
    expect(resolveOutputDimensions("16:9", "2K")).toEqual({ width: 2048, height: 1152 });
    expect(resolveOutputDimensions("9:16", "4K")).toEqual({ width: 2304, height: 4096 });
  });
});
