import type { DatabaseClient } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

interface CompleteLoginInput {
  challengeId: string;
  phone: string;
  agreementVersion: string;
  tokenHash: string;
  sessionExpiresAt: Date;
}

interface ChallengeRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

interface UserRecord {
  id: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async createChallenge(input: { id: string; phone: string; codeHash: string; expiresAt: Date }) {
    await this.database.verificationCode.create({ data: input });
  }

  findChallenge(id: string): Promise<ChallengeRecord | null> {
    return this.database.verificationCode.findUnique({ where: { id } });
  }

  findReusableChallenge(phone: string): Promise<ChallengeRecord | null> {
    return this.database.verificationCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      orderBy: { createdAt: "desc" },
    });
  }

  async recordFailedAttempt(id: string) {
    await this.database.verificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async completeLogin(input: CompleteLoginInput): Promise<UserRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const consumed = await transaction.verificationCode.updateMany({
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

      const user = await transaction.user.upsert({
        where: { phone: input.phone },
        create: { phone: input.phone },
        update: {},
      });
      await transaction.agreementAcceptance.upsert({
        where: {
          userId_version: { userId: user.id, version: input.agreementVersion },
        },
        create: {
          userId: user.id,
          version: input.agreementVersion,
          termsAccepted: true,
          privacyAccepted: true,
          aiTermsAccepted: true,
        },
        update: {
          termsAccepted: true,
          privacyAccepted: true,
          aiTermsAccepted: true,
          acceptedAt: new Date(),
        },
      });
      await transaction.userSession.create({
        data: {
          userId: user.id,
          tokenHash: input.tokenHash,
          expiresAt: input.sessionExpiresAt,
        },
      });
      return user;
    });
  }

  async findSession(tokenHash: string): Promise<UserRecord | null> {
    const session = await this.database.userSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session) return null;

    await this.database.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return session.user;
  }

  async deleteSession(tokenHash: string) {
    await this.database.userSession.deleteMany({ where: { tokenHash } });
  }
}
