import type { DatabaseAdminRole, DatabaseClient } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface AdminRecord {
  id: string;
  phone: string;
  displayName: string;
  role: DatabaseAdminRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminChallengeRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

@Injectable()
export class AdminAuthRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  findActiveAdminByPhone(phone: string): Promise<AdminRecord | null> {
    return this.database.adminUser.findFirst({ where: { phone, active: true } });
  }

  async createChallenge(input: {
    id: string;
    phone: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.adminVerificationCode.create({ data: input });
  }

  findChallenge(id: string): Promise<AdminChallengeRecord | null> {
    return this.database.adminVerificationCode.findUnique({ where: { id } });
  }

  findReusableChallenge(phone: string): Promise<AdminChallengeRecord | null> {
    return this.database.adminVerificationCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      orderBy: { createdAt: "desc" },
    });
  }

  async recordFailedAttempt(id: string) {
    await this.database.adminVerificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async completeLogin(input: {
    challengeId: string;
    phone: string;
    tokenHash: string;
    sessionExpiresAt: Date;
  }): Promise<AdminRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const consumed = await transaction.adminVerificationCode.updateMany({
        where: {
          id: input.challengeId,
          phone: input.phone,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return null;

      const admin = await transaction.adminUser.findFirst({
        where: { phone: input.phone, active: true },
      });
      if (!admin) return null;
      await transaction.adminSession.create({
        data: {
          adminUserId: admin.id,
          tokenHash: input.tokenHash,
          expiresAt: input.sessionExpiresAt,
        },
      });
      return admin;
    });
  }

  async findSession(tokenHash: string): Promise<AdminRecord | null> {
    const session = await this.database.adminSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() }, adminUser: { active: true } },
      include: { adminUser: true },
    });
    if (!session) return null;
    await this.database.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return session.adminUser;
  }

  async deleteSession(tokenHash: string) {
    await this.database.adminSession.deleteMany({ where: { tokenHash } });
  }
}
