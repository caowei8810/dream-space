import { describe, expect, it } from "vitest";
import { canTransitionTask, isTerminalTaskStatus } from "../src/generation-task";

describe("generation task state machine", () => {
  it("allows a queued task to start", () => {
    expect(canTransitionTask("queued", "generating")).toBe(true);
  });

  it("prevents a completed task from restarting", () => {
    expect(canTransitionTask("succeeded", "generating")).toBe(false);
  });

  it("allows active tasks to fail or cancel but keeps terminal states immutable", () => {
    expect(canTransitionTask("queued", "failed")).toBe(true);
    expect(canTransitionTask("generating", "cancelled")).toBe(true);
    expect(canTransitionTask("failed", "queued")).toBe(false);
    expect(isTerminalTaskStatus("partially_succeeded")).toBe(true);
    expect(isTerminalTaskStatus("generating")).toBe(false);
  });
});
