import {
  authAgreementVersion,
  type AuthSessionResponse,
  type AuthUser,
  type LoginRequest,
  type SendCodeRequest,
  type SendCodeResponse,
} from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AuthRepository } from "./auth.repository";

const demoCode = "123456" as const;
const phonePattern = /^1[3-9]\d{9}$/;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

@Injectable()
export class AuthService {
  private readonly env = parseApiEnv(process.env);

  constructor(@Inject(AuthRepository) private readonly repository: AuthRepository) {}

  async sendCode(input: SendCodeRequest): Promise<SendCodeResponse> {
    if (this.env.EXTERNAL_SERVICES_MODE !== "mock") {
      throw new ServiceUnavailableException("短信验证码服务尚未配置");
    }
    const phone = this.normalizePhone(input.phone);
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

  async login(input: LoginRequest) {
    const phone = this.normalizePhone(input.phone);
    this.validateAgreements(input);
    if (!input.challengeId || !/^\d{6}$/.test(input.code)) {
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
    const user = await this.repository.completeLogin({
      challengeId: challenge.id,
      phone,
      agreementVersion: authAgreementVersion,
      tokenHash: hash(token),
      sessionExpiresAt: expiresAt,
    });
    if (!user) throw new UnauthorizedException("验证码错误或已过期");

    return {
      response: { authenticated: true, user: this.mapUser(user) } as const,
      token,
      expiresAt,
    };
  }

  async getSession(token: string | null): Promise<AuthSessionResponse> {
    if (!token) return { authenticated: false };
    const user = await this.repository.findSession(hash(token));
    return user ? { authenticated: true, user: this.mapUser(user) } : { authenticated: false };
  }

  async logout(token: string | null) {
    if (token) await this.repository.deleteSession(hash(token));
  }

  private normalizePhone(value: string) {
    const phone = value?.replace(/\s+/g, "") ?? "";
    if (!phonePattern.test(phone)) throw new BadRequestException("请输入正确的 11 位手机号");
    return phone;
  }

  private validateAgreements(input: LoginRequest) {
    if (
      input.version !== authAgreementVersion ||
      !input.termsAccepted ||
      !input.privacyAccepted ||
      !input.aiTermsAccepted
    ) {
      throw new BadRequestException("请先阅读并同意全部协议");
    }
  }

  private mapUser(user: { id: string; phone: string; createdAt: Date }): AuthUser {
    return {
      id: user.id,
      phoneMasked: maskPhone(user.phone),
      createdAt: user.createdAt.toISOString(),
    };
  }
}
