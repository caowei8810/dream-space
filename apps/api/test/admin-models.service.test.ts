import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminModelsService } from "../src/modules/admin/admin-models.service";
import type { AdminModelsRepository } from "../src/modules/admin/admin-models.repository";

function createService() {
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    listProviders: vi.fn().mockResolvedValue([]),
    listAvailable: vi.fn().mockResolvedValue([]),
    findProvider: vi.fn(),
    findRoute: vi.fn(),
    findProviderForHealthCheck: vi.fn(),
    saveProviderHealth: vi.fn(),
    createProvider: vi.fn(),
    updateProvider: vi.fn(),
    create: vi.fn(),
    createVersion: vi.fn(),
    publish: vi.fn(),
    rollback: vi.fn(),
    findPublished: vi.fn(),
    updateRoute: vi.fn(),
  };
  return {
    repository,
    service: new AdminModelsService(repository as unknown as AdminModelsRepository),
  };
}

describe("AdminModelsService", () => {
  it("creates provider connections without exposing secrets", async () => {
    const { repository, service } = createService();
    repository.createProvider.mockResolvedValue({
      id: "provider-1",
      code: "openai",
      name: "OpenAI",
      status: "ACTIVE",
      baseUrl: "https://api.openai.com/v1",
      secretRef: "env://OPENAI_API_KEY",
      timeoutMs: 30000,
      retryLimit: 2,
      updatedAt: new Date(),
      _count: { models: 0 },
    });
    const result = await service.createProvider(
      {
        code: "OpenAI",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1/",
        secretRef: "env://OPENAI_API_KEY",
        timeoutMs: 30000,
        retryLimit: 2,
        reason: "配置连接",
      },
      "admin-1",
    );
    expect(result).toMatchObject({
      code: "openai",
      baseUrl: "https://api.openai.com/v1",
      hasSecretRef: true,
      modelCount: 0,
    });
    expect(result).not.toHaveProperty("secretRef");
  });

  it("validates route activation and writes a mapped route response", async () => {
    const { service, repository } = createService();
    repository.findRoute.mockResolvedValue({ health: "unknown" });
    await expect(
      service.updateRoute(
        "model-1",
        "provider-1",
        { enabled: true, weight: 100, priority: 0, reason: "启用" },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps duplicate provider codes to conflict", async () => {
    const { repository, service } = createService();
    repository.createProvider.mockRejectedValue({ code: "P2002" });
    await expect(
      service.createProvider(
        {
          code: "openai",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          secretRef: "env://OPENAI_API_KEY",
          timeoutMs: 30000,
          retryLimit: 2,
          reason: "配置连接",
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("validates model capability declarations", async () => {
    const { service } = createService();
    await expect(
      service.create(
        {
          code: "demo",
          name: "Demo",
          providerId: "provider-1",
          providerModelId: "demo",
          capabilities: { ratios: [], resolutions: ["2K"], maxImageCount: 1 },
          reason: "测试",
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps duplicate model codes to conflict", async () => {
    const { repository, service } = createService();
    repository.create.mockRejectedValue({ code: "P2002" });
    repository.findProvider.mockResolvedValue({
      id: "provider-1",
      code: "mock",
      status: "ACTIVE",
      secretRef: null,
    });
    await expect(
      service.create(
        {
          code: "demo",
          name: "Demo",
          providerId: "provider-1",
          providerModelId: "demo",
          capabilities: { ratios: ["1:1"], resolutions: ["2K"], maxImageCount: 1 },
          reason: "测试",
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unavailable models and malformed version configs", async () => {
    const { repository, service } = createService();
    repository.findPublished.mockResolvedValue(null);
    await expect(service.resolve("disabled-model")).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createVersion(
        "model-1",
        { config: [] as unknown as Record<string, unknown>, reason: "测试" },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires a secret reference before enabling a live provider", async () => {
    const { repository, service } = createService();
    repository.findProvider.mockResolvedValue({
      id: "provider-1",
      code: "openai",
      status: "DRAFT",
      secretRef: null,
    });
    await expect(
      service.updateProvider(
        "provider-1",
        {
          baseUrl: "https://api.openai.com/v1",
          timeoutMs: 30000,
          retryLimit: 2,
          reason: "配置连接",
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateProvider(
        "provider-1",
        {
          baseUrl: "https://api.openai.com/v1",
          secretRef: "raw-key",
          timeoutMs: 30000,
          retryLimit: 2,
          reason: "配置连接",
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
