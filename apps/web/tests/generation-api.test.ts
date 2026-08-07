import { afterEach, describe, expect, it, vi } from "vitest";
import { generationApi } from "../lib/generation-api";

afterEach(() => vi.unstubAllGlobals());

describe("generation API client", () => {
  it("uses authenticated HTTP endpoints for options and task creation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [],
            ratios: ["1:1"],
            resolutions: ["2K"],
            imageCount: { min: 1, max: 8 },
            referenceImages: { max: 4, maxBytes: 10, mimeTypes: [] },
            costPerImage: { "2K": 1, "4K": 2 },
            externalServicesMode: "mock",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: {}, task: {}, quota: {}, replayed: false }), {
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await generationApi.options();
    await generationApi.createTask({
      idempotencyKey: "request-12345678",
      sessionId: null,
      prompt: "测试提示词",
      model: "image-4.7",
      ratio: "1:1",
      resolution: "2K",
      imageCount: 1,
      referenceImageUrls: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/generation/options",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/generation/tasks",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("surfaces API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "额度不足" }), {
          status: 400,
        }),
      ),
    );

    await expect(generationApi.sessions()).rejects.toThrow("额度不足");
  });

  it("uploads reference files as multipart without overriding the boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "upload-1",
          url: "http://localhost:4000/uploads/references/upload-1/content",
          filename: "reference.webp",
          mimeType: "image/webp",
          width: 12,
          height: 8,
          byteSize: 100,
          checksumSha256: "a".repeat(64),
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["test"], "reference.png", { type: "image/png" });
    await generationApi.uploadReference(file);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.credentials).toBe("include");
    expect(request.method).toBe("POST");
    expect(request.headers).toBeUndefined();
    expect(request.body).toBeInstanceOf(FormData);
  });
});
