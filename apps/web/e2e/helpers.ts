import { expect, type Page } from "@playwright/test";

/**
 * 初めての生（年代記に頁が無い）の冒頭に出る導入の会話窓を読み進める（F-06）。
 * 会話窓が出ていなければ何もしない ―― 年代記を仕込んだ世界でもそのまま使える。
 * Enter で2頁を読み進めると街のメニューへ着く
 */
export async function skipIntro(page: Page): Promise<void> {
  const intro = page.getByTestId("screen-intro");
  const shown = await intro
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("menu")).toBeVisible();
}

/**
 * F-02 の通知窓（A＝加護の窓 / S＝帯）が開いていたら畳む。
 * モーダルなので、開いたままだと背面の操作が効かない
 */
export async function dismissFx(page: Page): Promise<void> {
  for (const id of ["notice-a", "notice-s"]) {
    const el = page.getByTestId(id);
    while (await el.isVisible().catch(() => false)) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
    }
  }
}
