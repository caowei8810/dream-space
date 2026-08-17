import {
  type AdminLoginRequest,
  type AdminPermission,
  type AdminSessionResponse,
  type AdminUser,
  adminPermissions,
  type SendCodeRequest,
  type SendCodeResponse,
} from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AdminAuthRepository, type AdminRecord } from "./admin-auth.repository";
import { readAdminSessionToken } from "./admin-session-cookie";

const demoCode = "123456" as const;
const phonePattern = /^1[3-9]\d{9}$/;

const knownPermissions = new Set<string>(adminPermissions);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

@Injectable()
export class AdminAuthService {
  private readonly env = parseApiEnv(process.env);

  constructor(@Inject(AdminAuthRepository) private readonly repository: AdminAuthRepository) {}

  async sendCode(input: SendCodeRequest): Promise<SendCodeResponse> {
    if (this.env.EXTERNAL_SERVICES_MODE !== "mock") {
      throw new ServiceUnavailableException("管理员验证码服务尚未配置");
    }
    const phone = this.normalizePhone(input?.phone);
    const admin = await this.repository.findActiveAdminByPhone(phone);
    if (!admin) throw new UnauthorizedException("管理员账号不存在或已停用");

    const reusable = await this.repository.findReusableChallenge(phone);
    if (reusable) {
      const elapsedSeconds = Math.floor((Date.now() - reusable.createdAt.getTime()) / 1000);
      return {
        challengeId: reusable.id,
        expiresAt: reusable.expiresAt.toISOString(),
        retryAfterSeconds: Math.max(0, 60 - elapsedSeconds),
        demoCode,
      };
    }

    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + this.env.AUTH_CODE_TTL_SECONDS * 1000);
    await this.repository.createChallenge({
      id: challengeId,
      phone,
      codeHash: hash(`${challengeId}:${demoCode}`),
      expiresAt,
    });
    return {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: 60,
      demoCode,
    };
  }

  async login(input: AdminLoginRequest) {
    const phone = this.normalizePhone(input?.phone);
    if (!input?.challengeId || !/^\d{6}$/.test(input.code)) {
      throw new BadRequestException("请输入有效的验证码");
    }
    const challenge = await this.repository.findChallenge(input.challengeId);
    if (
      !challenge ||
      challenge.phone !== phone ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attempts >= 5
    ) {
      throw new UnauthorizedException("验证码错误或已过期");
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const received = Buffer.from(hash(`${challenge.id}:${input.code}`), "hex");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await this.repository.recordFailedAttempt(challenge.id);
      throw new UnauthorizedException("验证码错误或已过期");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.env.AUTH_SESSION_DAYS * 86_400_000);
    const admin = await this.repository.completeLogin({
      challengeId: challenge.id,
      phone,
      tokenHash: hash(token),
      sessionExpiresAt: expiresAt,
    });
    if (!admin) throw new UnauthorizedException("管理员账号不存在或已停用");
    return {
      response: { authenticated: true, user: this.mapUser(admin) } as const,
      token,
      expiresAt,
    };
  }

  async getSession(token: string | null): Promise<AdminSessionResponse> {
    if (!token) return { authenticated: false };
    const admin = await this.repository.findSession(hash(token));
    return admin ? { authenticated: true, user: this.mapUser(admin) } : { authenticated: false };
  }

  async logout(token: string | null) {
    if (token) await this.repository.deleteSession(hash(token));
  }

  async requirePermission(cookieHeader: string | undefined, permission: AdminPermission) {
    const session = await this.getSession(readAdminSessionToken(cookieHeader));
    if (!session.authenticated) throw new UnauthorizedException("请先登录管理端");
    if (!session.user.permissions.includes(permission)) {
      throw new ForbiddenException("当前管理员没有该操作权限");
    }
    return session.user;
  }

  private normalizePhone(value: string) {
    const phone = value?.replace(/\s+/g, "") ?? "";
    if (!phonePattern.test(phone)) throw new BadRequestException("请输入正确的 11 位手机号");
    return phone;
  }

  private mapUser(admin: AdminRecord): AdminUser {
    const roles = admin.roles.map(({ role }) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      system: role.system,
    }));
    const permissions = [
      ...new Set(
        admin.roles.flatMap(({ role }) =>
          role.permissions
            .map(({ permission }) => permission.code)
            .filter((code): code is AdminPermission => knownPermissions.has(code)),
        ),
      ),
    ];
    return {
      id: admin.id,
      employeeNo: admin.employeeNo,
      displayName: admin.displayName,
      phoneMasked: maskPhone(admin.phone),
      roles,
      permissions,
    };
  }
}
