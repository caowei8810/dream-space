import { describe, expect, it } from "vitest";
import { userAppName } from "../lib/app-metadata";

describe("web foundation", () => {
  it("exposes the user app name", () => {
    expect(userAppName).toBe("Dream Space Web");
  });
});
