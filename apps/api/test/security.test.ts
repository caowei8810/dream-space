import { describe, expect, it } from "vitest";
import { rateLimitIdentity, validRequestId } from "../src/security";

describe("API security helpers", () => {
  it("hashes rate-limit identities without exposing credentials", () => {
    const value = rateLimitIdentity("dreamspace_admin_session=secret-value");
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(value).not.toContain("secret-value");
    expect(rateLimitIdentity("same")).toBe(rateLimitIdentity("same"));
  });

  it("accepts bounded request IDs only", () => {
    expect(validRequestId("req-123")).toBe("req-123");
    expect(validRequestId("bad id")).toBeUndefined();
    expect(validRequestId("x".repeat(129))).toBeUndefined();
  });
});
