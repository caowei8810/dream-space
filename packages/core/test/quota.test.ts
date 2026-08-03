import { describe, expect, it } from "vitest";
import {
  consumeReservedQuota,
  InsufficientQuotaError,
  releaseReservedQuota,
  reserveQuota,
} from "../src/quota";

describe("quota rules", () => {
  it("reserves then consumes credits without changing available twice", () => {
    const reserved = reserveQuota({ available: 100, reserved: 0 }, 4);
    expect(reserved).toEqual({ available: 96, reserved: 4 });
    expect(consumeReservedQuota(reserved, 4)).toEqual({ available: 96, reserved: 0 });
  });

  it("returns reserved credits after a failed or cancelled task", () => {
    expect(releaseReservedQuota({ available: 96, reserved: 4 }, 4)).toEqual({
      available: 100,
      reserved: 0,
    });
  });

  it("rejects insufficient or invalid quota operations", () => {
    expect(() => reserveQuota({ available: 1, reserved: 0 }, 2)).toThrow(InsufficientQuotaError);
    expect(() => consumeReservedQuota({ available: 99, reserved: 0 }, 1)).toThrow("预留额度不足");
  });
});
