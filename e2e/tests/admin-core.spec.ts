import { expect, test } from "@playwright/test";
import { adminUrl, expectHealthyDocument, loginAdmin, watchRuntimeErrors } from "./helpers";

test.describe("管理端核心闭环", () => {
  test("管理员可查询任务并发布、下架灵感", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await loginAdmin(page);

    await expect(page.getByRole("heading", { name: "生成任务", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "最近额度对账" })).toContainText("额度对账");
    await page.getByLabel("搜索任务", { exact: true }).fill("玻璃花房");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await expect(page.getByRole("region", { name: "生成任务列表" })).toContainText("玻璃花房");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("region", { name: "最近额度对账" })).toBeVisible();
    await expectHealthyDocument(page);

    await page.goto(`${adminUrl}/inspirations`);
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
});
