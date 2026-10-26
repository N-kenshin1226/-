import { expect, test, type Page } from "@playwright/test";

// X-8: UI-01 で未カバーだった画面の e2e。
// 見るだけの画面（能力・立場・書店・新聞）は表示確認、
// 記録削除は「いいえで残る／はいで消える」の両経路とリロード後の非復活を踏む。

/** 新規ゲームを開始してメニューまで進める */
async function startNewGame(page: Page) {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await expect(page.getByTestId("menu")).toBeVisible();
}

test("能力画面が開ける（タブ帯・技能行）", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-status").click();
  await expect(page.getByTestId("screen-status")).toBeVisible();
  await expect(page.getByTestId("screen-status")).toContainText("STATUS");
  await expect(page.getByTestId("screen-status")).toContainText("鍛冶");
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-status.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("立場画面が開ける（目標と認定）", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-society").click();
  await expect(page.getByTestId("screen-society")).toBeVisible();
  await expect(page.getByTestId("screen-society")).toContainText("目標と認定");
  await page.screenshot({ path: "e2e/artifacts/trace-society.png", fullPage: true });
});

test("書店の棚に書物が並ぶ", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-book").click();
  await expect(page.getByTestId("screen-book")).toBeVisible();
  await expect(page.getByTestId(/^book-(buy|read)?-?\w/).first()).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-book.png", fullPage: true });
});

test("今朝の新聞が開ける（題字と号数）", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-news").click();
  await expect(page.getByTestId("screen-news")).toBeVisible();
  await expect(page.getByTestId("screen-news")).toContainText("アルディ新報");
  await expect(page.getByTestId("screen-news")).toContainText("第零号");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e/artifacts/trace-news.png", fullPage: true });
});

test("家で休むと日が進む（起床画面→翌朝5/5）", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-rest").click();
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await page.getByTestId("wake-done").click();
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
  await expect(page.getByTestId("status")).toContainText("2日");
});

test("記録を消す：いいえで残り、はいで消えてリロードしても戻らない", async ({ page }) => {
  await startNewGame(page);

  // いいえ → そのまま遊べる
  await page.getByTestId("menu-reset").click();
  await expect(page.getByTestId("screen-reset")).toContainText("全ての記録を消します");
  await expect(page.getByTestId("confirm-yes")).toBeVisible();
  await page.getByTestId("confirm-no").click();
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("menu-status")).toBeVisible();

  // はい → タイトルへ戻る
  await page.getByTestId("menu-reset").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();

  // localStorage のセーブと年代記が両方消えている
  const keys = await page.evaluate(() => ({
    save: localStorage.getItem("trace.save.v1"),
    chronicle: localStorage.getItem("trace.chronicle.v1"),
  }));
  expect(keys.save).toBeNull();
  expect(keys.chronicle).toBeNull();

  // リロードしても消したセーブは復活しない（タイトルのまま）
  await page.goto("/?seed=e2e");
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
});
