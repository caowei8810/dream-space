import { afterEach, describe, expect, it, vi } from "vitest";
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
});
