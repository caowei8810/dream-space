import { describe, expect, it } from "vitest";
import { canTransitionTask } from "../src/generation-task";

describe("generation task state machine", () => {
  it("allows a queued task to start", () => {
    expect(canTransitionTask("queued", "generating")).toBe(true);
  });

  it("prevents a completed task from restarting", () => {
    expect(canTransitionTask("succeeded", "generating")).toBe(false);
  });
});
