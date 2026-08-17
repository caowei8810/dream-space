import { authAgreementVersion, type LoginRequest } from "@dream-space/contracts";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../src/modules/auth/auth.repository";
import { AuthService } from "../src/modules/auth/auth.service";

const validLogin: LoginRequest = {
  phone: "13800138000",
  challengeId: "challenge-1",
  code: "123456",
  version: authAgreementVersion,
  termsAccepted: true,
  privacyAccepted: true,
  aiTermsAccepted: true,
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createService() {
  const repository = {
    findUserByPhone: vi.fn().mockResolvedValue(null),
    createChallenge: vi.fn().mockResolvedValue(undefined),
    findReusableChallenge: vi.fn().mockResolvedValue(null),
    findChallenge: vi.fn().mockResolvedValue({
      id: validLogin.challengeId,
      phone: validLogin.phone,
      codeHash: hash(`${validLogin.challengeId}:${validLogin.code}`),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      attempts: 0,
      createdAt: new Date(),
    }),
    recordFailedAttempt: vi.fn().mockResolvedValue(undefined),
    completeLogin: vi.fn().mockResolvedValue({
      id: "user-1",
      phone: validLogin.phone,
      status: "ACTIVE",
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
    }),
    findSession: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepository;

  return { repository, service: new AuthService(repository) };
}

describe("AuthService", () => {
  it("creates a short-lived demo verification challenge", async () => {
    const { repository, service } = createService();

    const result = await service.sendCode({ phone: "138 0013 8000" });

    expect(result.demoCode).toBe("123456");
    expect(result.retryAfterSeconds).toBe(60);
    expect(repository.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "13800138000", codeHash: expect.any(String) }),
    );
  });

  it("reuses an active challenge during the resend cooldown", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.findReusableChallenge).mockResolvedValue({
      id: "existing-challenge",
      phone: validLogin.phone,
      codeHash: hash("existing-challenge:123456"),
      expiresAt: new Date(Date.now() + 120_000),
      consumedAt: null,
      attempts: 0,
      createdAt: new Date(Date.now() - 10_000),
    });

    const result = await service.sendCode({ phone: validLogin.phone });

    expect(result.challengeId).toBe("existing-challenge");
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(49);
    expect(repository.createChallenge).not.toHaveBeenCalled();
  });

  it("fails closed instead of using the demo code in live mode", async () => {
    const previous = process.env.EXTERNAL_SERVICES_MODE;
    process.env.EXTERNAL_SERVICES_MODE = "live";
    try {
      const { service } = createService();
      await expect(service.sendCode({ phone: validLogin.phone })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      if (previous === undefined) delete process.env.EXTERNAL_SERVICES_MODE;
      else process.env.EXTERNAL_SERVICES_MODE = previous;
    }
  });

  it("rejects invalid phone numbers and incomplete agreements", async () => {
    const { service } = createService();

    await expect(service.sendCode({ phone: "123" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.login({ ...validLogin, privacyAccepted: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("blocks banned users and prevents restricted users from generating", async () => {
    const { repository, service } = createService();
    vi.mocked(repository.findUserByPhone).mockResolvedValue({ status: "BANNED" });
    await expect(service.sendCode({ phone: validLogin.phone })).rejects.toMatchObject({
      status: 403,
    });

    vi.mocked(repository.findUserByPhone).mockResolvedValue(null);
    vi.mocked(repository.findSession).mockResolvedValue({
      id: "user-1",
      phone: validLogin.phone,
      status: "RESTRICTED",
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
    });
    await expect(service.requireActiveUser("session-token")).rejects.toMatchObject({ status: 403 });
  });

  it("counts a wrong code attempt without creating a session", async () => {
    const { repository, service } = createService();

    await expect(service.login({ ...validLogin, code: "654321" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.recordFailedAttempt).toHaveBeenCalledWith(validLogin.challengeId);
    expect(repository.completeLogin).not.toHaveBeenCalled();
  });

  it("creates an opaque session and returns only a masked phone", async () => {
    const { repository, service } = createService();

    const result = await service.login(validLogin);

    expect(result.response).toEqual({
      authenticated: true,
      user: {
        id: "user-1",
        phoneMasked: "138****8000",
        status: "active",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.completeLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: validLogin.challengeId,
        phone: validLogin.phone,
        agreementVersion: authAgreementVersion,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("returns anonymous state for an unknown session and invalidates logout tokens", async () => {
    const { repository, service } = createService();

    await expect(service.getSession("unknown-token")).resolves.toEqual({ authenticated: false });
    await service.logout("known-token");

    expect(repository.findSession).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(repository.deleteSession).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });
});
