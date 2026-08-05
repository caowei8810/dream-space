import type { GenerationTaskSnapshot, ProviderImage } from "../generation/generation-processor";

export type ModerationStage = "input" | "output";
export type ModerationDecision = {
  status: "approved" | "rejected";
  codes: string[];
};

export interface ContentModerator {
  moderateInput(task: GenerationTaskSnapshot): Promise<ModerationDecision>;
  moderateOutput(task: GenerationTaskSnapshot, image: ProviderImage): Promise<ModerationDecision>;
}

const rejectedInputMarker = "[mock-reject-input]";
const rejectedOutputMarker = Buffer.from("MOCK_MODERATION_REJECT_OUTPUT");

export class DeterministicMockContentModerator implements ContentModerator {
  async moderateInput(task: GenerationTaskSnapshot): Promise<ModerationDecision> {
    return task.prompt.includes(rejectedInputMarker)
      ? { status: "rejected", codes: ["MOCK_INPUT_REJECTED"] }
      : { status: "approved", codes: [] };
  }

  async moderateOutput(
    _task: GenerationTaskSnapshot,
    image: ProviderImage,
  ): Promise<ModerationDecision> {
    return image.data.includes(rejectedOutputMarker)
      ? { status: "rejected", codes: ["MOCK_OUTPUT_REJECTED"] }
      : { status: "approved", codes: [] };
  }
}
