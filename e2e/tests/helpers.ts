import { expect, type Page } from "@playwright/test";

export const webUrl = process.env.E2E_WEB_URL ?? "http://localhost:3000";
export const adminUrl = process.env.E2E_ADMIN_URL ?? "http://localhost:3001";

export function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export async function expectHealthyDocument(page: Page) {
  const audit = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      brokenImages: Array.from(document.images)
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    };
  });
  expect(audit.duplicateIds).toEqual([]);
  expect(audit.horizontalOverflow).toBe(false);
  expect(audit.brokenImages).toEqual([]);
}

export async function loginUser(page: Page, phone: string) {
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("手机号", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "获取验证码", exact: true }).click();
  await page.getByLabel("验证码", { exact: true }).fill("123456");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "登录并继续", exact: true }).click();
}

export async function loginAdmin(page: Page, phone = "18800000000") {
  await page.goto(`${adminUrl}/login`);
  await page.getByLabel("手机号", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "获取验证码", exact: true }).click();
  await page.getByLabel("验证码", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "登录管理端", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
}
