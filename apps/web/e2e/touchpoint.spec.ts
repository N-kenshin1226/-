import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newGame, serialize } from "@trace/core";
import { placeAct, skipIntro } from "./helpers.js";

/**
 * W-02 危機の接点（docs/08 §5）：「異変：」の印つきの注文・敵が日常に混ざる。
 * 達成は世界の備えへの寄与になる。受けても受けなくてもよい
 */

// UI は skillList 全件を使うので、仕込むセーブは全技能を持つ必要がある
// （@trace/content は JSON 同梱のため e2e からは import できない。skills.json を直接読む）
const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const crisisBalance = (
  jsonAt("balance.json") as {
    crisis: { strongFields: number; weakFieldFactor: number; touchpoints: unknown };
  }
).crisis;

const saveOf = (seed: string, stageIndex: number): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 100,
    crisis: {
      // 公開サンプルの危機の型だけ（hidden は読まない）。係数は balance.crisis 由来
      types: jsonAt("crises/sample.json").crises,
      strongFields: crisisBalance.strongFields,
      weakFieldFactor: crisisBalance.weakFieldFactor,
    },
  });
  // 段階を指定のものに進めたセーブとして仕込む（段階の経過そのものは W-01 の検証済み）
  const patched = { ...g, crisis: g.crisis === null ? null : { ...g.crisis, stageIndex } };
  return serialize(patched);
};

test("接点の注文が仕事に混ざる（異変：印。こなすと世界の備えに寄与する）", async ({ page }) => {
  // shot-0 の世界（?crisis=sample で公開サンプルの型に固定）：初日（兆し）から
  // 鍛冶の接点《警備隊への武具納入》が注文に混ざる
  await page.goto("/?world=legacy&seed=shot-0&crisis=sample");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  // 鍛冶の接点は鍛冶場の注文に混ざる（P-01）
  await placeAct(page, "forge", "work");
  const scr = page.getByTestId("screen-work");
  await expect(scr).toBeVisible();
  await expect(scr).toContainText("異変：警備隊への武具納入");
  await page.screenshot({ path: "e2e/artifacts/trace-touchpoint-work.png", fullPage: true });
  // 接点の注文を「まかせる」で納めると、世界の備えに寄与した旨の1行が出る
  await page.getByTestId("order-tp.sample_mist.forgework").click();
  await page.getByTestId("work-simple").click();
  await expect(page.getByTestId("log")).toContainText("世界の備え");
  await page.screenshot({ path: "e2e/artifacts/trace-touchpoint-done.png", fullPage: true });
});

test("接点の相手が狩りに混ざる（拡大段階。異変：印の敵が現れる）", async ({ page }) => {
  // shot-26 の世界を拡大段階に進めたセーブ：狼が接点の相手として現れる
  await page.addInitScript(
    (save) => {
      localStorage.setItem("trace.save.v1", save);
    },
    saveOf("shot-26", 1),
  );
  // セーブの危機は公開サンプル型で仕込んである —— 実行側も同じ型で解決する（?crisis=sample）
  await page.goto("/?world=legacy&crisis=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  // 狼のいる森へ出る（P-01：門 → 行動を消費して森へ）
  await placeAct(page, "gate", "go-forest");
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "forest");
  await page.getByTestId("place-hunt").click();
  const scr = page.getByTestId("screen-hunt");
  await expect(scr).toBeVisible();
  await expect(scr).toContainText("異変：");
  await page.screenshot({ path: "e2e/artifacts/trace-touchpoint-hunt.png", fullPage: true });
});
