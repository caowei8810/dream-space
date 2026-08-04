import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminInspirationInput } from "@dream-space/contracts";
import { adminApi, type AdminApiError, resolveAdminAssetUrl } from "../lib/admin-api";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("uses isolated admin auth and paginated task endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ challengeId: "challenge-1", expiresAt: "", retryAfterSeconds: 60 }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, user: { id: "admin-1" } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 0, page: 2, pageSize: 20, pageCount: 0 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await adminApi.sendCode({ phone: "18800000000" });
    await adminApi.login({ phone: "18800000000", challengeId: "challenge-1", code: "123456" });
    await adminApi.tasks({ status: "succeeded", page: 2, pageSize: 20 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/admin/auth/codes",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/admin/auth/login",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/admin/tasks?status=succeeded&page=2&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("surfaces API permission errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "当前管理员没有该操作权限" }), { status: 403 }),
        ),
    );

    await expect(adminApi.tasks({})).rejects.toMatchObject({
      name: "AdminApiError",
      message: "当前管理员没有该操作权限",
      status: 403,
    } satisfies Partial<AdminApiError>);
  });

  it("loads relative generation assets from the user web origin", async () => {
    expect(resolveAdminAssetUrl("/inspiration/portrait-01.webp")).toBe(
      "http://localhost:3000/inspiration/portrait-01.webp",
    );
    expect(resolveAdminAssetUrl("https://cdn.example.com/result.webp")).toBe(
      "https://cdn.example.com/result.webp",
    );
  });

  it("calls real inspiration management endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}))));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      slug: "managed-inspiration",
      title: "管理端灵感",
      prompt: "柔和自然光",
      category: "portrait",
      imageUrl: "/inspiration/portrait-01.webp",
      thumbnailUrl: "/inspiration/portrait-01.webp",
      width: 1350,
      height: 2400,
      modelName: "image-4.7",
      ratio: "9:16",
      resolutionLabel: "1350 × 2400",
      authorDisplayName: "运营精选",
      sourceType: "internal",
      sourceName: "造梦空间",
      sourceUrl: null,
      licenseBasis: "内部生成素材",
      isAiGenerated: true,
      likeCount: 0,
      sortOrder: 0,
    } satisfies AdminInspirationInput;

    await adminApi.createInspiration(input);
    await adminApi.updateInspiration("inspiration-1", input);
    await adminApi.publishInspiration("inspiration-1");
    await adminApi.unpublishInspiration("inspiration-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/admin/inspirations",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/admin/inspirations/inspiration-1",
      expect.objectContaining({ method: "PATCH", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/admin/inspirations/inspiration-1/publish",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:4000/admin/inspirations/inspiration-1/unpublish",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
