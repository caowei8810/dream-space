import {
  adminPermissions,
  type AdminPermissionRecord,
  type AdminRoleActionInput,
  type AdminRoleCreateInput,
  type AdminRoleListResponse,
  type AdminRoleRecord,
  type AdminRoleUpdateInput,
  type AdminUser,
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
import { AdminRolesRepository, type AdminRoleDatabaseRecord } from "./admin-roles.repository";

const roleCodePattern = /^[a-z][a-z0-9-]{2,31}$/;
const knownPermissions = new Set<string>(adminPermissions);

@Injectable()
export class AdminRolesService {
  constructor(@Inject(AdminRolesRepository) private readonly repository: AdminRolesRepository) {}

  async list(): Promise<AdminRoleListResponse> {
    const result = await this.repository.list();
    return {
      items: result.roles.map((role) => this.mapRole(role)),
      permissions: result.permissions
        .filter((permission) => knownPermissions.has(permission.code))
        .map((permission) => this.mapPermission(permission)),
    };
  }

  async get(id: string) {
    return this.mapRole(await this.find(id));
  }

  async create(raw: AdminRoleCreateInput, actor: AdminUser, requestId?: string) {
    const code = typeof raw?.code === "string" ? raw.code.trim().toLowerCase() : "";
    if (!roleCodePattern.test(code)) {
      throw new BadRequestException("角色编码应为 3-32 位小写字母、数字或中划线");
    }
    if (await this.repository.findByCode(code)) throw new ConflictException("角色编码已存在");
    const permissionIds = await this.permissionIds(raw?.permissionIds);
    return this.mapRole(
      await this.repository.create({
        code,
        name: this.text(raw?.name, "角色名称", 2, 64),
        description: this.text(raw?.description, "角色说明", 2, 200),
        permissionIds,
        actorId: actor.id,
        reason: this.reason(raw?.reason),
        requestId: this.requestId(requestId),
      }),
    );
  }

  async update(id: string, raw: AdminRoleUpdateInput, actor: AdminUser, requestId?: string) {
    const role = await this.find(id);
    this.protectRole(role, actor, false);
    if (!raw?.active && role._count.users > 0) {
      throw new ConflictException("请先移除该角色关联的管理员账号");
    }
    return this.mapRole(
      await this.repository.update({
        id: role.id,
        name: this.text(raw?.name, "角色名称", 2, 64),
        description: this.text(raw?.description, "角色说明", 2, 200),
        active: Boolean(raw?.active),
        permissionIds: await this.permissionIds(raw?.permissionIds),
        actorId: actor.id,
        reason: this.reason(raw?.reason),
        requestId: this.requestId(requestId),
      }),
    );
  }

  async remove(id: string, raw: AdminRoleActionInput, actor: AdminUser, requestId?: string) {
    const role = await this.find(id);
    this.protectRole(role, actor, true);
    if (role._count.users > 0) throw new ConflictException("请先移除该角色关联的管理员账号");
    await this.repository.remove({
      id: role.id,
      actorId: actor.id,
      reason: this.reason(raw?.reason),
      requestId: this.requestId(requestId),
    });
  }

  private protectRole(role: AdminRoleDatabaseRecord, actor: AdminUser, deleting: boolean) {
    if (role.code === "owner") throw new ForbiddenException("系统负责人角色不可修改");
    if (deleting && role.system) throw new ForbiddenException("内置角色不可删除");
    if (actor.roles.some((assigned) => assigned.id === role.id)) {
      throw new ForbiddenException("不能修改自己当前所属的角色");
    }
  }

  private async permissionIds(value: unknown) {
    if (!Array.isArray(value) || value.length === 0 || value.length > adminPermissions.length) {
      throw new BadRequestException("至少选择一个有效权限点");
    }
    const ids = [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")))]
      .filter(Boolean)
      .sort();
    const permissions = await this.repository.findActivePermissions(ids);
    if (
      permissions.length !== ids.length ||
      permissions.some((permission) => !knownPermissions.has(permission.code))
    ) {
      throw new BadRequestException("所选权限点不存在或已停用");
    }
    return ids;
  }

  private async find(id: string) {
    const normalized = id?.trim();
    if (!normalized) throw new BadRequestException("角色 ID 不正确");
    const role = await this.repository.findById(normalized);
    if (!role) throw new NotFoundException("角色不存在");
    return role;
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

  private requestId(value?: string) {
    const normalized = value?.trim();
    return normalized && normalized.length <= 128 ? normalized : randomUUID();
  }

  private mapRole(role: AdminRoleDatabaseRecord): AdminRoleRecord {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      system: role.system,
      active: role.active,
      userCount: role._count.users,
      permissions: role.permissions
        .filter(({ permission }) => knownPermissions.has(permission.code))
        .map(({ permission }) => this.mapPermission(permission)),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private mapPermission(permission: {
    id: string;
    code: string;
    name: string;
    description: string;
    risk: string;
    active: boolean;
  }): AdminPermissionRecord {
    return {
      id: permission.id,
      code: permission.code as AdminPermissionRecord["code"],
      name: permission.name,
      description: permission.description,
      risk: permission.risk.toLowerCase() as AdminPermissionRecord["risk"],
      active: permission.active,
    };
  }
}
