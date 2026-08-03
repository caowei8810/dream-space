import type { GenerationRatio, GenerationResolution } from "@dream-space/contracts";

const ratioValues: Record<Exclude<GenerationRatio, "smart">, readonly [number, number]> = {
  "21:9": [21, 9],
  "16:9": [16, 9],
  "3:2": [3, 2],
  "4:3": [4, 3],
  "1:1": [1, 1],
  "3:4": [3, 4],
  "2:3": [2, 3],
  "9:16": [9, 16],
};

export function calculateGenerationCost(imageCount: number, resolution: GenerationResolution) {
  return imageCount * (resolution === "4K" ? 2 : 1);
}

export function createGenerationSessionTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const containsCjk = /[\u3400-\u9fff]/.test(normalized);
  const limit = containsCjk ? 14 : 28;
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export function resolveOutputDimensions(ratio: GenerationRatio, resolution: GenerationResolution) {
  const edge = resolution === "4K" ? 4096 : 2048;
  const [widthRatio, heightRatio] = ratio === "smart" ? [1, 1] : ratioValues[ratio];
  if (widthRatio >= heightRatio) {
    return { width: edge, height: Math.round((edge * heightRatio) / widthRatio) };
  }
  return { width: Math.round((edge * widthRatio) / heightRatio), height: edge };
}
