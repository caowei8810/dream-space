import { describe, expect, it } from "vitest";
import { FOUNDATION_QUEUE, GENERATION_QUEUE } from "../src/queues/names";

describe("worker foundation", () => {
  it("uses a stable health queue name", () => {
    expect(FOUNDATION_QUEUE).toBe("foundation-health");
    expect(GENERATION_QUEUE).toBe("image-generation");
  });
});
