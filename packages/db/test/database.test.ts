import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "../src";

describe("database foundation", () => {
  it("creates a Prisma client without opening a connection", async () => {
    const client = createDatabaseClient();

    expect(client.inspiration).toBeDefined();
    expect(client.generationSession).toBeDefined();
    expect(client.generationTask).toBeDefined();
    expect(client.generationTaskEvent).toBeDefined();
    expect(client.quotaAccount).toBeDefined();
    expect(client.quotaLedgerEntry).toBeDefined();
    await client.$disconnect();
  });
});
