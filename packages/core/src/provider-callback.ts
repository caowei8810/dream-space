import { createHmac, timingSafeEqual } from "node:crypto";

const signaturePrefix = "sha256=";

export interface VerifyProviderCallbackInput {
  secret: string;
  timestamp: string;
  rawBody: Buffer;
  signature: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}

export function createProviderCallbackSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
) {
  if (secret.length < 16) throw new Error("provider callback secret is too short");
  if (!/^\d{10}$/.test(timestamp)) throw new Error("provider callback timestamp is invalid");
  const digest = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex");
  return signaturePrefix + digest;
}

export function verifyProviderCallback(input: VerifyProviderCallbackInput) {
  const timestamp = Number(input.timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (
    !Number.isSafeInteger(timestamp) ||
    toleranceSeconds < 1 ||
    Math.abs(nowSeconds - timestamp) > toleranceSeconds
  ) {
    return false;
  }

  let expected: string;
  try {
    expected = createProviderCallbackSignature(input.secret, input.timestamp, input.rawBody);
  } catch {
    return false;
  }
  if (!/^sha256=[a-f0-9]{64}$/.test(input.signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(input.signature, "ascii"));
}
