import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newGame, serialize } from "@trace/core";
import type { GameState } from "@trace/core";

/**
 * W-04 終幕の見せ方（docs/08 §3・§7）：
 *   1. 何もしなくても世界は自分で決着へ進む ―― 結末はランクS通知→紙の層の終幕画面
 *   2. 関与の段階3・4で届いた打診は会話の窓の人物が運び、応えた先にも終幕が来る
 * 危機の段階・進行度はどの画面にも常時出ない。終幕を閉じれば世界で遊び続けられる。
 * 公開サンプルの危機の型だけを使う（hidden は読まない）
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const crisisBalance = jsonAt("balance.json") as {
  crisis: { strongFields: number; weakFieldFactor: number };
  time: { daysPerSeason: number };
};

/**
 * 最後の決着の場面の1変わり目前の世界（公開サンプル型）：
 * 街道の奪還は既に敗れた判定済み、霧晴らしの儀式が次の変わり目に来る。
 * 次に日付が進めば世界は自分で終幕へ進む ―― 主人公の行動を必要としない
 */
const saveNearEnding = (seed: string): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 100,
    crisis: {
      // 公開サンプルは複数の型を持つ。場面id・語りを固定したいので
      // 抽選プールは霧の型に絞る（重み付き抽選の結果に左右されない）
      types: (jsonAt("crises/sample.json") as { crises: { id: string }[] }).crises.filter(
        (c) => c.id === "crisis.sample_mist",
      ) as never,
      strongFields: crisisBalance.crisis.strongFields,
      weakFieldFactor: crisisBalance.crisis.weakFieldFactor,
    },
  });
  const crisis = g.crisis!;
  const patched: GameState = {
    ...g,
    // 季節の最終日に置く：次の sleep/rest で変わり目を跨ぐ
    time: { ...g.time, day: crisisBalance.time.daysPerSeason - 1, action: 0 },
    crisis: {
      ...crisis,
      stageIndex: 2,
      seasonsInStage: 0,
      boundaries: 3,
      finales: [
        { ...crisis.finales[0]!, resolved: true, success: false, total: 0 },
        crisis.finales[1]!,
      ],
    },
  };
  return serialize(patched);
};

/** 段階4の関与＋儀式の分野に充分な寄与を積んだ世界（率いた決着が必ず届く）。打診は届いている */
const saveStage4 = (seed: string): string => {
  const s = JSON.parse(saveNearEnding(seed)) as GameState;
  return serialize({
    ...s,
    counters: { ...s.counters, "crisis.tp.done": 300 },
    flags: { ...s.flags, "crisis.offer.finale.rite": true },
    crisis: {
      ...s.crisis!,
      hero: { ...s.crisis!.hero, knowledge: 100, bond: 100 },
    },
  });
};

test("何もしないままでも世界は終幕へ進む ―― S通知から紙の層の結末画面へ", async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem("trace.save.v1", save);
  }, saveNearEnding("shot-w04-idle"));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  // 打診は届いていないので「決着の場面」の項目は出ない（クエスト一覧ではない）
  await expect(page.getByTestId("menu-crisis")).toHaveCount(0);
  // 普通に一日を終える ―― すると世界は自分で決着へ進む
  await page.getByTestId("menu-rest").click();
  // 結末はランクSの通知として届く（起きる前に帯が世界を遮る）
  await expect(page.getByTestId("notice-s")).toBeVisible();
  await expect(page.getByTestId("notice-s")).toContainText("終 幕");
  await page.screenshot({ path: "e2e/artifacts/trace-w04-notice-ending.png", fullPage: true });
  // 「一頁を開く」→ 紙の層の終幕画面（危機の型の語り＋その世界の年代記の頁）
  await page.getByTestId("notice-s").click();
  await expect(page.getByTestId("screen-ending")).toBeVisible();
  await expect(page.getByTestId("ending-narration")).toContainText("霧");
  await expect(page.getByTestId("ending-page")).toBeVisible();
  await expect(page.getByTestId("ending-trace").first()).toContainText("――");
  await page.screenshot({ path: "e2e/artifacts/trace-w04-ending-resolved.png", fullPage: true });
  // 終幕は終了画面ではない ―― 閉じれば同じ世界で遊び続けられる
  await page.getByTestId("ending-continue").click();
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("段階4の打診は会話の窓の人物が運び、率いた先にも終幕が来る", async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem("trace.save.v1", save);
  }, saveStage4("shot-w04-lead"));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await page.getByTestId("menu-crisis").click();
  const scr = page.getByTestId("screen-crisis");
  await expect(scr).toBeVisible();
  // 届いた打診は会話の窓で人物が持ちかける（勢力の使いの名札つき）
  const dlg = page.getByTestId("crisis-offer-dialogue");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("の使い");
  await expect(dlg).toContainText("あなたの力を借りたい");
  // 関与の段階・進行度の数字は画面に出ない
  await expect(scr).not.toContainText("段階");
  await expect(scr).not.toContainText("関与");
  await expect(page.getByTestId("crisis-lead-finale.rite")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-w04-crisis-lead.png", fullPage: true });
  // 自分で起こす：場面を選び → 全面的に → 確認
  await page.getByTestId("crisis-lead-finale.rite").click();
  await page.getByTestId("lead-all").click();
  await page.getByTestId("confirm-yes").click();
  // 率いた決着（S通知）→ 終幕（S通知）→ 一頁を開く
  await expect(page.getByTestId("notice-s")).toBeVisible();
  await page.getByTestId("notice-s").click();
  await expect(page.getByTestId("notice-s")).toBeVisible();
  await expect(page.getByTestId("notice-s")).toContainText("終 幕");
  await page.getByTestId("notice-s").click();
  await expect(page.getByTestId("screen-ending")).toBeVisible();
  // 率いた者の痕跡：あなたの名が終幕に織り込まれる
  await expect(page.getByTestId("ending-trace").first()).toContainText("旅人");
  await page.screenshot({ path: "e2e/artifacts/trace-w04-ending-led.png", fullPage: true });
  await page.getByTestId("ending-continue").click();
  await expect(page.getByTestId("menu")).toBeVisible();
});
