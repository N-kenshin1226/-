import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newGame, serialize, type GameState } from "@trace/core";
import { dismissFx, placeAct } from "./helpers.js";

/**
 * K-03「技の進化・合成・ユニーク」（docs/09 §7）の e2e。
 * ?k03=sample で公開サンプルの隠し分岐・レシピ・ユニークに固定する
 * （本番は hidden/k03 —— 変わりうる中身に検証を振られないための口）。
 * 条件を満たしたセーブを畳んで、行動の直後の判定を見る
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));
const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);

/** 技能の値と刻印だけいじった旅人のセーブ（条件DSLは value を読む） */
const savePatched = (
  seed: string,
  values: Record<string, number>,
  counters: Record<string, number> = {},
  titles: string[] = [],
): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 200,
    initialStatValue: 30,
    initialMoney: 40,
  });
  const skills = { ...g.player.skills };
  for (const [id, v] of Object.entries(values)) {
    const s = skills[id];
    if (s !== undefined) skills[id] = { ...s, value: v, peak: v };
  }
  const patched: GameState = {
    ...g,
    player: { ...g.player, skills },
    titles: [...g.titles, ...titles],
    counters: { ...g.counters, ...counters },
  };
  return serialize(patched);
};

const loadSave = (page: Page, save: string) =>
  page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);

test("合成：2つの技能が揃うと行動の末に技が生まれ、B札と記録に残る", async ({ page }) => {
  // 公開サンプルの《焔刃》：swordplay≥15 × fire_magic≥12
  await loadSave(page, savePatched("e2e-k03-syn", { swordplay: 15, fire_magic: 12 }));
  await page.goto("/?k03=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  // 何か行動を起こす → 処理の終わりの響き合い判定で技が生まれる
  await placeAct(page, "market", "stroll");
  // B札：技の名だけ届く（レシピは伏せられたまま）
  await expect(page.getByTestId("fx-tag").last()).toContainText("《焔刃》");
  await expect(page.getByTestId("log")).toContainText("響き合い");
  await page.screenshot({ path: "e2e/artifacts/trace-k03-synthesized.png", fullPage: true });
});

test("ユニーク：厳しい条件を満たすとSの帯で届き、技帳に載る", async ({ page }) => {
  // 公開サンプルの《暁光の剣》：swordplay≥55 × 進化の累計刻印≥1。
  // S称号《剣の理を見た者》（swordplay≥50）は獲得済みにしておく ——
  // S通知は1日1枠の予算で、称号が先に取るとユニークは囁きに落ちる
  await loadSave(
    page,
    savePatched("e2e-k03-uniq", { swordplay: 55 }, { "art.evolved": 1 }, ["title.saw_the_way"]),
  );
  await page.goto("/?k03=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await placeAct(page, "market", "stroll");
  // Sの帯：「この技は、この世界であなただけのものだ」
  const band = page.getByTestId("notice-s");
  await expect(band).toBeVisible();
  await expect(band).toContainText("《暁光の剣》");
  await page.screenshot({ path: "e2e/artifacts/trace-k03-unique.png", fullPage: true });
  await band.click();

  // 技帳に載る（能力画面の技タブ）
  await placeAct(page, "home", "status");
  await expect(page.getByTestId("screen-status")).toBeVisible();
  await page.getByTestId("tab-1").click();
  await expect(page.getByTestId("art-x_firstlight")).toContainText("《暁光の剣》");
});
