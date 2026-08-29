import { describe, expect, it } from "vitest";
import { queueAttemptsForRetryLimit } from "../src/modules/generation/generation.queue";

describe("GenerationQueue retry policy", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [5, 6],
    [-1, 1],
    [99, 6],
  ])("maps retryLimit %s to BullMQ attempts %s", (retryLimit, attempts) => {
    expect(queueAttemptsForRetryLimit(retryLimit)).toBe(attempts);
  });

  it("uses the safe default for a non-integer value", () => {
    expect(queueAttemptsForRetryLimit(Number.NaN)).toBe(3);
    expect(queueAttemptsForRetryLimit(1.5)).toBe(3);
  });
});
