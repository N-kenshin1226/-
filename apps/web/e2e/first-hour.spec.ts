import { expect, test } from "@playwright/test";
import { dismissFx, skipIntro } from "./helpers.js";

/**
 * F-06 最初の1時間：開始画面の出し分けと導入の会話窓、
 * および「――{name} を倒した。」の置換漏れの回帰。
 */

// 年代記に頁が1枚ある世界（2周目以降の開始画面を見るための仕込み）
const withChronicle = `localStorage.setItem("trace.chronicle.v1", JSON.stringify({
  version: 1,
  lives: [{
    name: "古の英雄", epithet: "title.hundred_wolves", daysLived: 42,
    titles: ["title.hundred_wolves"], standing: "citizen", profession: "smith",
    achievedGoals: [], notableWorks: [], cause: "death", worldSeed: "old-world",
  }],
}))`;

test("1周目の開始画面は出自だけ（誓約・運命の傾向は出ない）→ 導入の会話窓 → メニュー", async ({
  page,
}) => {
  await page.goto("/?seed=e2e");
  const app = page.getByTestId("app");
  // 出自の3択だけが並ぶ。「選ばなくても始められる」以下の節は出ない
  await expect(app).toContainText("出自");
  await expect(page.getByTestId("origin-wanderer")).toBeVisible();
  await expect(app).not.toContainText("誓約");
  await expect(app).not.toContainText("運命の傾向");
  await page.screenshot({ path: "e2e/artifacts/trace-f06-title-first.png", fullPage: true });

  await page.getByTestId("origin-wanderer").click();

  // 導入の会話窓（宿屋の主マルタ。どこにいるか・何ができるか）
  const intro = page.getByTestId("screen-intro");
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("アルディ");
  await expect(intro).toContainText("マルタ");
  await page.screenshot({ path: "e2e/artifacts/trace-f06-intro-1.png", fullPage: true });

  // 2頁目：眠ると経験が定着すること。Enter で読み進める
  await page.keyboard.press("Enter");
  await expect(intro).toContainText("眠");
  await expect(intro).toContainText("身に付いていく");
  await page.screenshot({ path: "e2e/artifacts/trace-f06-intro-2.png", fullPage: true });

  // 読み終えると街のメニューへ
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("導入の会話窓は Esc で飛ばせる", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await expect(page.getByTestId("screen-intro")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("2周目以降の開始画面は運命の傾向と誓約が出る（導入は挟まらない）", async ({ page }) => {
  await page.addInitScript(withChronicle);
  await page.goto("/?seed=e2e");
  const app = page.getByTestId("app");
  await expect(app).toContainText("選ばなくても始められる");
  await expect(app).toContainText("運命の傾向");
  await expect(app).toContainText("誓約");
  await page.screenshot({ path: "e2e/artifacts/trace-f06-title-second.png", fullPage: true });

  // 年代記に頁がある生では導入を挟まず街へ直行する
  await page.getByTestId("origin-wanderer").click();
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("最初の一日：働けば称号が付き、寝れば起床の窓に成長が載る（F-06 受け入れ）", async ({
  page,
}) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 仕事（釘打ち）を1回こなす → 初めての仕事の称号
  await page.getByTestId("menu-work").click();
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();
  await expect(page.getByTestId("log")).toContainText("称号");
  await expect(page.getByTestId("log")).not.toContainText("{");
  // F-02：称号はモーダルの通知窓でも届く。畳んでから次へ進む
  await dismissFx(page);

  // 宿で眠る → 起床の窓に昨日の頑張りの定着が載る（鍛冶の技能行）
  await page.getByTestId("menu-sleep").click();
  await page.getByTestId("inn-cheap").click();
  const wake = page.getByTestId("screen-wake");
  await expect(wake).toBeVisible();
  await expect(wake).toContainText("鍛冶");
  await expect(wake).not.toContainText("{");
});

test("戦闘に勝つと敵の名前入りの勝利文が出る（{name} 置換漏れの回帰）", async ({ page }) => {
  await page.goto("/?seed=e2e-combat");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  await page.getByTestId("menu-hunt").click();
  // 森の野犬（hp10）は初期の腕前でも2〜3発で倒せる ―― 念のため20回まで攻撃
  await page.getByTestId("enemy-stray_dog").click();
  for (let i = 0; i < 20; i++) {
    if (
      await page
        .getByTestId("combat-finish")
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByTestId("combat-attack").click();
  }
  // 勝利を確定すると結果の1行がログに残る ―― 「――野犬 を倒した。」（{name} ではない）
  await page.getByTestId("combat-finish").click();
  const log = page.getByTestId("log");
  await expect(log).toContainText("野犬 を倒した");
  await expect(log).not.toContainText("{");
});
