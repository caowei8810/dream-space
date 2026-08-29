import type {
  AdminModelCreateInput,
  AdminModelRecord,
  AdminModelVersionInput,
  AdminModelRouteUpdateInput,
  AdminProviderCreateInput,
  AdminProviderRecord,
  AdminProviderUpdateInput,
  GenerationModelOption,
} from "@dream-space/contracts";
import type { Prisma } from "@dream-space/db";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AdminModelsRepository,
  type AdminModelRecord as DatabaseAdminModelRecord,
} from "./admin-models.repository";
import { AdminModelHealthService } from "./admin-model-health.service";

@Injectable()
export class AdminModelsService {
  constructor(
    @Inject(AdminModelsRepository) private readonly repository: AdminModelsRepository,
    @Optional()
    @Inject(AdminModelHealthService)
    private readonly healthService = new AdminModelHealthService(),
  ) {}
  async list() {
    const [items, providers] = await Promise.all([
      this.repository.list(),
      this.repository.listProviders(),
    ]);
    return {
      items: items.map((item) => this.map(item)),
      total: items.length,
      providers: providers.map((provider) => this.mapProvider(provider)),
    };
  }
  async createProvider(
    input: AdminProviderCreateInput,
    actorId: string,
    requestId?: string,
  ): Promise<AdminProviderRecord> {
    const code = input?.code?.trim().toLowerCase();
    const name = input?.name?.trim();
    if (!code || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(code) || !name || name.length > 80)
      throw new BadRequestException("供应商信息不正确");
    const secretRef = input?.secretRef?.trim();
    if (!secretRef || secretRef.length > 256 || !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(secretRef))
      throw new BadRequestException("Secret 引用不正确");
    try {
      return this.mapProvider(
        await this.repository.createProvider({
          code,
          name,
          baseUrl: this.baseUrl(input.baseUrl),
          secretRef,
          timeoutMs: this.integer(input.timeoutMs, 1000, 120_000, "超时时间"),
          retryLimit: this.integer(input.retryLimit, 0, 5, "重试次数"),
          actorId,
          reason: this.reason(input.reason),
          requestId: this.requestId(requestId),
        }),
      );
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException("供应商编码已存在");
      throw error;
    }
  }
  async healthCheck(id: string, actorId: string, reason: string, requestId?: string) {
    const provider = await this.repository.findProviderForHealthCheck(this.id(id));
    if (!provider) throw new NotFoundException("供应商不存在");
    const operationReason = this.reason(reason);
    const result = await this.healthService.probe(provider);
    await this.repository.saveProviderHealth({
      providerId: provider.id,
      health: result.health,
      checkedAt: result.checkedAt,
      actorId,
      reason: operationReason,
      requestId: this.requestId(requestId),
    });
    return { ...result, checkedAt: result.checkedAt.toISOString() };
  }
  async create(input: AdminModelCreateInput, actorId: string, requestId?: string) {
    const value = this.validate(input);
    const provider = await this.repository.findProvider(value.providerId);
    if (!provider) throw new NotFoundException("供应商不存在");
    if (provider.status !== "ACTIVE") throw new BadRequestException("供应商连接尚未启用");
    try {
      return this.map(
        await this.repository.create({ ...value, actorId, requestId: this.requestId(requestId) }),
      );
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException("模型编码已存在");
      throw error;
    }
  }
  async updateProvider(
    id: string,
    input: AdminProviderUpdateInput,
    actorId: string,
    requestId?: string,
  ) {
    const providerId = this.id(id);
    const existing = await this.repository.findProvider(providerId);
    if (!existing) throw new NotFoundException("供应商不存在");
    const baseUrl = this.baseUrl(input?.baseUrl);
    const timeoutMs = this.integer(input?.timeoutMs, 1000, 120_000, "超时时间");
    const retryLimit = this.integer(input?.retryLimit, 0, 5, "重试次数");
    const name = input?.name?.trim();
    if (name && name.length > 80) throw new BadRequestException("供应商名称不正确");
    const secretRef = input?.secretRef?.trim() || null;
    if (secretRef && (secretRef.length > 256 || !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(secretRef)))
      throw new BadRequestException("Secret 引用不正确");
    if (existing.code !== "mock" && !secretRef && !existing.secretRef)
      throw new BadRequestException("启用供应商前请配置 Secret 引用");
    const item = await this.repository.updateProvider({
      id: providerId,
      name,
      baseUrl,
      secretRef,
      timeoutMs,
      retryLimit,
      status: input.status === "disabled" ? "DISABLED" : "ACTIVE",
      actorId,
      reason: this.reason(input?.reason),
      requestId: this.requestId(requestId),
    });
    if (!item) throw new NotFoundException("供应商不存在");
    return this.mapProvider(item);
  }
  async updateRoute(
    id: string,
    providerId: string,
    input: AdminModelRouteUpdateInput,
    actorId: string,
    requestId?: string,
  ) {
    if (!providerId?.trim()) throw new BadRequestException("供应商 ID 不正确");
    const weight = this.integer(input?.weight, 0, 1000, "路由权重");
    const priority = this.integer(input?.priority, 0, 10000, "路由优先级");
    if (!input || typeof input.enabled !== "boolean")
      throw new BadRequestException("路由状态不正确");
    const modelId = this.id(id);
    const provider = await this.repository.findProvider(providerId.trim());
    if (!provider) throw new NotFoundException("供应商不存在");
    if (provider.status !== "ACTIVE") throw new BadRequestException("供应商连接尚未启用");
    if (input.enabled && provider.health !== "healthy")
      throw new BadRequestException("启用路由前请先检查供应商连接");
    const providerModelId = input?.providerModelId?.trim();
    if (!providerModelId || providerModelId.length > 200)
      throw new BadRequestException("供应商模型 ID 不正确");
    const item = await this.repository.upsertRoute({
      modelId,
      providerId: providerId.trim(),
      providerModelId,
      enabled: input.enabled,
      weight,
      priority,
      actorId,
      reason: this.reason(input.reason),
      requestId: this.requestId(requestId),
    });
    if (!item) throw new NotFoundException("模型路由不存在");
    return this.map(item);
  }
  async publish(id: string, version: number, reason: string, actorId: string, requestId?: string) {
    const item = await this.repository.publish({
      id: this.id(id),
      version: this.version(version),
      actorId,
      reason: this.reason(reason),
      requestId: this.requestId(requestId),
    });
    if (!item) throw new NotFoundException("模型或配置版本不存在");
    return this.map(item);
  }
  async createVersion(
    id: string,
    input: AdminModelVersionInput,
    actorId: string,
    requestId?: string,
  ) {
    if (!input?.config || typeof input.config !== "object" || Array.isArray(input.config))
      throw new BadRequestException("模型配置应为 JSON 对象");
    const item = await this.repository.createVersion({
      id: this.id(id),
      config: input.config as Prisma.InputJsonValue,
      actorId,
      reason: this.reason(input.reason),
      requestId: this.requestId(requestId),
    });
    if (!item) throw new NotFoundException("模型不存在");
    return this.map(item);
  }
  async rollback(id: string, reason: string, actorId: string, requestId?: string) {
    const item = await this.repository.rollback({
      id: this.id(id),
      actorId,
      reason: this.reason(reason),
      requestId: this.requestId(requestId),
    });
    if (!item) throw new BadRequestException("没有可回滚的历史配置版本");
    return this.map(item);
  }
  async options(): Promise<GenerationModelOption[]> {
    const result = await this.repository.listAvailable();
    return result.map((item) => ({
      id: item.code,
      labelZh: item.name,
      labelEn: item.name,
      ...this.readCapabilities(item.capabilities),
    }));
  }
  async resolve(
    code: string,
    routingKey = code,
  ): Promise<{
    model: DatabaseAdminModelRecord;
    version: DatabaseAdminModelRecord["configVersions"][number];
    route: DatabaseAdminModelRecord["routes"][number];
  }> {
    const item = await this.repository.findPublished(code);
    if (!item) throw new BadRequestException("模型当前不可用");
    const version = item.configVersions.find((v) => v.status === "PUBLISHED");
    if (!version) throw new BadRequestException("模型配置当前不可用");
    const routes = item.routes.filter(
      (route) =>
        route.enabled &&
        route.weight > 0 &&
        route.health === "healthy" &&
        route.provider.status === "ACTIVE",
    );
    if (!routes.length) throw new BadRequestException("模型路由当前不可用");
    const priority = Math.min(...routes.map((route) => route.priority));
    const candidates = routes.filter((route) => route.priority === priority);
    const totalWeight = candidates.reduce((sum, route) => sum + route.weight, 0);
    let slot =
      Array.from(routingKey).reduce(
        (hash, character) => (hash * 31 + character.codePointAt(0)!) >>> 0,
        0,
      ) % totalWeight;
    const route =
      candidates.find((candidate) => {
        slot -= candidate.weight;
        return slot < 0;
      }) ?? candidates[candidates.length - 1]!;
    return { model: item, version, route };
  }
  private map(item: DatabaseAdminModelRecord): AdminModelRecord {
    const caps = this.readCapabilities(item.capabilities);
    const version = item.configVersions.find((value) => value.status === "PUBLISHED");
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      providerId: item.providerId,
      providerCode: item.provider.code,
      providerName: item.provider.name,
      providerBaseUrl: item.provider.baseUrl,
      providerHasSecretRef: Boolean(item.provider.secretRef),
      providerTimeoutMs: item.provider.timeoutMs,
      providerRetryLimit: item.provider.retryLimit,
      providerModelId: item.providerModelId,
      status: item.status.toLowerCase() as AdminModelRecord["status"],
      visible: item.visible,
      capabilities: caps,
      currentVersion: version?.version ?? null,
      latestVersion: item.configVersions[0]?.version ?? null,
      routeHealth: item.routes.find((route) => route.enabled)?.health ?? "disabled",
      routes: item.routes.map((route) => ({
        id: route.id,
        providerId: route.providerId,
        providerCode: route.provider.code,
        providerName: route.provider.name,
        providerModelId: route.providerModelId,
        enabled: route.enabled,
        weight: route.weight,
        priority: route.priority,
        health: route.health,
        lastCheckedAt: route.lastCheckedAt?.toISOString() ?? null,
      })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
  private mapProvider(provider: {
    id: string;
    code: string;
    name: string;
    status: string;
    baseUrl: string | null;
    secretRef: string | null;
    timeoutMs: number;
    retryLimit: number;
    health?: string;
    lastCheckedAt?: Date | null;
    updatedAt: Date;
    _count: { models: number };
  }): AdminProviderRecord {
    return {
      id: provider.id,
      code: provider.code,
      name: provider.name,
      status: provider.status.toLowerCase() as AdminProviderRecord["status"],
      baseUrl: provider.baseUrl,
      hasSecretRef: Boolean(provider.secretRef),
      timeoutMs: provider.timeoutMs,
      retryLimit: provider.retryLimit,
      modelCount: provider._count.models,
      health:
        provider.code === "mock"
          ? "healthy"
          : provider.health === "healthy" || provider.health === "unhealthy"
            ? provider.health
            : "unknown",
      lastCheckedAt: provider.lastCheckedAt?.toISOString() ?? null,
      updatedAt: provider.updatedAt.toISOString(),
    };
  }
  readCapabilities(value: unknown) {
    const x = value as Record<string, unknown> | null;
    return {
      ratios: Array.isArray(x?.ratios)
        ? x.ratios.filter((v): v is string => typeof v === "string")
        : [],
      resolutions: Array.isArray(x?.resolutions)
        ? x.resolutions.filter((v): v is string => typeof v === "string")
        : [],
      maxImageCount:
        Number.isInteger(x?.maxImageCount) && Number(x?.maxImageCount) > 0
          ? Number(x?.maxImageCount)
          : 1,
    };
  }
  private validate(input: AdminModelCreateInput) {
    const code = input?.code?.trim().toLowerCase();
    if (!code || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(code))
      throw new BadRequestException("模型编码不正确");
    const name = input.name?.trim();
    if (!name || name.length > 80) throw new BadRequestException("模型名称不正确");
    if (!input.providerId?.trim() || !input.providerModelId?.trim())
      throw new BadRequestException("供应商模型信息不完整");
    const capabilities = this.readCapabilities(input.capabilities);
    if (
      !capabilities.ratios.length ||
      !capabilities.resolutions.length ||
      capabilities.maxImageCount > 8
    )
      throw new BadRequestException("模型能力配置不正确");
    return {
      code,
      name,
      providerId: input.providerId.trim(),
      providerModelId: input.providerModelId.trim(),
      capabilities,
      reason: this.reason(input.reason),
    };
  }
  private reason(value: unknown) {
    if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 500)
      throw new BadRequestException("请填写操作原因");
    return value.trim();
  }
  private id(value: string) {
    if (!value?.trim()) throw new BadRequestException("模型 ID 不正确");
    return value.trim();
  }
  private version(value: number) {
    if (!Number.isInteger(value) || value < 1) throw new BadRequestException("配置版本不正确");
    return value;
  }
  private requestId(value?: string) {
    return value && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : randomUUID();
  }
  private baseUrl(value: unknown) {
    if (typeof value !== "string" || !value.trim())
      throw new BadRequestException("供应商 API 地址不能为空");
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException("供应商 API 地址不正确");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new BadRequestException("供应商 API 地址不正确");
    return url.toString().replace(/\/$/, "");
  }
  private integer(value: unknown, min: number, max: number, label: string) {
    const parsed = value === undefined ? (label === "超时时间" ? 30_000 : 2) : Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max)
      throw new BadRequestException(`${label}不正确`);
    return parsed;
  }
  private isUniqueConflict(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }
}
