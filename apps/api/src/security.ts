import { createHash } from "node:crypto";

export function rateLimitIdentity(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validRequestId(value: string | undefined) {
  return value && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}
