import {
  type AdminAccountActionInput,
  type AdminAccountCreateInput,
  type AdminAccountListResponse,
  type AdminAccountRecord,
  type AdminAccountStatus,
  type AdminAccountUpdateInput,
  type AdminUser,
  adminAccountStatuses,
} from "@dream-space/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AdminAccountsRepository } from "./admin-accounts.repository";

interface RawAdminAccountQuery {
  query?: string;
  status?: string;
  roleId?: string;
  page?: string;
  pageSize?: string;
}

const statuses = new Set<string>(adminAccountStatuses);
const phonePattern = /^1[3-9]\d{9}$/;
const employeeNoPattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

@Injectable()
export class AdminAccountsService {
  constructor(
    @Inject(AdminAccountsRepository) private readonly repository: AdminAccountsRepository,
  ) {}

  async list(raw: RawAdminAccountQuery): Promise<AdminAccountListResponse> {
    const status = raw.status?.trim().toLowerCase() || undefined;
    if (status && !statuses.has(status)) throw new BadRequestException("管理员状态不正确");
    const query = raw.query?.replace(/\s+/g, " ").trim() || undefined;
    if (query && query.length > 100) throw new BadRequestException("搜索关键词过长");
    const roleId = raw.roleId?.trim() || undefined;
    const page = this.integer(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.integer(raw.pageSize, 20, 1, 100, "每页数量");
    const result = await this.repository.list({
      query,
      status: status as AdminAccountStatus | undefined,
      roleId,
      page,
      pageSize,
    });
    return {
      items: result.items.map((item) => this.map(item)),
      roles: result.roles.map((role) => this.mapRole(role)),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async get(id: string) {
    return this.map(await this.find(id));
  }

  async create(raw: AdminAccountCreateInput, actor: AdminUser, requestId?: string) {
    const input = await this.validateCreate(raw);
    return this.map(
      await this.repository.create({
        ...input,
        actorId: actor.id,
        requestId: this.requestId(requestId),
      }),
    );
  }

  async update(id: string, raw: AdminAccountUpdateInput, actor: AdminUser, requestId?: string) {
    const account = await this.find(id);
    const input = await this.validateUpdate(raw, account.id, account.employeeNo, account.phone);
    const currentRoleIds = account.roles.map((assignment) => assignment.roleId).sort();
    const nextRoleIds = [...input.roleIds].sort();
    const rolesChanged = currentRoleIds.join(",") !== nextRoleIds.join(",");
    if (account.id === actor.id && rolesChanged) {
      throw new ForbiddenException("不能修改自己的角色");
    }
    await this.protectFinalOwner(account, nextRoleIds);
    return this.map(
      await this.repository.update({
        id: account.id,
        ...input,
        actorId: actor.id,
        requestId: this.requestId(requestId),
      }),
    );
  }

  async changeStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "REVOKED",
    raw: AdminAccountActionInput,
    actor: AdminUser,
    requestId?: string,
  ) {
    const account = await this.find(id);
    if (account.id === actor.id && status !== "ACTIVE") {
      throw new ForbiddenException("不能停用或撤销自己的账号");
    }
    const reason = this.reason(raw?.reason);
    if (status !== "ACTIVE") await this.protectFinalOwner(account, []);
    if (account.status === "REVOKED" && status !== "REVOKED") {
      throw new ConflictException("已撤销账号不能重新启用");
    }
    return this.map(
      await this.repository.changeStatus({
        id: account.id,
        status,
        actorId: actor.id,
        reason,
        requestId: this.requestId(requestId),
      }),
    );
  }

  async revokeSessions(
    id: string,
    raw: AdminAccountActionInput,
    actor: AdminUser,
    requestId?: string,
  ) {
    const account = await this.find(id);
    if (account.id === actor.id) throw new ForbiddenException("请使用退出登录结束自己的会话");
    const revokedSessionCount = await this.repository.revokeSessions({
      id: account.id,
      actorId: actor.id,
      reason: this.reason(raw?.reason),
      requestId: this.requestId(requestId),
    });
    return { revokedSessionCount };
  }

  private async validateCreate(raw: AdminAccountCreateInput) {
    const employeeNo = this.employeeNo(raw?.employeeNo);
    const phone = this.phone(raw?.phone);
    await this.ensureUnique(employeeNo, phone);
    return {
      employeeNo,
      phone,
      displayName: this.text(raw?.displayName, "姓名", 2, 64),
      roleIds: await this.roleIds(raw?.roleIds),
      reason: this.reason(raw?.reason),
    };
  }

  private async validateUpdate(
    raw: AdminAccountUpdateInput,
    id: string,
    employeeNo: string,
    currentPhone: string,
  ) {
    const phone = raw?.phone?.trim() ? this.phone(raw.phone) : currentPhone;
    await this.ensureUnique(employeeNo, phone, id);
    return {
      phone,
      displayName: this.text(raw?.displayName, "姓名", 2, 64),
      roleIds: await this.roleIds(raw?.roleIds),
      reason: this.reason(raw?.reason),
    };
  }

  private async roleIds(value: unknown) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
      throw new BadRequestException("至少选择一个有效角色");
    }
    const roleIds = [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")))]
      .filter(Boolean)
      .sort();
    const roles = await this.repository.findActiveRoles(roleIds);
    if (roles.length !== roleIds.length) throw new BadRequestException("所选角色不存在或已停用");
    return roleIds;
  }

  private async protectFinalOwner(
    account: Awaited<ReturnType<AdminAccountsRepository["findById"]>> & {},
    nextRoleIds: string[],
  ) {
    const ownsPlatform = account.roles.some((assignment) => assignment.role.code === "owner");
    if (!ownsPlatform || account.status !== "ACTIVE") return;
    const nextRoles = nextRoleIds.length ? await this.repository.findActiveRoles(nextRoleIds) : [];
    if (nextRoles.some((role) => role.code === "owner")) return;
    if ((await this.repository.countOtherActiveOwners(account.id)) === 0) {
      throw new ConflictException("必须保留至少一个启用的系统负责人");
    }
  }

  private async ensureUnique(employeeNo: string, phone: string, excludeId?: string) {
    const conflict = await this.repository.findConflictingIdentity(employeeNo, phone, excludeId);
    if (!conflict) return;
    if (conflict.employeeNo === employeeNo) throw new ConflictException("工号已存在");
    throw new ConflictException("手机号已绑定其他管理员");
  }

  private async find(id: string) {
    const normalized = id?.trim();
    if (!normalized) throw new BadRequestException("管理员 ID 不正确");
    const account = await this.repository.findById(normalized);
    if (!account) throw new NotFoundException("管理员账号不存在");
    return account;
  }

  private employeeNo(value: unknown) {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!employeeNoPattern.test(normalized)) {
      throw new BadRequestException("工号应为 3-32 位大写字母、数字、下划线或中划线");
    }
    return normalized;
  }

  private phone(value: unknown) {
    const normalized = typeof value === "string" ? value.replace(/\s+/g, "") : "";
    if (!phonePattern.test(normalized)) throw new BadRequestException("请输入正确的 11 位手机号");
    return normalized;
  }

  private reason(value: unknown) {
    return this.text(value, "操作原因", 2, 500);
  }

  private text(value: unknown, label: string, min: number, max: number) {
    const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    if (normalized.length < min || normalized.length > max) {
      throw new BadRequestException(`${label}长度应为 ${min}-${max} 个字符`);
    }
    return normalized;
  }

  private integer(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
    label: string,
  ) {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${label}不正确`);
    }
    return parsed;
  }

  private requestId(value?: string) {
    const normalized = value?.trim();
    return normalized && normalized.length <= 128 ? normalized : randomUUID();
  }

  private map(account: {
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
      role: { id: string; code: string; name: string; system: boolean };
    }>;
    _count: { sessions: number };
  }): AdminAccountRecord {
    return {
      id: account.id,
      employeeNo: account.employeeNo,
      displayName: account.displayName,
      phoneMasked: `${account.phone.slice(0, 3)}****${account.phone.slice(-4)}`,
      roles: account.roles.map(({ role }) => this.mapRole(role)),
      status: account.status.toLowerCase() as AdminAccountStatus,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      suspendedAt: account.suspendedAt?.toISOString() ?? null,
      suspendedReason: account.suspendedReason,
      sessionCount: account._count.sessions,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  private mapRole(role: { id: string; code: string; name: string; system: boolean }) {
    return { id: role.id, code: role.code, name: role.name, system: role.system };
  }
}
