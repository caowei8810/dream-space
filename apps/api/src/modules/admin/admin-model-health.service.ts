import { BadRequestException, Injectable } from "@nestjs/common";
import type { AdminProviderModelOption } from "@dream-space/contracts";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ProviderProbeInput {
  code: string;
  baseUrl: string | null;
  secretRef: string | null;
  timeoutMs: number;
}

export interface ProviderProbeResult {
  health: "healthy" | "unhealthy";
  message: string;
  checkedAt: Date;
  latencyMs: number;
}

@Injectable()
export class AdminModelHealthService {
  async listModels(provider: ProviderProbeInput): Promise<AdminProviderModelOption[]> {
    if (!provider.baseUrl) throw new BadRequestException("请先配置供应商 API 地址");
    const secret = this.resolveSecret(provider.secretRef);
    const url = new URL(provider.baseUrl);
    await this.assertPublicAddress(url.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const response = await fetch(`${url.toString().replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok)
        throw new BadRequestException(
          response.status === 401 || response.status === 403
            ? "密钥无效或没有模型读取权限"
            : `供应商返回 HTTP ${response.status}`,
        );
      const payload: unknown = await response.json();
      const rows =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
          ? (payload as { data: unknown[] }).data
          : [];
      return rows
        .map((row) => {
          const item = row as { id?: unknown; name?: unknown; owned_by?: unknown };
          return {
            id: typeof item.id === "string" ? item.id : "",
            name:
              typeof item.name === "string"
                ? item.name
                : typeof item.id === "string"
                  ? item.id
                  : "",
            ownedBy: typeof item.owned_by === "string" ? item.owned_by : null,
          };
        })
        .filter((item) => item.id)
        .slice(0, 500);
    } finally {
      clearTimeout(timeout);
    }
  }
  async probe(provider: ProviderProbeInput): Promise<ProviderProbeResult> {
    const startedAt = Date.now();
    if (provider.code === "mock") {
      return {
        health: "healthy",
        message: "本地模拟服务可用",
        checkedAt: new Date(),
        latencyMs: 0,
      };
    }
    if (!provider.baseUrl) throw new BadRequestException("请先配置供应商 API 地址");
    const secret = this.resolveSecret(provider.secretRef);
    const url = new URL(provider.baseUrl);
    await this.assertPublicAddress(url.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const endpoint = new URL(`${url.toString().replace(/\/$/, "")}/models`);
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        return { health: "healthy", message: "连接成功", checkedAt: new Date(), latencyMs };
      }
      const message =
        response.status === 401 || response.status === 403
          ? "凭据无效或权限不足"
          : `供应商返回 HTTP ${response.status}`;
      return { health: "unhealthy", message, checkedAt: new Date(), latencyMs };
    } catch (error) {
      return {
        health: "unhealthy",
        message:
          error instanceof Error && error.name === "AbortError" ? "连接超时" : "无法连接供应商",
        checkedAt: new Date(),
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveSecret(secretRef: string | null) {
    if (!secretRef?.startsWith("env://"))
      throw new BadRequestException("健康检查目前仅支持 env:// Secret 引用");
    const name = secretRef.slice("env://".length);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new BadRequestException("Secret 引用不正确");
    const secret = process.env[name];
    if (!secret) throw new BadRequestException(`环境变量 ${name} 未配置`);
    return secret;
  }

  private async assertPublicAddress(hostname: string) {
    if (hostname === "localhost" || (isIP(hostname) && this.isPrivateAddress(hostname)))
      throw new BadRequestException("供应商地址不能指向本机或内网");
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException("供应商域名无法解析");
    }
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address)))
      throw new BadRequestException("供应商地址不能指向本机或内网");
  }

  private isPrivateAddress(address: string) {
    const value = address.toLowerCase();
    if (value.includes(":")) {
      return (
        value === "::1" ||
        value === "::" ||
        value.startsWith("fc") ||
        value.startsWith("fd") ||
        value.startsWith("fe8") ||
        value.startsWith("fe9") ||
        value.startsWith("fea") ||
        value.startsWith("feb")
      );
    }
    const parts = value.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
}
