import { expect, test } from "@playwright/test";

test("トップ画面に TRACE と表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-home.png", fullPage: true });
});
