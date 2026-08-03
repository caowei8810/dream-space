export interface QuotaBalance {
  available: number;
  reserved: number;
}

export class InsufficientQuotaError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`需要 ${required} 点额度，当前剩余 ${available} 点`);
    this.name = "InsufficientQuotaError";
  }
}

export function reserveQuota(balance: QuotaBalance, amount: number): QuotaBalance {
  assertAmount(amount);
  if (balance.available < amount) throw new InsufficientQuotaError(amount, balance.available);
  return { available: balance.available - amount, reserved: balance.reserved + amount };
}

export function consumeReservedQuota(balance: QuotaBalance, amount: number): QuotaBalance {
  assertReserved(balance, amount);
  return { available: balance.available, reserved: balance.reserved - amount };
}

export function releaseReservedQuota(balance: QuotaBalance, amount: number): QuotaBalance {
  assertReserved(balance, amount);
  return { available: balance.available + amount, reserved: balance.reserved - amount };
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("额度变动必须是正整数");
}

function assertReserved(balance: QuotaBalance, amount: number) {
  assertAmount(amount);
  if (balance.reserved < amount) throw new Error("预留额度不足");
}
