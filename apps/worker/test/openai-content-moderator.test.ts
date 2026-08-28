import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationTaskSnapshot, ProviderImage } from "../src/generation/generation-processor";
import { OpenAIContentModerator } from "../src/providers/openai-content-moderator";

const options = {
  baseUrl: "https://moderation.example.com/v1",
  secretRef: "env://MODERATION_TEST_KEY",
  model: "omni-moderation-latest",
  timeoutMs: 30000,
};
const task = { prompt: "safe prompt" } as GenerationTaskSnapshot;
const resolver = vi.fn().mockResolvedValue([{ address: "203.0.113.11" }]);

afterEach(() => {
  delete process.env.MODERATION_TEST_KEY;
});

describe("OpenAIContentModerator", () => {
  it("approves safe text and sends the configured model", async () => {
    process.env.MODERATION_TEST_KEY = "secret";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ flagged: false, categories: {} }] }), {
        status: 200,
      }),
    );
    const moderator = new OpenAIContentModerator(options, fetcher as never, resolver);
    await expect(moderator.moderateInput(task)).resolves.toEqual({ status: "approved", codes: [] });
    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "omni-moderation-latest",
      input: "safe prompt",
    });
  });

  it("rejects flagged output images with normalized category codes", async () => {
    process.env.MODERATION_TEST_KEY = "secret";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ flagged: true, categories: { violence: true, sexual: false } }],
        }),
        { status: 200 },
      ),
    );
    const moderator = new OpenAIContentModerator(options, fetcher as never, resolver);
    const image: ProviderImage = { index: 0, data: Buffer.from("image"), mimeType: "image/png" };
    await expect(moderator.moderateOutput(task, image)).resolves.toEqual({
      status: "rejected",
      codes: ["PROVIDER_VIOLENCE"],
    });
    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.stringify(JSON.parse(String(init.body)).input)).toContain("data:image/png;base64");
  });

  it("maps transient HTTP failures for BullMQ retry", async () => {
    process.env.MODERATION_TEST_KEY = "secret";
    const moderator = new OpenAIContentModerator(
      options,
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })) as never,
      resolver,
    );
    await expect(moderator.moderateInput(task)).rejects.toMatchObject({
      code: "MODERATION_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
  });
});
