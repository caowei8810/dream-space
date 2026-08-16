import { expect, test } from "@playwright/test";
import { adminUrl, expectHealthyDocument, loginAdmin, watchRuntimeErrors } from "./helpers";

test.describe("管理端核心闭环", () => {
  test("管理员可查询任务并发布、下架灵感", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page);

    await expect(page.getByRole("heading", { name: "生成任务", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "生成任务" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("region", { name: "最近额度对账" })).toContainText("额度对账");
    await page.getByLabel("搜索任务", { exact: true }).fill("玻璃花房");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await expect(page.getByRole("region", { name: "生成任务列表" })).toContainText("玻璃花房");

    await page.setViewportSize({ width: 902, height: 858 });
    await expectHealthyDocument(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("region", { name: "最近额度对账" })).toBeVisible();
    await expectHealthyDocument(page);

    await page.goto(`${adminUrl}/inspirations`);
    await expect(page.getByRole("link", { name: "灵感管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByLabel("搜索灵感", { exact: true }).fill("b5-smoke-inspiration");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: "b5-smoke-inspiration" });
    await expect(row).toHaveCount(1);

    const publish = row.getByRole("button", { name: /发布灵感/ });
    if (await publish.isVisible()) await publish.click();
    await expect(row).toContainText("已发布");
    const publicResponse = await page.request.get(
      "http://localhost:4000/inspirations/b5-smoke-inspiration",
    );
    expect(publicResponse.status()).toBe(200);

    await row.getByRole("button", { name: /下架灵感/ }).click();
    await expect(row).toContainText("已下架");
    const hiddenResponse = await page.request.get(
      "http://localhost:4000/inspirations/b5-smoke-inspiration",
    );
    expect(hiddenResponse.status()).toBe(404);

    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("Viewer 可查看但不显示写操作", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page, "18800000001");
    await page.goto(`${adminUrl}/inspirations`);

    await expect(page.getByText("只读权限", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "新建灵感", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /发布灵感|下架灵感/ })).toHaveCount(0);
    const viewButtons = page.getByRole("button", { name: /查看灵感/ });
    await expect(viewButtons.first()).toBeVisible();
    const viewButtonCount = await viewButtons.count();
    expect(viewButtonCount).toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("Owner 可在基础管理中完成账号生命周期操作", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page);
    await page.goto(`${adminUrl}/admin-users`);

    await expect(page.getByRole("heading", { name: "管理员账号", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "管理员账号" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const row = page.getByRole("row").filter({ hasText: "ADM-SMOKE" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("已启用");

    await row.getByRole("button", { name: /停用管理员/ }).click();
    await expect(page.getByRole("heading", { name: "停用账号" })).toBeVisible();
    await page.getByRole("dialog").getByLabel("操作原因").fill("E2E 生命周期验证");
    await page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }).click();
    await expect(row).toContainText("已停用");

    await row.getByRole("button", { name: /激活管理员/ }).click();
    await expect(page.getByRole("heading", { name: "激活账号" })).toBeVisible();
    await page.getByRole("dialog").getByLabel("操作原因").fill("E2E 恢复验证");
    await page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }).click();
    await expect(row).toContainText("已启用");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("会话接口异常时展示统一错误态并支持重试", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page);
    await page.route("**/admin/auth/session", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "无法连接管理 API" })).toBeVisible();
    const retryButton = page.getByRole("button", { name: "重试" });
    await page.unroute("**/admin/auth/session");
    await retryButton.dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "生成任务", exact: true })).toBeVisible();
    await expectHealthyDocument(page);
    expect(runtimeErrors).toHaveLength(1);
    expect(runtimeErrors[0]).toContain("503");
  });

  test("直接访问无权限模块时展示 403 并隐藏导航入口", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page);
    await page.route("**/admin/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "restricted-admin",
            employeeNo: "ADM-RESTRICTED",
            displayName: "受限管理员",
            phoneMasked: "188****0000",
            roles: [{ id: "role-viewer", code: "viewer", name: "只读审阅员", system: true }],
            permissions: ["tasks:read"],
          },
        }),
      });
    });

    await page.goto(`${adminUrl}/inspirations`);
    await expect(page.getByRole("heading", { name: "无权访问" })).toBeVisible();
    await expect(page.getByRole("link", { name: "灵感管理" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "生成任务" })).toBeVisible();
    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("未知地址展示统一 404 状态", async ({ page }) => {
    await page.goto(`${adminUrl}/not-a-real-page`);
    await expect(page.getByText("页面不存在", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "返回生成任务" })).toHaveAttribute(
      "href",
      "/tasks",
    );
    await expectHealthyDocument(page);
  });
});
