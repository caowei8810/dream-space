import { describe, expect, it } from "vitest";
import { adminAppName } from "../lib/app-metadata";

describe("admin foundation", () => {
  it("exposes the admin app name", () => {
    expect(adminAppName).toBe("Dream Space Admin");
  });
});
