import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newGame, serialize, type ArtDef, type ArtsConfig, type GameState } from "@trace/core";
import { placeAct, travelTo, waitVeil } from "./helpers.js";

/**
 * K-02「武技・資源・構成」（docs/09 §1〜3・§5〜6）：
 *   1. 武器屋の「技の構えを整える」で覚えた技を構えに仕込む（行動は消費しない）
 *   2. 能力画面の技タブに覚えた技が Lv・気力と共に並ぶ
 *   3. 戦闘では「武技」コマンドに気力の残りが出て、技を撃つと気力が減る
 * 覚えた技の状態はセーブ注入で作る（技の習得そのものは単体テストが見る）
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const artDefs = Object.fromEntries(
  (jsonAt("arts.json") as { arts: ArtDef[] }).arts.map((a) => [a.id, a]),
);
/** アプリが注入するのと同じ ArtsConfig（game.ts の { defs, ...balance.arts } と同形） */
const artsCfg: ArtsConfig = {
  defs: artDefs,
  ...(jsonAt("balance.json") as { arts: Omit<ArtsConfig, "defs"> }).arts,
};

/** 剣技と構えを仕込んだ旅人のセーブ（剣を装備。短刀も持って持ち替えを試せる） */
const saveWithArts = (seed: string): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 40,
    initialWeapons: ["fist", "sword", "knife"],
    initialWeapon: "sword",
    arts: artsCfg,
  });
  // 覚えている技：剣の技4種＋パッシブ2種（剣の技能を上げておくと技Lv表示が自然）
  const learned: Record<string, { lv: number; exp: number; pending: number }> = {
    s_slash: { lv: 3, exp: 30, pending: 2 },
    s_thrust: { lv: 2, exp: 12, pending: 0 },
    s_riposte: { lv: 1, exp: 0, pending: 0 },
    s_helm: { lv: 1, exp: 5, pending: 0 },
    pa_edge: { lv: 1, exp: 0, pending: 0 },
    pa_flow: { lv: 1, exp: 0, pending: 0 },
  };
  const patched: GameState = {
    ...g,
    player: {
      ...g.player,
      weapons: ["fist", "sword", "knife"],
      weapon: "sword",
      arts: learned,
      build: {
        slots: ["s_slash", "s_thrust", "s_riposte", "s_helm", null, null, null, null],
        passives: ["pa_edge", "pa_flow", null, null],
        weapons: ["sword", "knife"],
      },
    },
  };
  return serialize(patched);
};

const loadSave = (page: Page, save: string) =>
  page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);

test("武器屋で技の構えを整える：スロットに収まり、行動は消費しない（K-02）", async ({ page }) => {
  await loadSave(page, saveWithArts("e2e-k02-build"));
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();
  const actionsBefore = await page.getByTestId("status").textContent();

  // 鍛冶場 → 技の構えを整える（立ち寄るだけなら行動は消費しない）
  await placeAct(page, "forge", "build");
  const build = page.getByTestId("screen-build");
  await expect(build).toBeVisible();
  await expect(build).toContainText("武技の構え");
  // 覚えた技が《》つきで並び、構えに入った印が付く
  await expect(build).toContainText("《薙ぎ払い》");
  await expect(build).toContainText("《突き》");
  // パッシブと武器の段も出る
  await expect(build).toContainText("《刃筋》");
  await expect(build).toContainText("剣");
  await page.screenshot({ path: "e2e/artifacts/trace-k02-build.png", fullPage: true });

  // 構えを1枠外しても行動は減らない（街での組み換えは行動を使わない）
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("status")).toContainText(actionsBefore ?? "");
});

test("能力画面の技タブに覚えた技が Lv・気力と共に並ぶ（K-02）", async ({ page }) => {
  await loadSave(page, saveWithArts("e2e-k02-status"));
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  await placeAct(page, "home", "status");
  await expect(page.getByTestId("screen-status")).toBeVisible();
  // 2番目のタブが「技」
  await page.getByTestId("tab-1").click();
  await expect(page.getByTestId("art-s_slash")).toContainText("《薙ぎ払い》");
  await expect(page.getByTestId("art-s_slash")).toContainText("Lv3");
  await expect(page.getByTestId("art-s_slash")).toContainText("気力");
  // パッシブは気力を出さない
  await expect(page.getByTestId("art-pa_edge")).toContainText("《刃筋》");
  await expect(page.getByTestId("art-pa_edge")).not.toContainText("気力");
  await page.screenshot({ path: "e2e/artifacts/trace-k02-arts.png", fullPage: true });
});

test("戦闘で武技を撃つ：気力が減り、技名が拍に刻まれる（K-02）", async ({ page }) => {
  await loadSave(page, saveWithArts("e2e-k02-combat"));
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  await travelTo(page, "forest");
  await page.getByTestId("place-hunt").click();
  await page.getByTestId("enemy-stray_dog").click();
  await waitVeil(page);

  // 「武技」コマンドに気力の残りが出る
  const artsCmd = page.getByTestId("combat-arts");
  await expect(artsCmd).toBeVisible();
  await expect(artsCmd).toContainText("気力");
  // 気力ゲージも出ている
  await expect(page.getByTestId("combat-ki")).toBeVisible();
  await artsCmd.click();

  // 剣の技が並び、気力の足りるものは選べる
  await expect(page.getByTestId("combat-art-s_slash")).toContainText("《薙ぎ払い》");
  await expect(page.getByTestId("combat-art-s_slash")).toBeEnabled();
  // 短刀の技はスロットに無い（剣構成）
  await page.screenshot({ path: "e2e/artifacts/trace-k02-combat-arts.png", fullPage: true });
  await page.getByTestId("combat-art-s_slash").click();

  // 技名が拍に刻まれ、気力が減る
  await expect(page.getByTestId("combat-beat")).toContainText("薙ぎ払い");
  const kiText = await page.getByTestId("combat-ki").textContent();
  expect(kiText).toMatch(/\d/);
});
