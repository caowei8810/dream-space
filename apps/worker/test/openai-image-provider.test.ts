import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationTaskSnapshot } from "../src/generation/generation-processor";
import { OpenAIImageProvider } from "../src/providers/openai-image-provider";

const task: GenerationTaskSnapshot = {
  id: "task-1",
  userId: "user-1",
  sessionId: "session-1",
  status: "generating",
  prompt: "a glass greenhouse after rain",
  model: "image-live",
  modelConfigSnapshot: {
    providerCode: "openai-compatible",
    providerBaseUrl: "https://images.example.com/v1",
    providerSecretRef: "env://PROVIDER_TEST_KEY",
    providerTimeoutMs: 30000,
    providerModelId: "image-model-1",
    config: { quality: "high" },
  },
  ratio: "1:1",
  resolution: "2K",
  imageCount: 1,
  totalCost: 1,
  attempts: 1,
};

const publicResolver = vi.fn().mockResolvedValue([{ address: "203.0.113.10" }]);

afterEach(() => {
  delete process.env.PROVIDER_TEST_KEY;
});

describe("OpenAIImageProvider", () => {
  it("requests base64 images from the selected immutable route snapshot", async () => {
    process.env.PROVIDER_TEST_KEY = "secret";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const provider = new OpenAIImageProvider(fetcher as never, publicResolver);
    const images = await provider.generate(task);
    expect(images[0]?.data.toString()).toBe("image");
    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "image-model-1",
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
      quality: "high",
    });
  });

  it("maps rate limiting to a retryable provider error", async () => {
    process.env.PROVIDER_TEST_KEY = "secret";
    const provider = new OpenAIImageProvider(
      vi.fn().mockResolvedValue(new Response("limited", { status: 429 })) as never,
      publicResolver,
    );
    await expect(provider.generate(task)).rejects.toMatchObject({
      code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
  });

  it("fails closed for private provider addresses and missing secrets", async () => {
    const privateTask = {
      ...task,
      modelConfigSnapshot: { ...task.modelConfigSnapshot, providerBaseUrl: "http://127.0.0.1/v1" },
    };
    await expect(
      new OpenAIImageProvider(vi.fn() as never, publicResolver).generate(privateTask),
    ).rejects.toMatchObject({
      code: "PROVIDER_ADDRESS_REJECTED",
      retryable: false,
    });
    await expect(
      new OpenAIImageProvider(vi.fn() as never, publicResolver).generate(task),
    ).rejects.toMatchObject({
      code: "PROVIDER_SECRET_INVALID",
      retryable: false,
    });
  });

  it("rejects URL-only and malformed responses", async () => {
    process.env.PROVIDER_TEST_KEY = "secret";
    const provider = new OpenAIImageProvider(
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/result.png" }] }), {
          status: 200,
        }),
      ) as never,
      publicResolver,
    );
    await expect(provider.generate(task)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });
});
