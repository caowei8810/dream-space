import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { GenerationTaskSnapshot, ProviderImage } from "../generation/generation-processor";
import { GenerationProviderError } from "../generation/generation-processor";
import type { ContentModerator, ModerationDecision } from "../moderation/content-moderator";

export interface OpenAIContentModeratorOptions {
  baseUrl: string;
  secretRef: string;
  model: string;
  timeoutMs: number;
}

type Fetcher = typeof fetch;
type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

export class OpenAIContentModerator implements ContentModerator {
  constructor(
    private readonly options: OpenAIContentModeratorOptions,
    private readonly fetcher: Fetcher = fetch,
    private readonly resolver: Resolver = (hostname) =>
      lookup(hostname, { all: true, verbatim: true }),
  ) {}

  moderateInput(task: GenerationTaskSnapshot) {
    return this.moderate(task.prompt);
  }

  moderateOutput(_task: GenerationTaskSnapshot, image: ProviderImage) {
    return this.moderate([
      {
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}` },
      },
    ]);
  }

  private async moderate(input: unknown): Promise<ModerationDecision> {
    const baseUrl = new URL(this.options.baseUrl);
    await this.assertPublicAddress(baseUrl.hostname);
    const secret = this.resolveSecret(this.options.secretRef);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetcher(
        new URL(`${baseUrl.toString().replace(/\/$/, "")}/moderations`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: this.options.model, input }),
          signal: controller.signal,
          redirect: "error",
        },
      );
      if (!response.ok) throw this.httpError(response.status);
      return this.readDecision(await response.json());
    } catch (error) {
      if (error instanceof GenerationProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new GenerationProviderError(
          "moderation request timed out",
          "MODERATION_TIMEOUT",
          true,
          {
            cause: error,
          },
        );
      throw new GenerationProviderError(
        "moderation provider request failed",
        "MODERATION_UNAVAILABLE",
        true,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private readDecision(payload: unknown): ModerationDecision {
    const result =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { results?: unknown }).results)
        ? (payload as { results: unknown[] }).results[0]
        : null;
    if (
      !result ||
      typeof result !== "object" ||
      typeof (result as { flagged?: unknown }).flagged !== "boolean"
    )
      throw new GenerationProviderError(
        "invalid moderation provider response",
        "MODERATION_INVALID_RESPONSE",
        true,
      );
    if (!(result as { flagged: boolean }).flagged) return { status: "approved", codes: [] };
    const categories = (result as { categories?: unknown }).categories;
    const codes =
      categories && typeof categories === "object" && !Array.isArray(categories)
        ? Object.entries(categories)
            .filter(([, matched]) => matched === true)
            .map(([category]) => `PROVIDER_${category.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`)
        : [];
    return { status: "rejected", codes: codes.length ? codes : ["PROVIDER_FLAGGED"] };
  }

  private resolveSecret(secretRef: string) {
    if (!secretRef.startsWith("env://"))
      throw new GenerationProviderError(
        "unsupported moderation secret",
        "MODERATION_SECRET_INVALID",
        false,
      );
    const name = secretRef.slice("env://".length);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || !process.env[name])
      throw new GenerationProviderError(
        "moderation secret is not configured",
        "MODERATION_SECRET_INVALID",
        false,
      );
    return process.env[name]!;
  }

  private httpError(status: number) {
    if (status === 401 || status === 403)
      return new GenerationProviderError(
        "moderation authentication failed",
        "MODERATION_AUTH_FAILED",
        false,
      );
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
    return new GenerationProviderError(
      `moderation provider returned HTTP ${status}`,
      retryable ? "MODERATION_TEMPORARILY_UNAVAILABLE" : "MODERATION_REQUEST_REJECTED",
      retryable,
    );
  }

  private async assertPublicAddress(hostname: string) {
    if (hostname === "localhost" || (isIP(hostname) && this.isPrivateAddress(hostname)))
      throw new GenerationProviderError(
        "moderation address is private",
        "MODERATION_ADDRESS_REJECTED",
        false,
      );
    const addresses = await this.resolver(hostname).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address)))
      throw new GenerationProviderError(
        "moderation address is not public",
        "MODERATION_ADDRESS_REJECTED",
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
