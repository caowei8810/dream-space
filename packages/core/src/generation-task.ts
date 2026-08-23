import type { GenerationTaskStatus } from "@dream-space/contracts";

export type { GenerationTaskStatus } from "@dream-space/contracts";

const allowedTransitions: Record<GenerationTaskStatus, readonly GenerationTaskStatus[]> = {
  queued: ["generating", "cancelled", "failed"],
  generating: ["reviewing", "succeeded", "partially_succeeded", "failed", "cancelled"],
  reviewing: ["queued", "succeeded", "failed", "cancelled"],
  succeeded: [],
  partially_succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionTask(from: GenerationTaskStatus, to: GenerationTaskStatus) {
  return allowedTransitions[from].includes(to);
}

export function isTerminalTaskStatus(status: GenerationTaskStatus) {
  return ["succeeded", "partially_succeeded", "failed", "cancelled"].includes(status);
}
