import { describe, expect, it } from "vitest";
import { readSessionToken } from "../src/modules/auth/session-cookie";

describe("session cookie parsing", () => {
  it("reads only the exact session cookie and decodes its value", () => {
    expect(readSessionToken("theme=dark; dreamspace_session=abc%2D123; other=value")).toBe(
      "abc-123",
    );
    expect(readSessionToken("dreamspace_session_extra=wrong")).toBeNull();
  });

  it("rejects malformed cookie encoding", () => {
    expect(readSessionToken("dreamspace_session=%E0%A4%A")).toBeNull();
  });
});
