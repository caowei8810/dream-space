import { describe, expect, it } from "vitest";
import { calculateBillingQuote } from "../src/billing";

describe("billing quote", () => {
  it("calculates integer cents and a five-fold promotion without floating point", () => {
    expect(calculateBillingQuote(3, { code: "HALF", discountBps: 5000, priority: 1 })).toEqual({
      imageCount: 3,
      standardUnitCents: 10,
      standardTotalCents: 30,
      discountCents: 15,
      finalUnitCents: 5,
      finalTotalCents: 15,
      promotionCode: "HALF",
    });
  });

  it("rejects invalid image counts and discounts", () => {
    expect(() => calculateBillingQuote(0)).toThrow(RangeError);
    expect(() =>
      calculateBillingQuote(1, { code: "BAD", discountBps: 10001, priority: 0 }),
    ).toThrow(RangeError);
  });
});
