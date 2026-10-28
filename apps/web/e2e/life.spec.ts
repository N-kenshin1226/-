import { expect, test, type Page } from "@playwright/test";
import { gotoPlace, placeAct, skipIntro, waitVeil } from "./helpers.js";

// P-02「行動の種類を増やす」：日々の営みの e2e。
// 市場・料理・賭け・人・掲示板・祈り・食事・棚・散策・採集・旅の各窓が
// 場所の行動から開き、行動の結果が記録（ログ）に残ること、
// 旅の野営で日が進み隣町ベルンに着くことを踏む。

/** 新規ゲームを開始してメニュー（見取り図）まで進める */
async function startNewGame(page: Page) {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
}

test("市場：売り買いの窓が開き、買うと品が増える", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "market", "market");
  await expect(page.getByTestId("screen-market")).toBeVisible();
  await expect(page.getByTestId("screen-market")).toContainText("市場");
  // 買い物：小麦粉を1つ買うと記録に残る
  await page.getByTestId("market-buy-mat.flour").click();
  await expect(page.getByTestId("log")).toContainText("小麦粉");
  await page.screenshot({ path: "e2e/artifacts/trace-life-market.png", fullPage: true });
});

test("掲示板：依頼の一覧が開く（納める品と報酬）", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "guild", "board");
  await expect(page.getByTestId("screen-board")).toBeVisible();
  await expect(page.getByTestId("screen-board")).toContainText("依頼掲示板");
  await expect(page.getByTestId("screen-board")).toContainText("薬草の納品");
  await page.screenshot({ path: "e2e/artifacts/trace-life-board.png", fullPage: true });
});

test("料理：レシピと材料の窓が開く", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "home", "cook");
  await expect(page.getByTestId("screen-cook")).toBeVisible();
  await expect(page.getByTestId("screen-cook")).toContainText("パン");
  await page.screenshot({ path: "e2e/artifacts/trace-life-cook.png", fullPage: true });
});

test("賭け事：掛け金の段が並び、張ると勝敗が記録に残る", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "tavern", "gamble");
  await expect(page.getByTestId("screen-gamble")).toBeVisible();
  await page.getByTestId("gamble-5").click();
  // 勝敗どちらでも賭けの記録が残る（勝った／負けた）
  await expect(page.getByTestId("log")).toContainText(/勝った|負けた/);
  await page.screenshot({ path: "e2e/artifacts/trace-life-gamble.png", fullPage: true });
});

test("人と過ごす：住人を選んで話すと仲が深まる", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "tavern", "social");
  await expect(page.getByTestId("screen-social")).toBeVisible();
  // 酒場の女将イルダを選び「話す」
  await page.getByTestId("social-npc.ilda").click();
  await page.getByTestId("way-talk").click();
  await expect(page.getByTestId("log")).toContainText("仲が深まった");
  await page.screenshot({ path: "e2e/artifacts/trace-life-social.png", fullPage: true });
});

test("祈る：教会で祈ると記録に残る", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "church", "pray");
  await expect(page.getByTestId("screen-pray")).toBeVisible();
  await page.getByTestId("pray").click();
  await expect(page.getByTestId("log")).toContainText("祈りを捧げた");
  await page.screenshot({ path: "e2e/artifacts/trace-life-pray.png", fullPage: true });
});

test("持ち物棚：家の棚が開く（最初は空）", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "home", "shelf");
  await expect(page.getByTestId("screen-shelf")).toBeVisible();
  await expect(page.getByTestId("screen-shelf")).toContainText("棚は空");
});

test("散策：街を歩くと出来事が記録に残る", async ({ page }) => {
  await startNewGame(page);
  await placeAct(page, "market", "stroll");
  // 散策の出来事の地の文が記録に残る（「――」始まり）
  await expect(page.getByTestId("log")).toContainText("――");
  await page.screenshot({ path: "e2e/artifacts/trace-life-stroll.png", fullPage: true });
});

test("採集：森で採集すると品が記録に残る", async ({ page }) => {
  await startNewGame(page);
  // 門 → 森へ（行動1消費）
  await gotoPlace(page, "gate");
  await page.getByTestId("place-go-forest").click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "forest");
  await waitVeil(page);
  await page.getByTestId("place-gather").click();
  await expect(page.getByTestId("log")).toContainText("手に入れた");
  await page.screenshot({ path: "e2e/artifacts/trace-life-gather.png", fullPage: true });
});

test("旅：ベルンへの道を野営で進み、隣町に着く", async ({ page }) => {
  await startNewGame(page);
  // 門 → 旅立つ（1行動消費、旅が始まる）
  await gotoPlace(page, "gate");
  await page.getByTestId("place-journey-bergen").click();
  await expect(page.getByTestId("screen-journey")).toBeVisible();
  await expect(page.getByTestId("screen-journey")).toContainText("ベルンへの道");
  await page.screenshot({ path: "e2e/artifacts/trace-life-journey.png", fullPage: true });

  // 野営3回で着く（ardı→bergen は3日）。各野営は眠りの幕→起床→街道へ
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("journey-camp").click();
    await expect(page.getByTestId("screen-wake")).toBeVisible();
    await waitVeil(page);
    await page.getByTestId("wake-done").click();
    await waitVeil(page);
  }
  // 着くと見取り図はベルンのもの（アルディの印は出ない）
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("menu")).toContainText("ベルン見取り図");
  await expect(page.getByTestId("menu-place-bern.market")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-life-bergen.png", fullPage: true });

  // ベルンの市場はベルンの品揃え（薬草と材木が並ぶ）
  await page.getByTestId("menu-place-bern.market").click();
  await waitVeil(page);
  await page.getByTestId("place-market").click();
  await expect(page.getByTestId("screen-market")).toBeVisible();
  await expect(page.getByTestId("market-buy-herb")).toBeVisible();
  await expect(page.getByTestId("market-buy-mat.timber")).toBeVisible();
});
