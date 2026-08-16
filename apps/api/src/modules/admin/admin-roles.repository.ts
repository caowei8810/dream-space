import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

const roleInclude = {
  permissions: {
    include: { permission: true },
    orderBy: { permission: { code: "asc" as const } },
  },
  _count: { select: { users: true } },
} as const;

export type AdminRoleDatabaseRecord = Prisma.AdminRoleGetPayload<{ include: typeof roleInclude }>;

@Injectable()
export class AdminRolesRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list() {
    const [roles, permissions] = await this.database.$transaction([
      this.database.adminRole.findMany({
        include: roleInclude,
        orderBy: [{ system: "desc" }, { name: "asc" }],
      }),
      this.database.adminPermission.findMany({
        where: { active: true },
        orderBy: [{ risk: "desc" }, { code: "asc" }],
      }),
    ]);
    return { roles, permissions };
  }

  findById(id: string): Promise<AdminRoleDatabaseRecord | null> {
    return this.database.adminRole.findUnique({ where: { id }, include: roleInclude });
  }

  findByCode(code: string): Promise<{ id: string } | null> {
    return this.database.adminRole.findUnique({ where: { code }, select: { id: true } });
  }

  findActivePermissions(ids: string[]): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      description: string;
      risk: string;
      active: boolean;
    }>
  > {
    return this.database.adminPermission.findMany({
      where: { id: { in: ids }, active: true },
      orderBy: { code: "asc" },
    });
  }

  async create(input: {
    code: string;
    name: string;
    description: string;
    permissionIds: string[];
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const role = await transaction.adminRole.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          permissions: {
            create: input.permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: roleInclude,
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-role.create",
          resourceType: "AdminRole",
          resourceId: role.id,
          reason: input.reason,
          requestId: input.requestId,
          after: this.snapshot(role),
        },
      });
      return role;
    });
  }

  async update(input: {
    id: string;
    name: string;
    description: string;
    active: boolean;
    permissionIds: string[];
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.adminRole.findUniqueOrThrow({
        where: { id: input.id },
        include: roleInclude,
      });
      await transaction.adminRolePermission.deleteMany({ where: { roleId: input.id } });
      const role = await transaction.adminRole.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          active: input.active,
          permissions: {
            create: input.permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: roleInclude,
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-role.update",
          resourceType: "AdminRole",
          resourceId: role.id,
          reason: input.reason,
          requestId: input.requestId,
          before: this.snapshot(before),
          after: this.snapshot(role),
        },
      });
      return role;
    });
  }

  async remove(input: { id: string; actorId: string; reason: string; requestId: string }) {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.adminRole.findUniqueOrThrow({
        where: { id: input.id },
        include: roleInclude,
      });
      await transaction.adminRolePermission.deleteMany({ where: { roleId: input.id } });
      await transaction.adminRole.delete({ where: { id: input.id } });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-role.delete",
          resourceType: "AdminRole",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          before: this.snapshot(before),
        },
      });
    });
  }

  private snapshot(role: AdminRoleDatabaseRecord) {
    return {
      code: role.code,
      name: role.name,
      active: role.active,
      permissionIds: role.permissions.map((item) => item.permissionId).sort(),
    };
  }
}
