import type { AuthDraft, AuthIntent, InspirationDetail } from "@dream-space/contracts";

const pendingIntentKey = "dream-space-pending-auth-intent";
const restoredIntentKey = "dream-space-restored-auth-intent";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSafeReturnTo(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export function parseAuthIntent(value: unknown): AuthIntent | null {
  if (!isRecord(value) || !isSafeReturnTo(value.returnTo)) return null;
  if (!(["resume", "generate", "download", "like"] as const).includes(value.action as never)) {
    return null;
  }

  let draft: AuthDraft | null = null;
  if (value.draft !== null) {
    if (!isRecord(value.draft)) return null;
    const candidate = value.draft;
    if (
      typeof candidate.prompt !== "string" ||
      typeof candidate.model !== "string" ||
      typeof candidate.ratio !== "string" ||
      typeof candidate.resolution !== "string" ||
      (candidate.referenceImageUrl !== null && typeof candidate.referenceImageUrl !== "string")
    ) {
      return null;
    }
    draft = candidate as unknown as AuthDraft;
  }

  return { returnTo: value.returnTo, action: value.action as AuthIntent["action"], draft };
}

function read(storage: Storage, key: string) {
  try {
    const raw = storage.getItem(key);
    return raw ? parseAuthIntent(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function savePendingIntent(storage: Storage, intent: AuthIntent) {
  storage.setItem(pendingIntentKey, JSON.stringify(intent));
}

export function readPendingIntent(storage: Storage) {
  return read(storage, pendingIntentKey);
}

export function restorePendingIntent(storage: Storage) {
  const intent = readPendingIntent(storage);
  if (!intent) return null;
  storage.setItem(restoredIntentKey, JSON.stringify(intent));
  storage.removeItem(pendingIntentKey);
  return intent;
}

export function consumeRestoredIntent(storage: Storage, returnTo: string) {
  const intent = read(storage, restoredIntentKey);
  if (!intent || intent.returnTo !== returnTo) return null;
  storage.removeItem(restoredIntentKey);
  return intent;
}

export function createRecreateIntent(inspiration: InspirationDetail, returnTo: string): AuthIntent {
  return {
    returnTo,
    action: "generate",
    draft: {
      prompt: inspiration.prompt,
      model: inspiration.modelName,
      ratio: inspiration.ratio,
      resolution: inspiration.resolutionLabel,
      referenceImageUrl: null,
    },
  };
}
