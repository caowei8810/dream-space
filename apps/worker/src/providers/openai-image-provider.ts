import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  GenerationProvider,
  GenerationTaskSnapshot,
  ProviderImage,
} from "../generation/generation-processor";
import { GenerationProviderError } from "../generation/generation-processor";

interface LiveModelSnapshot {
  providerCode: string;
  providerBaseUrl: string;
  providerSecretRef: string;
  providerTimeoutMs: number;
  providerModelId: string;
  config?: Record<string, unknown>;
}

type Fetcher = typeof fetch;
type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

const maxImageBytes = 25 * 1024 * 1024;

export class OpenAIImageProvider implements GenerationProvider {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly resolver: Resolver = (hostname) =>
      lookup(hostname, { all: true, verbatim: true }),
  ) {}

  async generate(task: GenerationTaskSnapshot): Promise<ProviderImage[]> {
    if (task.referenceImageUrls?.length) {
      throw new GenerationProviderError(
        "OpenAI-compatible image edits are not configured",
        "PROVIDER_REFERENCE_IMAGES_UNSUPPORTED",
        false,
      );
    }
    const snapshot = this.readSnapshot(task.modelConfigSnapshot);
    const baseUrl = new URL(snapshot.providerBaseUrl);
    await this.assertPublicAddress(baseUrl.hostname);
    const secret = this.resolveSecret(snapshot.providerSecretRef);
    const endpoint = new URL(`${baseUrl.toString().replace(/\/$/, "")}/images/generations`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), snapshot.providerTimeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.requestBody(task, snapshot)),
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw this.httpError(response.status);
      const payload: unknown = await response.json();
      return this.readImages(payload, task.imageCount, snapshot.config);
    } catch (error) {
      if (error instanceof GenerationProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GenerationProviderError(
          "image provider request timed out",
          "PROVIDER_TIMEOUT",
          true,
          { cause: error },
        );
      }
      throw new GenerationProviderError(
        "image provider request failed",
        "PROVIDER_UNAVAILABLE",
        true,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private requestBody(task: GenerationTaskSnapshot, snapshot: LiveModelSnapshot) {
    const config = snapshot.config ?? {};
    const body: Record<string, unknown> = {
      model: snapshot.providerModelId,
      prompt: task.prompt,
      n: task.imageCount,
      size: this.resolveSize(task, config),
      response_format: "b64_json",
    };
    for (const key of ["quality", "style", "background", "output_format", "output_compression"])
      if (config[key] !== undefined) body[key] = config[key];
    return body;
  }

  private resolveSize(task: GenerationTaskSnapshot, config: Record<string, unknown>) {
    const configured = config.sizeMap;
    if (configured && typeof configured === "object" && !Array.isArray(configured)) {
      const sizeMap = configured as Record<string, unknown>;
      const value = sizeMap[`${task.ratio}:${task.resolution}`] ?? sizeMap[task.ratio];
      if (typeof value === "string" && /^\d{3,4}x\d{3,4}$|^auto$/.test(value)) return value;
    }
    if (task.ratio === "16:9") return "1536x1024";
    if (task.ratio === "9:16") return "1024x1536";
    return "1024x1024";
  }

  private readImages(payload: unknown, expected: number, config?: Record<string, unknown>) {
    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray((payload as { data?: unknown }).data)
    )
      throw new GenerationProviderError(
        "invalid image provider response",
        "PROVIDER_INVALID_RESPONSE",
        true,
      );
    const data = (payload as { data: unknown[] }).data;
    if (data.length !== expected)
      throw new GenerationProviderError(
        `image provider returned ${data.length} images; expected ${expected}`,
        "PROVIDER_INVALID_RESPONSE",
        true,
      );
    const mimeType = config?.output_format === "webp" ? "image/webp" : "image/png";
    return data.map((item, index) => {
      const encoded =
        item && typeof item === "object" ? (item as { b64_json?: unknown }).b64_json : undefined;
      if (typeof encoded !== "string" || !this.isBase64(encoded))
        throw new GenerationProviderError(
          "image provider did not return base64 image data",
          "PROVIDER_INVALID_RESPONSE",
          true,
        );
      const buffer = Buffer.from(encoded, "base64");
      if (!buffer.length || buffer.length > maxImageBytes)
        throw new GenerationProviderError(
          "image provider returned an invalid image size",
          "PROVIDER_INVALID_RESPONSE",
          false,
        );
      return { index, data: buffer, mimeType };
    });
  }

  private readSnapshot(value: Record<string, unknown> | null | undefined): LiveModelSnapshot {
    if (!value)
      throw new GenerationProviderError(
        "model route snapshot is missing",
        "MODEL_ROUTE_INVALID",
        false,
      );
    const snapshot = value as Partial<LiveModelSnapshot>;
    if (
      typeof snapshot.providerCode !== "string" ||
      typeof snapshot.providerBaseUrl !== "string" ||
      typeof snapshot.providerSecretRef !== "string" ||
      typeof snapshot.providerModelId !== "string" ||
      !Number.isInteger(snapshot.providerTimeoutMs) ||
      snapshot.providerTimeoutMs! < 1000 ||
      snapshot.providerTimeoutMs! > 120000
    )
      throw new GenerationProviderError(
        "model route snapshot is invalid",
        "MODEL_ROUTE_INVALID",
        false,
      );
    return snapshot as LiveModelSnapshot;
  }

  private resolveSecret(secretRef: string) {
    if (!secretRef.startsWith("env://"))
      throw new GenerationProviderError(
        "unsupported secret reference",
        "PROVIDER_SECRET_INVALID",
        false,
      );
    const name = secretRef.slice("env://".length);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || !process.env[name])
      throw new GenerationProviderError(
        "provider secret is not configured",
        "PROVIDER_SECRET_INVALID",
        false,
      );
    return process.env[name]!;
  }

  private httpError(status: number) {
    if (status === 401 || status === 403)
      return new GenerationProviderError(
        "provider authentication failed",
        "PROVIDER_AUTH_FAILED",
        false,
      );
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
    return new GenerationProviderError(
      `image provider returned HTTP ${status}`,
      retryable ? "PROVIDER_TEMPORARILY_UNAVAILABLE" : "PROVIDER_REQUEST_REJECTED",
      retryable,
    );
  }

  private isBase64(value: string) {
    return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
  }

  private async assertPublicAddress(hostname: string) {
    if (hostname === "localhost" || (isIP(hostname) && this.isPrivateAddress(hostname)))
      throw new GenerationProviderError(
        "provider address is private",
        "PROVIDER_ADDRESS_REJECTED",
        false,
      );
    const addresses = await this.resolver(hostname).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address)))
      throw new GenerationProviderError(
        "provider address is not public",
        "PROVIDER_ADDRESS_REJECTED",
        false,
      );
  }

  private isPrivateAddress(address: string) {
    const value = address.toLowerCase();
    if (value.includes(":"))
      return (
        value === "::1" ||
        value === "::" ||
        value.startsWith("fc") ||
        value.startsWith("fd") ||
        /^fe[89ab]/.test(value)
      );
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
