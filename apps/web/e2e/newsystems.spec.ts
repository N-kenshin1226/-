import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  dailyDiscoveryHint,
  discoveryHintText,
  newGame,
  npcLifeDoneKey,
  serialize,
  weatherOf,
  type CrisisConfig,
  type DiscoveryDef,
  type GameState,
  type NpcLifeNpcDef,
  type TimeConfig,
  type WeatherConfig,
} from "@trace/core";

/**
 * X-15: X-11（隠し発見）・X-12（NPCの歳月）・X-13（天候）の「見え方」を
 * ブラウザで固定する e2e。機能追加ではなく表示の検証。
 *
 * 使う世界シードは e2e-h4 で統一（天候・新聞の続報欄・発見ヒントが
 * 決定的に同じ紙面に載ることを core の関数で事前確認済み）。
 * 期待値はハードコードせず、core の導出関数（weatherOf / dailyDiscoveryHint /
 * discoveryHintText）から組み立てる —— コンテンツが変わっても追従する。
 */

// @trace/content は JSON 同梱のため e2e からは import できない（occasion.spec と同じ手法）
const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const balance = jsonAt("balance.json") as {
  time: TimeConfig;
  weather: { orderPrice: WeatherConfig["orderPrice"] };
  crisis: { strongFields: number; weakFieldFactor: number };
};
const TIME = balance.time;
const WEATHER_CFG = {
  kinds: (jsonAt("weather.json") as { kinds: WeatherConfig["kinds"] }).kinds,
  orderPrice: balance.weather.orderPrice,
} satisfies WeatherConfig;
const DISCOVERIES = (jsonAt("discoveries.json") as { discoveries: DiscoveryDef[] }).discoveries;
const NPC_LIFE = (jsonAt("npc_lifecycle.json") as { npcs: NpcLifeNpcDef[] }).npcs;
const CRISIS_CFG = {
  types: (jsonAt("crises/sample.json") as { crises: CrisisConfig["types"] }).crises,
  strongFields: balance.crisis.strongFields,
  weakFieldFactor: balance.crisis.weakFieldFactor,
} satisfies CrisisConfig;
const cli = jsonAt("text/cli.json") as {
  display: {
    weekdayNames: Record<string, string>;
    moonNames: Record<string, string>;
    seasonNames: Record<string, string>;
  };
};
const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);

const SEED = "e2e-h4";

const baseGame = (seed: string, crisis?: CrisisConfig): GameState =>
  newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
    ...(crisis !== undefined ? { crisis } : {}),
  });

/** game.ts discoveryHintLine と同じ差し込み（{weekday}→曜日名 など） */
const hintTextOf = (state: GameState, def: DiscoveryDef): string =>
  discoveryHintText(def, state.seed, TIME, {
    weekday: (i) => `${cli.display.weekdayNames[i] ?? i}曜日`,
    moon: (p) => cli.display.moonNames[p] ?? p,
    season: (i) => cli.display.seasonNames[i] ?? String(i),
    dayOfSeason: (i) => `${i + 1}日目`,
  });

/** 画面遷移フェード（0.25s）の完了を待つ（screens.spec と同じ待ち方） */
const fade = (page: Page) => page.waitForTimeout(400);

/** 新規ゲームを開始してメニューまで進める（screens.spec と同じ流れ） */
async function startNewGame(page: Page, seed = SEED) {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("origin-wanderer").click();
  await expect(page.getByTestId("menu")).toBeVisible();
}

test("天候：起床画面に『今日の空』の行が出て、朝刊にも風景の行が載る（X-13）", async ({ page }) => {
  await startNewGame(page);
  // 家で休む → 1日目の朝。天候は seed+day から決定的
  const w = weatherOf(SEED, 1, WEATHER_CFG, TIME);
  await page.getByTestId("menu-rest").click();
  const wake = page.getByTestId("screen-wake");
  await expect(wake).toBeVisible();
  // 起床レポートの最上段：cli.json wake.weatherLine（――今日の空は{weather}。{line}）
  await expect(wake).toContainText(`――今日の空は${w.kind.name}。${w.line}`);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-wake-weather.png", fullPage: true });

  // 今朝の新聞：続報欄に今日の空の風景の行が載る（narration.json newspaper.weather）
  await page.getByTestId("wake-news").click();
  const news = page.getByTestId("screen-news");
  await expect(news).toBeVisible();
  await expect(news).toContainText(w.kind.name);
  await expect(news).toContainText(w.line);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-news-weather.png", fullPage: true });
});

test("発見ヒント：未発見の発見は朝刊の噂と街の噂に必ず回る（X-11）", async ({ page }) => {
  await startNewGame(page);
  await page.getByTestId("menu-rest").click();
  await page.getByTestId("wake-done").click();
  await expect(page.getByTestId("menu")).toBeVisible();

  // 当日のヒント（日替わりローテーション。未発見の発見があれば必ず一件選ばれる）
  const day1 = { ...baseGame(SEED), time: { day: 1, action: 0 } };
  const def = dailyDiscoveryHint(day1, DISCOVERIES);
  expect(def).not.toBeNull();
  const hint = hintTextOf(day1, def!);

  // 街の噂（メニュー下帯）：奇数日は発見ヒントが噂として載る
  await expect(page.getByTestId("menu")).toContainText(`噂 ―「${hint}」`);

  // 朝刊：この世界シードでは発見ヒントが続報・噂の欄に載る
  // （紙面は2本までの決定的な切り出し —— 載る並びのシードを選んである）
  await page.getByTestId("menu-news").click();
  const news = page.getByTestId("screen-news");
  await expect(news).toBeVisible();
  await expect(news).toContainText(hint);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-news-hint.png", fullPage: true });
});

test("発見：雨の日に足を止めると《雨宿りの井戸》を見つけ、見つけた旨が記録に残る（X-11）", async ({
  page,
}) => {
  // 雨が降る最初の日を core で調べる（天候は決定的）
  const rainDay = Array.from({ length: 90 }, (_, d) => d).find(
    (d) => weatherOf(SEED, d, WEATHER_CFG, TIME).kind.id === "rain",
  );
  expect(rainDay).toBeDefined();
  // 「雨の日に足を止めた（wait）」状態を仕込む。待つ行動はUIに無いので、
  // 行動ログ近似（within）に合わせて当日の wait を記録したセーブを注入する
  const g = baseGame(SEED);
  const save = serialize({
    ...g,
    time: { day: rainDay!, action: 0 },
    actionLog: [{ day: rainDay!, kind: "wait" }],
  });
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 何か行動する → step 末尾の発見判定で《雨宿りの井戸》が見つかる
  const rainWell = DISCOVERIES.find((d) => d.id === "rain_well")!;
  await page.getByTestId("menu-train").click();
  await page.getByTestId("skill-observation").click();
  await page.getByTestId("diff-0").click();

  // 発見は B ランクの一行として記録（会話窓の記録）に残る
  const log = page.getByTestId("log");
  await expect(log).toContainText(`《${rainWell.name}》`);
  await expect(log).toContainText(rainWell.foundText);
  // 発見の刻印（found.<id>）がセーブに立つ —— 二度と同じ発見は起きない
  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("trace.save.v1")?.includes("found.rain_well")),
    )
    .toBe(true);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-discovery.png", fullPage: true });
});

test("歳月：NPCの出来事が起床レポート・街の噂・朝刊・街の記録に映る（X-12）", async ({ page }) => {
  // npc_lifecycle.json：門番サドの祝言は 2年目・最初の季・8日目（= day 119）に起きる。
  // 前日（day 118）のセーブを注入し、実際に眠って発火させる（出来事は条件DSLで決定的）
  const sado = NPC_LIFE.find((n) => n.npcId === "npc.sado")!;
  const sadoDay = (() => {
    // at: { time: { year: {eq}, season, dayOfSeason: {eq} } } → 日番号に直す
    const at = sado.events[0]!.at as {
      time: { year: { eq: number }; season: number; dayOfSeason: { eq: number } };
    };
    return (
      at.time.year.eq * TIME.daysPerSeason * TIME.seasonsPerYear +
      at.time.season * TIME.daysPerSeason +
      at.time.dayOfSeason.eq
    );
  })();
  // 世界の記録（crisis.log）にも刻まれる形にするため、危機のある世界で始める
  const g = baseGame(SEED, CRISIS_CFG);
  const save = serialize({ ...g, time: { day: sadoDay - 1, action: 0 } });
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();

  const sadoText = sado.events[0]!.text.replaceAll("{name}", "サド");

  // 家で休む → 発火日の朝。起床レポートの「世界からの贈り物」欄に歳月の一行
  await page.getByTestId("menu-rest").click();
  const wake = page.getByTestId("screen-wake");
  await expect(wake).toBeVisible();
  await expect(wake).toContainText(sadoText);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-wake-npclife.png", fullPage: true });

  // 起きる → 街の噂（メニュー下帯）にもサドの祝言が回る（起きた日は必ず載る）
  await page.getByTestId("wake-done").click();
  await expect(page.getByTestId("menu")).toContainText(`噂 ―「${sadoText}」`);

  // 朝刊：街の人物の出来事は続報・噂の欄に必ず記事になる
  // （この世界シードでは紙面に載る並びになることを確認済み）
  await page.getByTestId("menu-news").click();
  const news = page.getByTestId("screen-news");
  await expect(news).toBeVisible();
  await expect(news).toContainText(sadoText);
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-news-npclife.png", fullPage: true });

  // 街の記録：「世界の出来事」欄に人生の印が刻まれる（{day}日目：――サド が祝言を挙げたという。）
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("menu")).toBeVisible();
  await page.getByTestId("menu-records").click();
  const records = page.getByTestId("records-crisis");
  await expect(records).toBeVisible();
  await expect(records).toContainText(`${sadoDay + 1}日目`);
  await expect(records).toContainText("サド が祝言を挙げた");
  await fade(page);
  await page.screenshot({ path: "e2e/artifacts/trace-x15-records-npclife.png", fullPage: true });

  // 発火の刻印（npc.done.<npc>.<index>）がセーブに残る —— 同じ出来事は二度起きない
  const saved = await page.evaluate(() => localStorage.getItem("trace.save.v1") ?? "");
  expect(saved).toContain(npcLifeDoneKey("npc.sado", 0));
});
