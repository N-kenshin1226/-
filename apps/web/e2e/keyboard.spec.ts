import { expect, test } from "@playwright/test";
import { waitVeil, wakeUp } from "./helpers.js";

// UI-01（README 決まりごと4）：全ての操作はキーボードだけで完結する。
// ↑↓ で選択・Enter で決定・Esc で戻る。使えない項目は飛ばす。
// P-01：見取り図（場所の印を ↑↓ で選ぶ）→ 場所 → 行動、の移動もキーだけで辿れる
test("キーボードだけで1日遊べる（見取り図→ギルド→鍛錬→宿→起床）", async ({ page }) => {
  await page.goto("/?seed=e2e-keys");
  // React のマウントとキー監視の取り付けが済むまで待つ（見えても効果未付の隙間がある）
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
  await page.waitForTimeout(250);

  // タイトル：1周目のコマンド列は出自3つだけ（F-06。傾向・誓約は2周目以降）。
  // 先頭が流れてきた孤児（Enter のみ）
  await page.keyboard.press("Enter");
  // 初めての生では導入の会話窓が挟まる ―― Enter で2頁を読み進める
  await expect(page.getByTestId("screen-intro")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  // 見取り図（P-01。menu ＝街の見取り図）
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("map-pick")).toBeVisible();

  // 場所の印は上から下へ並ぶ（教会→ギルド→職工区→市場→宿屋→酒場→自宅→鍛冶場→門）。
  // ↓ でギルドへ進み Enter で向かう → 移動の幕を挟んで場所の画面が開く
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("place")).toBeVisible();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "guild");
  // 移動の幕はキーを呑むので、開ききるまで待ってから行動を選ぶ
  await waitVeil(page);

  // ギルドの行動の2番目が鍛錬（先頭は仕事）
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("screen-train")).toBeVisible();

  // 先頭の技能を選んで難度へ潜り、おすすめ（+10）を選ぶ
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("log")).toContainText("未定着");

  // Esc で技能一覧→もう一度 Esc でギルドへ戻る（P-01：戻る先はその場所）
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "guild");

  // 場所の画面の Esc は見取り図へ戻る
  await page.keyboard.press("Escape");
  await waitVeil(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // 宿屋へ（印は pos の並び順。場所が増えても辿れるよう、選中行に宿屋が出るまで ↓ を送る）
  for (let i = 0; i < 16; i++) {
    const pick = await page.getByTestId("map-pick").textContent();
    if (pick?.includes("宿屋")) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(page.getByTestId("map-pick")).toContainText("宿屋");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "inn");
  await waitVeil(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("screen-sleep")).toBeVisible();

  // 先頭の宿（安宿）で眠る → 眠りの幕 → 起床の窓 → Enter で起きる → 見取り図へ
  await page.keyboard.press("Enter");
  await wakeUp(page);
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
});
