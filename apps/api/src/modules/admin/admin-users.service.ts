import {
  type AdminUserListResponse,
  type AdminUserRecord,
  type UserStatus,
  type AdminUserStatusInput,
  type AdminUser,
  userStatuses,
} from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AdminUsersRepository } from "./admin-users.repository";

interface RawAdminUserQuery {
  query?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

const statuses = new Set<string>(userStatuses);

@Injectable()
export class AdminUsersService {
  constructor(@Inject(AdminUsersRepository) private readonly repository: AdminUsersRepository) {}

  async list(raw: RawAdminUserQuery): Promise<AdminUserListResponse> {
    const status = raw.status?.trim().toLowerCase() || undefined;
    if (status && !statuses.has(status)) throw new BadRequestException("用户状态不正确");
    const query = raw.query?.replace(/\s+/g, "").trim() || undefined;
    if (query && query.length > 32) throw new BadRequestException("搜索关键词过长");
    const page = this.integer(raw.page, 1, 1, 1_000_000, "页码");
    const pageSize = this.integer(raw.pageSize, 20, 1, 100, "每页数量");
    const result = await this.repository.list({
      query,
      status: status as UserStatus | undefined,
      page,
      pageSize,
    });
    return {
      items: result.items.map((item) => this.map(item)),
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
    };
  }

  async get(id: string) {
    const user = await this.find(id);
    return this.map(user);
  }

  async changeStatus(
    id: string,
    status: "ACTIVE" | "RESTRICTED" | "BANNED",
    input: AdminUserStatusInput,
    actor: AdminUser,
    requestId?: string,
  ) {
    const user = await this.find(id);
    return this.map(
      await this.repository.changeStatus({
        id: user.id,
        status,
        reason: this.reason(input?.reason),
        actorId: actor.id,
        requestId: this.requestId(requestId),
      }),
    );
  }

  async revokeSessions(
    id: string,
    input: AdminUserStatusInput,
    actor: AdminUser,
    requestId?: string,
  ) {
    const user = await this.find(id);
    const revokedSessionCount = await this.repository.revokeSessions({
      id: user.id,
      reason: this.reason(input?.reason),
      actorId: actor.id,
      requestId: this.requestId(requestId),
    });
    return { revokedSessionCount };
  }

  private async find(id: string) {
    const normalized = id?.trim();
    if (!normalized) throw new BadRequestException("用户 ID 不正确");
    const user = await this.repository.findById(normalized);
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }

  private reason(value: unknown) {
    if (typeof value !== "string") throw new BadRequestException("请填写操作原因");
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 2 || normalized.length > 500) {
      throw new BadRequestException("操作原因长度应为 2-500 个字符");
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

  private map(user: {
    id: string;
    phone: string;
    status: string;
    statusReason: string | null;
    statusChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { sessions: number; generationTasks: number; referenceUploads: number };
  }): AdminUserRecord {
    return {
      id: user.id,
      phoneMasked: `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}`,
      status: user.status.toLowerCase() as UserStatus,
      statusReason: user.statusReason,
      statusChangedAt: user.statusChangedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      activeSessionCount: user._count.sessions,
      generationTaskCount: user._count.generationTasks,
      referenceUploadCount: user._count.referenceUploads,
    };
  }
}
