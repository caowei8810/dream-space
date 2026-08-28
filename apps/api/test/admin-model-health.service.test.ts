import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { AdminModelHealthService } from "../src/modules/admin/admin-model-health.service";

describe("AdminModelHealthService", () => {
  const service = new AdminModelHealthService();

  afterEach(() => {
    delete process.env.TEST_PROVIDER_KEY;
  });

  it("marks the local mock provider healthy without a credential", async () => {
    await expect(
      service.probe({ code: "mock", baseUrl: null, secretRef: null, timeoutMs: 1000 }),
    ).resolves.toMatchObject({ health: "healthy", message: "本地模拟服务可用" });
  });

  it("rejects missing environment secrets", async () => {
    await expect(
      service.probe({
        code: "openai",
        baseUrl: "https://api.openai.com/v1",
        secretRef: "env://TEST_PROVIDER_KEY",
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks loopback and private provider addresses", async () => {
    process.env.TEST_PROVIDER_KEY = "test-only";
    await expect(
      service.probe({
        code: "openai",
        baseUrl: "http://127.0.0.1:4000",
        secretRef: "env://TEST_PROVIDER_KEY",
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
