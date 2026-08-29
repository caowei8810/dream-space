import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const include = {
  provider: true,
  routes: { include: { provider: true }, orderBy: { priority: "asc" as const } },
  configVersions: { orderBy: { version: "desc" as const }, take: 20 },
} as const;
export type AdminModelRecord = Prisma.ModelGetPayload<{ include: typeof include }>;

@Injectable()
export class AdminModelsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  list(): Promise<AdminModelRecord[]> {
    return this.database.model.findMany({ include, orderBy: [{ status: "asc" }, { code: "asc" }] });
  }

  listProviders() {
    return this.database.provider.findMany({
      include: { _count: { select: { models: true } } },
      orderBy: { code: "asc" },
    });
  }

  findProviderForHealthCheck(id: string): Promise<{
    id: string;
    code: string;
    baseUrl: string | null;
    secretRef: string | null;
    timeoutMs: number;
  } | null> {
    return this.database.provider.findUnique({
      where: { id },
      select: { id: true, code: true, baseUrl: true, secretRef: true, timeoutMs: true },
    });
  }

  findRoute(modelId: string, providerId: string): Promise<{ health: string } | null> {
    return this.database.modelRoute.findUnique({
      where: { modelId_providerId: { modelId, providerId } },
      select: { health: true },
    });
  }

  async saveProviderHealth(input: {
    providerId: string;
    health: "healthy" | "unhealthy";
    checkedAt: Date;
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (tx) => {
      await tx.provider.update({
        where: { id: input.providerId },
        data: { health: input.health, lastCheckedAt: input.checkedAt },
      });
      await tx.modelRoute.updateMany({
        where: { providerId: input.providerId },
        data: {
          health: input.health,
          lastCheckedAt: input.checkedAt,
          ...(input.health === "unhealthy" ? { enabled: false } : {}),
        },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "provider.health-check",
          resourceType: "Provider",
          resourceId: input.providerId,
          reason: input.reason,
          requestId: input.requestId,
          after: { health: input.health, checkedAt: input.checkedAt.toISOString() },
        },
      });
    });
  }

  findProvider(id: string): Promise<{
    id: string;
    code: string;
    status: string;
    secretRef: string | null;
    health: string;
  } | null> {
    return this.database.provider.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, secretRef: true, health: true },
    });
  }

  createProvider(input: {
    code: string;
    name: string;
    baseUrl: string;
    secretRef: string;
    timeoutMs: number;
    retryLimit: number;
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (tx) => {
      const provider = await tx.provider.create({
        data: {
          code: input.code,
          name: input.name,
          baseUrl: input.baseUrl,
          secretRef: input.secretRef,
          timeoutMs: input.timeoutMs,
          retryLimit: input.retryLimit,
          status: "ACTIVE",
        },
        include: { _count: { select: { models: true } } },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "provider.create",
          resourceType: "Provider",
          resourceId: provider.id,
          reason: input.reason,
          requestId: input.requestId,
          after: {
            code: provider.code,
            baseUrl: provider.baseUrl,
            hasSecretRef: true,
            status: provider.status,
          },
        },
      });
      return provider;
    });
  }

  listAvailable(): Promise<AdminModelRecord[]> {
    return this.database.model.findMany({
      where: {
        status: "PUBLISHED",
        visible: true,
        configVersions: { some: { status: "PUBLISHED" } },
        routes: {
          some: {
            enabled: true,
            health: "healthy",
            provider: {
              status: "ACTIVE",
              OR: [{ code: "mock" }, { baseUrl: { not: null }, secretRef: { not: null } }],
            },
          },
        },
      },
      include,
      orderBy: { code: "asc" },
    });
  }

  async create(input: {
    code: string;
    name: string;
    providerId: string;
    providerModelId: string;
    capabilities: object;
    actorId: string;
    reason: string;
    requestId: string;
  }): Promise<AdminModelRecord> {
    return this.database.$transaction(async (tx) => {
      const provider = await tx.provider.findUniqueOrThrow({
        where: { id: input.providerId },
        select: { id: true, health: true, lastCheckedAt: true },
      });
      const model = await tx.model.create({
        data: {
          code: input.code,
          name: input.name,
          providerId: provider.id,
          providerModelId: input.providerModelId,
          capabilities: input.capabilities,
          status: "DRAFT",
          visible: false,
        },
        include,
      });
      await tx.modelRoute.create({
        data: {
          modelId: model.id,
          providerId: provider.id,
          providerModelId: input.providerModelId,
          enabled: false,
          health: provider.health,
          lastCheckedAt: provider.lastCheckedAt,
        },
      });
      await tx.modelConfigVersion.create({
        data: { modelId: model.id, version: 1, config: {}, reason: input.reason },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "model.create",
          resourceType: "Model",
          resourceId: model.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { code: model.code, status: model.status },
        },
      });
      return tx.model.findUniqueOrThrow({ where: { id: model.id }, include });
    });
  }

  async updateProvider(input: {
    id: string;
    name?: string;
    baseUrl: string;
    secretRef: string | null;
    timeoutMs: number;
    retryLimit: number;
    status: "ACTIVE" | "DISABLED";
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (tx) => {
      const before = await tx.provider.findUnique({ where: { id: input.id } });
      if (!before) return null;
      const provider = await tx.provider.update({
        where: { id: input.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          baseUrl: input.baseUrl,
          ...(input.secretRef ? { secretRef: input.secretRef } : {}),
          timeoutMs: input.timeoutMs,
          retryLimit: input.retryLimit,
          status: input.status,
          health: "unknown",
          lastCheckedAt: null,
        },
        include: { _count: { select: { models: true } } },
      });
      await tx.modelRoute.updateMany({
        where: { providerId: input.id },
        data: { health: "unknown", lastCheckedAt: null, enabled: false },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "provider.update",
          resourceType: "Provider",
          resourceId: provider.id,
          reason: input.reason,
          requestId: input.requestId,
          before: {
            status: before.status,
            baseUrl: before.baseUrl,
            hasSecretRef: Boolean(before.secretRef),
            timeoutMs: before.timeoutMs,
            retryLimit: before.retryLimit,
          },
          after: {
            status: provider.status,
            baseUrl: provider.baseUrl,
            hasSecretRef: Boolean(provider.secretRef),
            timeoutMs: provider.timeoutMs,
            retryLimit: provider.retryLimit,
          },
        },
      });
      return provider;
    });
  }

  async upsertRoute(input: {
    modelId: string;
    providerId: string;
    providerModelId: string;
    enabled: boolean;
    weight: number;
    priority: number;
    actorId: string;
    reason: string;
    requestId: string;
  }): Promise<AdminModelRecord | null> {
    return this.database.$transaction(async (tx) => {
      const model = await tx.model.findUnique({
        where: { id: input.modelId },
        select: { id: true },
      });
      if (!model) return null;
      const route = await tx.modelRoute.findUnique({
        where: { modelId_providerId: { modelId: input.modelId, providerId: input.providerId } },
        include: { provider: true },
      });
      const provider =
        route?.provider ?? (await tx.provider.findUnique({ where: { id: input.providerId } }));
      if (!provider) return null;
      if (input.enabled && provider.health !== "healthy") return null;
      const updated = await tx.modelRoute.upsert({
        where: { modelId_providerId: { modelId: input.modelId, providerId: input.providerId } },
        create: {
          modelId: input.modelId,
          providerId: input.providerId,
          providerModelId: input.providerModelId,
          enabled: input.enabled,
          weight: input.weight,
          priority: input.priority,
          health: provider.health,
          lastCheckedAt: provider.lastCheckedAt,
        },
        update: {
          providerModelId: input.providerModelId,
          enabled: input.enabled,
          weight: input.weight,
          priority: input.priority,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "model.route.update",
          resourceType: "ModelRoute",
          resourceId: updated.id,
          reason: input.reason,
          requestId: input.requestId,
          before: route
            ? {
                providerModelId: route.providerModelId,
                enabled: route.enabled,
                weight: route.weight,
                priority: route.priority,
                health: route.health,
              }
            : undefined,
          after: {
            providerModelId: updated.providerModelId,
            enabled: updated.enabled,
            weight: updated.weight,
            priority: updated.priority,
            health: updated.health,
          },
        },
      });
      return tx.model.findUniqueOrThrow({ where: { id: input.modelId }, include });
    });
  }

  async publish(input: {
    id: string;
    version: number;
    actorId: string;
    reason: string;
    requestId: string;
  }): Promise<AdminModelRecord | null> {
    return this.database.$transaction(async (tx) => {
      const model = await tx.model.findUnique({ where: { id: input.id }, include });
      if (!model) return null;
      const version = await tx.modelConfigVersion.findUnique({
        where: { modelId_version: { modelId: input.id, version: input.version } },
      });
      if (!version) return null;
      const usableRoute = model.routes.some(
        (route) =>
          route.enabled && route.health === "healthy" && route.provider.status === "ACTIVE",
      );
      if (!usableRoute) return null;
      await tx.modelConfigVersion.updateMany({
        where: { modelId: input.id, status: "PUBLISHED" },
        data: { status: "ROLLED_BACK" },
      });
      await tx.modelConfigVersion.update({
        where: { id: version.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), reason: input.reason },
      });
      await tx.model.update({
        where: { id: input.id },
        data: { status: "PUBLISHED", visible: true },
      });
      await tx.modelRoute.updateMany({
        where: { modelId: input.id, provider: { status: "ACTIVE" } },
        data: { enabled: true },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "model.publish",
          resourceType: "Model",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { version: input.version, status: "PUBLISHED" },
        },
      });
      return tx.model.findUniqueOrThrow({ where: { id: input.id }, include });
    });
  }

  async createVersion(input: {
    id: string;
    config: Prisma.InputJsonValue;
    actorId: string;
    reason: string;
    requestId: string;
  }): Promise<AdminModelRecord | null> {
    return this.database.$transaction(async (tx) => {
      const model = await tx.model.findUnique({ where: { id: input.id }, include });
      if (!model) return null;
      const version = (model.configVersions[0]?.version ?? 0) + 1;
      await tx.modelConfigVersion.create({
        data: { modelId: input.id, version, config: input.config, reason: input.reason },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "model.version.create",
          resourceType: "Model",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { version, status: "DRAFT" },
        },
      });
      return tx.model.findUniqueOrThrow({ where: { id: input.id }, include });
    });
  }

  async rollback(input: {
    id: string;
    actorId: string;
    reason: string;
    requestId: string;
  }): Promise<AdminModelRecord | null> {
    return this.database.$transaction(async (tx) => {
      const model = await tx.model.findUnique({ where: { id: input.id }, include });
      if (!model) return null;
      const published = model.configVersions.find((version) => version.status === "PUBLISHED");
      const previous = model.configVersions.find(
        (version) => version.version < (published?.version ?? Infinity),
      );
      if (!previous) return null;
      await tx.modelConfigVersion.updateMany({
        where: { modelId: input.id, status: "PUBLISHED" },
        data: { status: "ROLLED_BACK" },
      });
      await tx.modelConfigVersion.update({
        where: { id: previous.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), reason: input.reason },
      });
      await tx.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "model.rollback",
          resourceType: "Model",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          before: { version: published?.version ?? null },
          after: { version: previous.version, status: "PUBLISHED" },
        },
      });
      return tx.model.findUniqueOrThrow({ where: { id: input.id }, include });
    });
  }

  findPublished(code: string): Promise<AdminModelRecord | null> {
    return this.database.model.findFirst({
      where: {
        code,
        status: "PUBLISHED",
        visible: true,
        routes: {
          some: {
            enabled: true,
            health: "healthy",
            provider: {
              status: "ACTIVE",
              OR: [{ code: "mock" }, { baseUrl: { not: null }, secretRef: { not: null } }],
            },
          },
        },
      },
      include,
    });
  }
}
