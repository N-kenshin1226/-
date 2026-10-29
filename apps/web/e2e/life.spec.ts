import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newGame, serialize } from "@trace/core";
import { dismissFx, gotoPlace, placeAct, skipIntro, waitVeil } from "./helpers.js";

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

/**
 * X-37：同行者（docs/10 §13「仲間との会話」の最小版）。仲が深まった
 * 住人を旅に誘うと一緒に歩く —— 状態画面に同行の行が出て、
 * 別れを告げれば同行は解かれる。X-38：話すと相手が応える
 * （仲が深まった記録のあとにその人の声が続く）。
 * 仲の値は注入セーブで温めておく
 * （seed "e2e" は 0 日目にイルダが酒場にいる決定的な種）
 */
test("人と過ごす：仲の深い住人を旅に誘い、声を交わし、別れを告げる（X-37/X-38）", async ({
  page,
}) => {
  const skills = JSON.parse(
    readFileSync(new URL("../../../packages/content/skills.json", import.meta.url), "utf8"),
  ) as { skills: { id: string }[] };
  const g = newGame("e2e", "旅人", {
    skillIds: skills.skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
  });
  // 仲 60（bondRespectMin=40 以上）：誘える水準に温めた状態で始める
  const save = serialize({ ...g, life: { ...g.life, bonds: { "npc.ilda": 60 } } });
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  // 酒場のイルダを旅に誘う —— 迎えの一行が記録に残り、一覧は「同行中」になる
  await placeAct(page, "tavern", "social");
  await expect(page.getByTestId("screen-social")).toBeVisible();
  await page.getByTestId("social-npc.ilda").click();
  await expect(page.getByTestId("way-invite")).toBeVisible();
  await page.getByTestId("way-invite").click();
  await expect(page.getByTestId("log")).toContainText("一緒に来ることになった");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("social-npc.ilda")).toContainText("同行中");
  await page.screenshot({ path: "e2e/artifacts/trace-companion.png", fullPage: true });

  // 同行者に話すと相手が応える（X-38：仲が深まった記録のあとに
  // その人の口で一言が続く —— 《名――「…」》の形で記録に残る）
  await page.getByTestId("social-npc.ilda").click();
  await page.getByTestId("way-talk").click();
  await expect(page.getByTestId("log")).toContainText("仲が深まった");
  await expect(page.getByTestId("log")).toContainText(/イルダ――「/);
  await page.screenshot({ path: "e2e/artifacts/trace-companion-talk.png", fullPage: true });
  await page.keyboard.press("Escape");
  // 一覧 → 場所（社交の窓を畳む）
  await page.keyboard.press("Escape");

  // 自室の状態画面にも同行の行が出る
  await gotoPlace(page, "home");
  await page.getByTestId("place-status").click();
  await expect(page.getByTestId("status-companion")).toContainText("同行：イルダ");
  await page.keyboard.press("Escape");

  // 別れを告げると同行は解かれる
  await placeAct(page, "tavern", "social");
  await page.getByTestId("social-npc.ilda").click();
  await page.getByTestId("way-part").click();
  await expect(page.getByTestId("log")).toContainText("別れた");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("social-npc.ilda")).toContainText("仲");
  await expect(page.getByTestId("social-npc.ilda")).not.toContainText("同行中");
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
  await page.getByTestId("place-journey-bergen-foot").click();
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

  // 町の個性が値段の横に出る：薬草・材木は特産、パンは品薄、他は何も付かない
  await expect(page.getByTestId("market-buy-herb")).toContainText("特産");
  await expect(page.getByTestId("market-buy-mat.timber")).toContainText("特産");
  await expect(page.getByTestId("market-buy-meal.bread")).toContainText("品薄");
  await expect(page.getByTestId("market-buy-mat.flour")).not.toContainText("特産");
  await expect(page.getByTestId("market-buy-mat.flour")).not.toContainText("品薄");
  await page.screenshot({ path: "e2e/artifacts/trace-life-bergen-market.png", fullPage: true });
});
