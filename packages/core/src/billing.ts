export const standardImageUnitCents = 10;

export interface BillingPromotionInput {
  code: string;
  discountBps: number;
  priority: number;
}

export interface BillingQuote {
  imageCount: number;
  standardUnitCents: number;
  standardTotalCents: number;
  discountCents: number;
  finalUnitCents: number;
  finalTotalCents: number;
  promotionCode: string | null;
}

export function calculateBillingQuote(
  imageCount: number,
  promotion?: BillingPromotionInput,
  standardUnitCents = standardImageUnitCents,
): BillingQuote {
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > 8) {
    throw new RangeError("imageCount must be an integer between 1 and 8");
  }
  if (!Number.isInteger(standardUnitCents) || standardUnitCents <= 0)
    throw new RangeError("standardUnitCents must be positive");
  const standardTotalCents = standardUnitCents * imageCount;
  const discountBps = promotion?.discountBps ?? 0;
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000) {
    throw new RangeError("discountBps must be between 0 and 10000");
  }
  const discountCents = Math.floor((standardTotalCents * discountBps) / 10_000);
  const finalTotalCents = standardTotalCents - discountCents;
  return {
    imageCount,
    standardUnitCents,
    standardTotalCents,
    discountCents,
    finalUnitCents: Math.floor(finalTotalCents / imageCount),
    finalTotalCents,
    promotionCode: promotion?.code ?? null,
  };
}
