import type { AdminAccountStatus } from "@dream-space/contracts";
import type { DatabaseClient, Prisma } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface AdminAccountQuery {
  query?: string;
  status?: AdminAccountStatus;
  roleId?: string;
  page: number;
  pageSize: number;
}

export interface AdminAccountDatabaseRecord {
  id: string;
  employeeNo: string;
  phone: string;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    roleId: string;
    role: { id: string; code: string; name: string; system: boolean };
  }>;
  _count: { sessions: number };
}

const databaseStatus = {
  invited: "INVITED",
  active: "ACTIVE",
  suspended: "SUSPENDED",
  revoked: "REVOKED",
} as const;

const accountInclude = (now: Date) =>
  ({
    roles: { include: { role: true }, orderBy: { role: { name: "asc" as const } } },
    _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
  }) as const;

@Injectable()
export class AdminAccountsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(input: AdminAccountQuery) {
    const where: Prisma.AdminUserWhereInput = {
      ...(input.status ? { status: databaseStatus[input.status] } : {}),
      ...(input.roleId ? { roles: { some: { roleId: input.roleId } } } : {}),
      ...(input.query
        ? {
            OR: [
              { employeeNo: { contains: input.query, mode: "insensitive" } },
              { displayName: { contains: input.query, mode: "insensitive" } },
              { phone: { contains: input.query } },
            ],
          }
        : {}),
    };
    const now = new Date();
    const include = accountInclude(now);
    const [items, total, roles] = await this.database.$transaction([
      this.database.adminUser.findMany({
        where,
        include,
        orderBy: [{ updatedAt: "desc" }, { employeeNo: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.database.adminUser.count({ where }),
      this.database.adminRole.findMany({
        where: { active: true },
        orderBy: [{ system: "desc" }, { name: "asc" }],
      }),
    ]);
    return { items, total, roles };
  }

  findById(id: string): Promise<AdminAccountDatabaseRecord | null> {
    const now = new Date();
    return this.database.adminUser.findUnique({
      where: { id },
      include: accountInclude(now),
    });
  }

  findConflictingIdentity(
    employeeNo: string,
    phone: string,
    excludeId?: string,
  ): Promise<{ id: string; employeeNo: string; phone: string } | null> {
    return this.database.adminUser.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ employeeNo }, { phone }],
      },
      select: { id: true, employeeNo: true, phone: true },
    });
  }

  findActiveRoles(roleIds: string[]) {
    return this.database.adminRole.findMany({
      where: { id: { in: roleIds }, active: true },
      include: {
        permissions: {
          where: { permission: { active: true } },
          include: { permission: true },
        },
      },
    });
  }

  countOtherActiveOwners(excludeAdminUserId: string) {
    return this.database.adminUser.count({
      where: {
        id: { not: excludeAdminUserId },
        status: "ACTIVE",
        roles: { some: { role: { code: "owner", active: true } } },
      },
    });
  }

  async create(input: {
    employeeNo: string;
    displayName: string;
    phone: string;
    roleIds: string[];
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const account = await transaction.adminUser.create({
        data: {
          employeeNo: input.employeeNo,
          displayName: input.displayName,
          phone: input.phone,
          status: "INVITED",
          roles: {
            create: input.roleIds.map((roleId) => ({ roleId, assignedBy: input.actorId })),
          },
        },
        include: accountInclude(new Date()),
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-account.create",
          resourceType: "AdminUser",
          resourceId: account.id,
          reason: input.reason,
          requestId: input.requestId,
          after: this.snapshot(account),
        },
      });
      return account;
    });
  }

  async update(input: {
    id: string;
    displayName: string;
    phone: string;
    roleIds: string[];
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.adminUser.findUniqueOrThrow({
        where: { id: input.id },
        include: accountInclude(new Date()),
      });
      await transaction.adminUserRole.deleteMany({ where: { adminUserId: input.id } });
      const account = await transaction.adminUser.update({
        where: { id: input.id },
        data: {
          displayName: input.displayName,
          phone: input.phone,
          roles: {
            create: input.roleIds.map((roleId) => ({ roleId, assignedBy: input.actorId })),
          },
        },
        include: accountInclude(new Date()),
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-account.update",
          resourceType: "AdminUser",
          resourceId: account.id,
          reason: input.reason,
          requestId: input.requestId,
          before: this.snapshot(before),
          after: this.snapshot(account),
        },
      });
      return account;
    });
  }

  async changeStatus(input: {
    id: string;
    status: "ACTIVE" | "SUSPENDED" | "REVOKED";
    actorId: string;
    reason: string;
    requestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.adminUser.findUniqueOrThrow({
        where: { id: input.id },
        include: accountInclude(new Date()),
      });
      const account = await transaction.adminUser.update({
        where: { id: input.id },
        data: {
          status: input.status,
          suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
          suspendedReason: input.status === "SUSPENDED" ? input.reason : null,
        },
        include: accountInclude(new Date()),
      });
      if (input.status !== "ACTIVE") {
        await transaction.adminSession.deleteMany({ where: { adminUserId: input.id } });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: `admin-account.${input.status.toLowerCase()}`,
          resourceType: "AdminUser",
          resourceId: account.id,
          reason: input.reason,
          requestId: input.requestId,
          before: this.snapshot(before),
          after: this.snapshot(account),
        },
      });
      return account;
    });
  }

  async revokeSessions(input: { id: string; actorId: string; reason: string; requestId: string }) {
    return this.database.$transaction(async (transaction) => {
      const removed = await transaction.adminSession.deleteMany({
        where: { adminUserId: input.id },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorAdminUserId: input.actorId,
          action: "admin-session.revoke-all",
          resourceType: "AdminUser",
          resourceId: input.id,
          reason: input.reason,
          requestId: input.requestId,
          after: { revokedSessionCount: removed.count },
        },
      });
      return removed.count;
    });
  }

  private snapshot(account: {
    employeeNo: string;
    displayName: string;
    status: string;
    roles: Array<{ roleId: string }>;
  }) {
    return {
      employeeNo: account.employeeNo,
      displayName: account.displayName,
      status: account.status,
      roleIds: account.roles.map((assignment) => assignment.roleId).sort(),
    };
  }
}
