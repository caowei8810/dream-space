import { describe, expect, it } from "vitest";
import { createProviderCallbackSignature, verifyProviderCallback } from "../src";

const secret = "test-provider-callback-secret";
const timestamp = "1785808800";
const rawBody = Buffer.from('{"eventId":"event-1","status":"succeeded"}');

describe("provider callback signatures", () => {
  it("verifies the exact raw body inside the accepted time window", () => {
    const signature = createProviderCallbackSignature(secret, timestamp, rawBody);

    expect(
      verifyProviderCallback({
        secret,
        timestamp,
        rawBody,
        signature,
        nowSeconds: Number(timestamp) + 120,
      }),
    ).toBe(true);
  });

  it("rejects modified payloads, stale timestamps and malformed signatures", () => {
    const signature = createProviderCallbackSignature(secret, timestamp, rawBody);

    expect(
      verifyProviderCallback({
        secret,
        timestamp,
        rawBody: Buffer.from(rawBody.toString().replace("succeeded", "failed")),
        signature,
        nowSeconds: Number(timestamp),
      }),
    ).toBe(false);
    expect(
      verifyProviderCallback({
        secret,
        timestamp,
        rawBody,
        signature,
        nowSeconds: Number(timestamp) + 301,
      }),
    ).toBe(false);
    expect(
      verifyProviderCallback({
        secret,
        timestamp,
        rawBody,
        signature: "sha256=invalid",
        nowSeconds: Number(timestamp),
      }),
    ).toBe(false);
  });
});
