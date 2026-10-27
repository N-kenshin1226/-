import { expect, test } from "@playwright/test";

// UI-01（README 決まりごと4）：全ての操作はキーボードだけで完結する。
// ↑↓ で選択・Enter で決定・Esc で戻る。使えない項目は飛ばす。
test("キーボードだけで1日遊べる（選択→鍛錬→宿→起床）", async ({ page }) => {
  await page.goto("/?seed=e2e-keys");
  // React のマウントとキー監視の取り付けが済むまで待つ（見えても効果未付の隙間がある）
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
  await page.waitForTimeout(250);

  // タイトル：コマンド列は 出自3 → 傾向3 → 誓約5 の順。先頭が流れてきた孤児（Enter のみ）
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 鍛錬へ（メニュー先頭が仕事、2番目が鍛錬）
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("screen-train")).toBeVisible();

  // 先頭の技能を選んで難度へ潜り、おすすめ（+10）を選ぶ
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("log")).toContainText("未定着");

  // Esc で技能一覧→もう一度 Esc で街へ戻る
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 「宿で眠る」は10番目。↓ を9回（ヘッダ・区切りは飛ばされる）
  for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("screen-sleep")).toBeVisible();

  // 先頭の宿（安宿）で眠る → 起床の窓 → Enter で起きる
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
});
