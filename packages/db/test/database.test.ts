import { describe, expect, it } from "vitest";
import { databasePackageName } from "../src";

describe("database foundation", () => {
  it("exposes the database package identity", () => {
    expect(databasePackageName).toBe("@dream-space/db");
  });
});
