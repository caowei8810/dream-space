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

  it("calls billing order and refund endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, pageCount: 1 }),
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await adminApi.billingOrders({ status: "paid", query: "188", page: 1, pageSize: 20 });
    await adminApi.refundBillingOrder("order-1", {
      amountCents: 1000,
      reason: "测试退款",
      idempotencyKey: "refund-key-1",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/admin/billing/orders?status=paid&query=188&page=1&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/admin/billing/orders/order-1/refund",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("calls the dashboard and role endpoints with the admin session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ generation: {}, users: {}, revenue: {} })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], permissions: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "role-1" })));
    vi.stubGlobal("fetch", fetchMock);

    await adminApi.dashboardSummary();
    await adminApi.roles();
    await adminApi.deleteRole("role-1", { reason: "自动化测试" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/admin/dashboard/summary",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/admin/roles",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/admin/roles/role-1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("calls model configuration lifecycle endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }))),
      );
    vi.stubGlobal("fetch", fetchMock);
    await adminApi.models();
    await adminApi.updateProvider("provider-1", {
      baseUrl: "https://api.example.com/v1",
      secretRef: "env://PROVIDER_KEY",
      timeoutMs: 30000,
      retryLimit: 2,
      reason: "测试",
    });
    await adminApi.createProvider({
      code: "openai",
      name: "OpenAI",
      baseUrl: "https://api.example.com/v1",
      secretRef: "env://KEY",
      timeoutMs: 30000,
      retryLimit: 2,
      reason: "测试",
    });
    await adminApi.createModel({
      code: "demo",
      name: "Demo",
      providerId: "provider-1",
      providerModelId: "demo",
      capabilities: { ratios: ["1:1"], resolutions: ["2K"], maxImageCount: 1 },
      reason: "测试",
    });
    await adminApi.createModelVersion("model-1", { config: { temperature: 0.7 }, reason: "测试" });
    await adminApi.updateModelRoute("model-1", "provider-1", {
      providerModelId: "demo",
      enabled: true,
      weight: 100,
      priority: 0,
      reason: "启用路由",
    });
    await adminApi.publishModel("model-1", 2, "测试");
    await adminApi.rollbackModel("model-1", "测试");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:4000/admin/models",
      "http://localhost:4000/admin/models/providers/provider-1",
      "http://localhost:4000/admin/models/providers",
      "http://localhost:4000/admin/models",
      "http://localhost:4000/admin/models/model-1/versions",
      "http://localhost:4000/admin/models/model-1/routes/provider-1",
      "http://localhost:4000/admin/models/model-1/publish?version=2",
      "http://localhost:4000/admin/models/model-1/rollback",
    ]);
  });

  it("loads relative generation assets from the user web origin", async () => {
    expect(resolveAdminAssetUrl("/inspiration/portrait-01.webp")).toBe(
      "http://localhost:3000/inspiration/portrait-01.webp",
    );
    expect(resolveAdminAssetUrl("https://cdn.example.com/result.webp")).toBe(
      "https://cdn.example.com/result.webp",
    );
  });

  it("calls real inspiration candidate and publish endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}))));
    vi.stubGlobal("fetch", fetchMock);
    await adminApi.inspirationCandidates({ query: "花房", page: 1, pageSize: 20 });
    await adminApi.publishCandidate("result-1");
    await adminApi.unpublishInspiration("inspiration-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/admin/inspiration-candidates?query=%E8%8A%B1%E6%88%BF&page=1&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/admin/inspiration-candidates/result-1/publish",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/admin/inspirations/inspiration-1/unpublish",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
