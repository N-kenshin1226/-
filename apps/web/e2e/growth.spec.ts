import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newGame, serialize } from "@trace/core";

/**
 * F-01「成長の爽快感」の見え方を固定する e2e。
 *
 * - 集中した夜（未定着の半分以上がひとつの技能）は合計上限が緩み、
 *   削られた分は「+X は明日に持ち越し」と起床画面に出る
 * - ランク帯を越えた朝は「――《技能》は《ランク》の域に達しました。」の節目行が出る
 * - 出自の initialSkills は最初の人物カード・ステータスに値として出る
 *
 * 期待値はハードコードせず、core の newGame/serialize から組み立てる。
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const ORIGINS = jsonAt("origins.json") as {
  origins: {
    id: string;
    potentialBase: number;
    affinity: Record<string, number>;
    initialSkills?: Record<string, { min: number; max: number }>;
  }[];
};

/** 画面遷移フェード（0.25s）の完了を待つ（screens.spec と同じ待ち方） */
const fade = (page: Page) => page.waitForTimeout(400);

/** 未定着を大きく積んだ状態のセーブ（集中した夜 → 持ち越し＋ランクアップが同じ朝に出る） */
const saveF01 = (seed: string): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  // 鍛冶に24の未定着（上限を大きく超える → 持ち越し行が出る）
  g.player.skills.smithing!.pending = 24;
  // 剣術は9（見習いの手前）＋未定着6（集中係数つきの夜で10を越える → ランクアップ行が出る）
  g.player.skills.swordplay = { ...g.player.skills.swordplay!, value: 9, peak: 9, pending: 6 };
  return serialize(g);
};

test("起床画面：集中した夜の伸び・持ち越し・ランクアップの節目（F-01）", async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem("trace.save.v1", save);
  }, saveF01("f01-wake"));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 上宿・夕食ありで眠る（質を上げて定着を太くする）。宿を選んだ時点で眠るので夕食を先に確定させる
  await page.getByTestId("menu-sleep").click();
  await page.getByTestId("dinner-yes").click();
  await page.getByTestId("inn-good").click();

  const wake = page.getByTestId("screen-wake");
  await expect(wake).toBeVisible();
  // 上限で削られた分は消えず「持ち越し」として明示される
  await expect(wake).toContainText("は明日に持ち越し");
  // ランクの境目を越えた朝には節目の行が出る（剣術 9 → 11台 → 見習い）
  await expect(wake).toContainText("――《剣術》は《見習い》の域に達しました。");
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-f01-wake.png", fullPage: true });
});

test("出自の初期値：鍛冶屋の子は鍛冶が最初の朝から値を持つ（F-01）", async ({ page }) => {
  const seed = "f01-origin";
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("origin-smith_child").click();
  await expect(page.getByTestId("menu")).toBeVisible();

  // 期待値は core の newGame と同じシードから引く（content が変わっても追従する）
  const origin = ORIGINS.origins.find((o) => o.id === "origin.smith_child")!;
  const expected = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    origin: {
      id: origin.id,
      potentialBase: origin.potentialBase,
      affinity: origin.affinity,
      initialSkills: origin.initialSkills,
    },
  }).player.skills.smithing!.value;
  expect(expected).toBeGreaterThanOrEqual(8);
  expect(expected).toBeLessThanOrEqual(12);

  // 人物カードの技能上位に《鍛冶》が初期値つきで出る
  const menu = page.getByTestId("menu");
  await expect(menu).toContainText("鍛冶");
  await expect(menu).toContainText(expected.toFixed(1));
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-f01-origin.png", fullPage: true });
});
