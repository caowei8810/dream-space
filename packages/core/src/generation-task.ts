export const generationTaskStatuses = [
  "queued",
  "generating",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
] as const;

export type GenerationTaskStatus = (typeof generationTaskStatuses)[number];

const allowedTransitions: Record<GenerationTaskStatus, readonly GenerationTaskStatus[]> = {
  queued: ["generating", "cancelled", "failed"],
  generating: ["succeeded", "partially_succeeded", "failed", "cancelled"],
  succeeded: [],
  partially_succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionTask(from: GenerationTaskStatus, to: GenerationTaskStatus) {
  return allowedTransitions[from].includes(to);
}
