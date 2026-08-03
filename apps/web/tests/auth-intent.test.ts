import type { InspirationDetail } from "@dream-space/contracts";
import { describe, expect, it } from "vitest";
import {
  consumeRestoredIntent,
  createRecreateIntent,
  isSafeReturnTo,
  parseAuthIntent,
  readPendingIntent,
  restorePendingIntent,
  savePendingIntent,
} from "../lib/auth-intent";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const inspiration: InspirationDetail = {
  id: "art-1",
  slug: "portrait-01",
  title: "作品",
  promptSummary: "摘要",
  prompt: "柔和光线下的人像",
  category: "portrait",
  imageUrl: "/inspiration/portrait-01.webp",
  thumbnailUrl: "/inspiration/portrait-01.webp",
  width: 1080,
  height: 1440,
  authorDisplayName: "创作者",
  likeCount: 10,
  modelName: "图片 4.0",
  ratio: "3:4",
  resolutionLabel: "1080 x 1440",
  isAiGenerated: true,
  sourceName: "公开灵感",
  sourceUrl: null,
  publishedAt: null,
};

describe("auth intent", () => {
  it("accepts only internal return paths", () => {
    expect(isSafeReturnTo("/inspiration/portrait-01")).toBe(true);
    expect(isSafeReturnTo("//attacker.example/path")).toBe(false);
    expect(isSafeReturnTo("https://attacker.example")).toBe(false);
    expect(isSafeReturnTo("/\\attacker.example")).toBe(false);
  });

  it("preserves a creation draft across login and consumes it once", () => {
    const storage = createStorage();
    const intent = createRecreateIntent(inspiration, "/inspiration/portrait-01");

    savePendingIntent(storage, intent);
    expect(readPendingIntent(storage)).toEqual(intent);
    expect(restorePendingIntent(storage)).toEqual(intent);
    expect(readPendingIntent(storage)).toBeNull();
    expect(consumeRestoredIntent(storage, intent.returnTo)).toEqual(intent);
    expect(consumeRestoredIntent(storage, intent.returnTo)).toBeNull();
  });

  it("rejects malformed persisted data", () => {
    expect(parseAuthIntent({ returnTo: "/inspiration", action: "delete", draft: null })).toBeNull();
    expect(parseAuthIntent({ returnTo: "/inspiration", action: "generate", draft: {} })).toBeNull();
  });
});
