import { expect, test } from "@playwright/test";
import { expectHealthyDocument, loginUser, watchRuntimeErrors, webUrl } from "./helpers";

test.describe.serial("用户端核心闭环", () => {
  test("登录后首次提交生成，并可重命名和删除会话", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    const phone = `136${String(Date.now()).slice(-8)}`;
    const prompt = `E2E 雨后玻璃花房 ${Date.now()}`;
    const renamed = `E2E 会话 ${String(Date.now()).slice(-6)}`;

    await page.goto(`${webUrl}/generate`);
    await loginUser(page, phone);
    await expect(page).toHaveURL(/\/generate(?:\?auth=resumed)?$/);

    await page.getByPlaceholder("输入你想生成的画面，或上传参考图", { exact: true }).fill(prompt);
    await page.getByRole("button", { name: "提交生成", exact: true }).click();

    await expect(page).toHaveURL(/\/generate\/[^/?]+$/);
    await expect(page.getByText(/模拟生成完成/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("img", { name: "生成结果" })).toHaveCount(2);

    const sessionRow = page.locator(".session-row.active");
    await expect(sessionRow).toHaveCount(1);
    await expect(sessionRow).toContainText("E2E 雨后玻璃花房");
    await sessionRow.hover();
    await sessionRow.getByRole("button", { name: "重命名会话", exact: true }).click();
    await sessionRow.getByRole("textbox", { name: "重命名会话", exact: true }).fill(renamed);
    await sessionRow.getByRole("textbox", { name: "重命名会话", exact: true }).press("Enter");
    await expect(sessionRow.getByRole("button", { name: renamed, exact: true })).toBeVisible();

    await sessionRow.hover();
    await sessionRow.getByRole("button", { name: "删除会话", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(renamed);
    await dialog.getByRole("button", { name: "删除会话", exact: true }).click();
    await expect(page).toHaveURL(/\/generate$/);
    await expect(sessionRow).toHaveCount(0);

    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("语言、深色主题和移动布局可持久化", async ({ page }) => {
    const runtimeErrors = watchRuntimeErrors(page);
    await page.goto(`${webUrl}/inspiration`);
    await expect(page.getByRole("region", { name: "灵感作品" })).toBeVisible();

    await page.locator(".language-trigger").click();
    await page
      .getByRole("menu")
      .getByRole("button", { name: /English/ })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "For you", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: /Appearance/ }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectHealthyDocument(page);
    expect(runtimeErrors).toEqual([]);
  });
});
