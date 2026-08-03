import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "../src";

describe("database foundation", () => {
  it("creates a Prisma client without opening a connection", async () => {
    const client = createDatabaseClient();

    expect(client.inspiration).toBeDefined();
    await client.$disconnect();
  });
});
