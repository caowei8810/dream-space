import { describe, expect, it } from "vitest";
import { createGenerationWorker } from "../src/main";

describe("external services mode", () => {
  it("fails closed before connecting when the live model adapter is not configured", () => {
    expect(() =>
      createGenerationWorker(
        "redis://localhost:6379",
        "postgresql://localhost/dreamspace",
        0,
        "live",
      ),
    ).toThrow(/真实图片模型适配器尚未配置/);
  });
});
