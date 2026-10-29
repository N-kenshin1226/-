import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  emptyCrisisFields,
  generateWorld,
  newGame,
  serialize,
  WORLD_RECIPE,
  type GameState,
} from "@trace/core";
import { dismissFx, gotoPlace, skipIntro, wakeUp, waitVeil } from "./helpers.js";

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

/**
 * 生成地方のセーブを組み立てる（seed → 世界を引き、始まりの町で始める）。
 * crisis を渡せばその危機状態を畳んだセーブになる（?crisis=sample と
 * 合わせて使う —— 公開サンプルの型表で typeId を引ける）
 */
function genSave(seed: string, crisis: GameState["crisis"] = null): string {
  const worldJson = jsonAt("world.json") as Parameters<typeof generateWorld>[1];
  const balanceJson = jsonAt("balance.json") as {
    world: Parameters<typeof generateWorld>[2];
    dungeons: Parameters<typeof generateWorld>[2]["dungeons"];
  };
  const challenge = Object.fromEntries(
    (jsonAt("enemies.json") as { enemies: { id: string; challenge: number }[] }).enemies.map(
      (e) => [e.id, e.challenge],
    ),
  );
  const w = generateWorld(
    seed,
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
  const g = newGame(seed, "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  return serialize({ ...g, crisis });
}

/**
 * 生成地方（G-01、docs/10_world_generation.md）の煙テスト。
 * 既定（?world= 無し）は生成地方 —— 町 id は t0 が始まりの町、
 * 町の基本の場所は <町>.<key>（t0.gate / t0.home / t0.square …）。
 * 外の地域の id・名・型はシードで決まるので、固定の id には頼らない
 */
test("生成地方で遊べる（町の場所・門から外の地域へ・散策）", async ({ page }) => {
  await page.goto("/?seed=e2e-gen");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 始まりの町の見取り図：どの町の型にも門・自室・広場・集会所は必ずある
  await expect(page.getByTestId("menu-place-t0.gate")).toBeVisible();
  await expect(page.getByTestId("menu-place-t0.home")).toBeVisible();
  await expect(page.getByTestId("menu-place-t0.square")).toBeVisible();
  await expect(page.getByTestId("menu-place-t0.guild")).toBeVisible();
  await page.waitForTimeout(400); // 画面遷移フェードの完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-gen-menu.png", fullPage: true });

  // 門から街の外へ：町には必ず1つ以上の地域が繋がっている
  await page.getByTestId("menu-place-t0.gate").click();
  await expect(page.getByTestId("place")).toBeVisible();
  await waitVeil(page);
  const out = page.locator("[data-testid^='place-go-']").first();
  await expect(out).toBeVisible();
  await out.click();
  await waitVeil(page);

  // 地域の画面：散策はどの型にもある行動（1行動消費）
  await expect(page.getByTestId("place-stroll")).toBeVisible();
  await page.getByTestId("place-stroll").click();
  await expect(page.getByTestId("log")).toContainText("――");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e/artifacts/trace-gen-area.png", fullPage: true });
});

test("生成地方はシードで変わる（同じシードは同じ町、別シードは別の町名）", async ({ page }) => {
  // シードAで始めて町名を取る
  await page.goto("/?seed=e2e-gen-a");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  const nameA = await page.getByTestId("place-name").innerText();

  // 同じシードで始め直すと同じ町名（生成は決定論的）
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?seed=e2e-gen-a");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await expect(page.getByTestId("place-name")).toHaveText(nameA);

  // 別シードなら別の町名（生成された世界はシードごとに変わる）
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?seed=e2e-gen-b");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  const nameB = await page.getByTestId("place-name").innerText();
  expect(nameB).not.toBe(nameA);
});

/**
 * 地方の地図と旅（G-02、docs/10 §7）の煙テスト。
 * seed=e2e-map の地方は決定的：t0 の隣町は t1/t2/t4/t6、霧の町は t3/t5、
 * t0↔t1 の道は街道2日・敵表に猪。1日目の散策は平穏、2日目の散策は
 * 猪が道を塞ぐ（遭遇の抽選はシードで決まる —— 変えたらこの枝を見直す）
 */
test("地方の地図から隣町へ旅ができる（霧・旅日数・道中の出来事・野営・遭遇・到着）", async ({
  page,
}) => {
  await page.goto("/?seed=e2e-map");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 門の「地方の地図を開く」→ 地方の見取り図（町・道・地域・凡例）
  await gotoPlace(page, "t0.gate");
  // 門の旅立ち行動も道の情報を出す —— 地図を見ずに門から出ても同じ結論（X-02）。
  // 通い方も地図と同じ選択肢が並ぶ（X-08。街道は徒歩・隊商・騎乗）
  const gateFoot = page.getByTestId("place-journey-t1-foot");
  await expect(gateFoot).toBeVisible();
  await expect(gateFoot).toContainText("2日の道のり");
  await expect(gateFoot).toContainText("徒歩");
  await expect(page.getByTestId("place-journey-t1-caravan")).toBeVisible();
  await expect(page.getByTestId("place-journey-t1-horse")).toBeVisible();
  await page.getByTestId("place-map").click();
  const map = page.getByTestId("screen-map");
  await expect(map).toBeVisible();
  await expect(map).toContainText("現在地");
  // 霧：訪れても聞いてもいない遠い町は「？」の輪郭だけ（t3/t5）
  await expect(map).toContainText("？");
  // 知れている隣町は印にも旅の列にも出る。道の距離＝旅日数が見える
  await expect(page.getByTestId("map-town-t1")).toBeVisible();
  const go = page.getByTestId("map-go-t1");
  await expect(go).toBeVisible();
  await expect(go).toContainText("2日の道のり");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e/artifacts/trace-gen-region-map.png", fullPage: true });

  // 行き先を選ぶ → 通い方を選ぶ（徒歩）→ 出発。出発の一行が記録に残る
  await go.click();
  const foot = page.getByTestId("map-way-foot");
  await expect(foot).toBeVisible();
  await foot.click();
  const journey = page.getByTestId("screen-journey");
  await expect(journey).toBeVisible();
  await expect(journey).toContainText("野営はあと2日で着く");
  const log = page.getByTestId("log");
  await expect(log).toContainText("への旅に出た");
  // 旅の途中は見取り図・場所にはいられない —— 地図を開こうにも街道の窓が出る
  await page.screenshot({ path: "e2e/artifacts/trace-gen-journey.png", fullPage: true });

  // 道中の出来事（1日目の街道の散策。この道・この日は遭遇にならない）
  await page.getByTestId("journey-stroll").click();
  await dismissFx(page);
  await expect(journey).toBeVisible(); // まだ街道に居る

  // 野営（rest）で日が進む → 起床 → まだ旅の途中（あと1日）
  await page.getByTestId("journey-camp").click();
  await wakeUp(page);
  await expect(journey).toBeVisible();
  await expect(journey).toContainText("野営はあと1日で着く");

  // 2日目の散策は道中の遭遇になる → 敵の気配の一行 → 戦いの場面へ
  await page.getByTestId("journey-stroll").click();
  await waitVeil(page);
  await expect(page.getByTestId("screen-combat")).toBeVisible();
  await expect(log).toContainText("敵の気配");
  await page.screenshot({ path: "e2e/artifacts/trace-gen-road-encounter.png", fullPage: true });
  // 戦いは避けて街道へ戻れる（旅は続く）
  await page.getByTestId("combat-giveup").click();
  await expect(journey).toBeVisible();

  // 野営 → 残り日数が尽きた朝に到着。着いた町の見取り図へ戻る
  await page.getByTestId("journey-camp").click();
  await wakeUp(page);
  await expect(page.getByTestId("menu")).toBeVisible();
  // 隣町 t1 に着いている（着いた町の場所が並ぶ）
  await expect(page.getByTestId("menu-place-t1.gate")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-gen-journey-arrived.png", fullPage: true });
});

/**
 * 危機の地図表現（W-01、docs/08）：閉ざされた道は破線＋✕、荒れた地域は
 * ⚔ の印＋「荒れている」で旅に出せない。生成地方では地域の"型"で照合する
 * （X-13。seed=e2e-map は森型の地域 forest.2 と街道だけの道を持つ）。
 * 型表は ?crisis=sample で公開サンプルに固定する
 */
const crisisOf = (typeId: string, stageIndex: number): GameState["crisis"] => ({
  typeId,
  stageIndex,
  seasonsInStage: 0,
  boundaries: 0,
  factions: [],
  hero: emptyCrisisFields(),
  finales: [],
  variables: {},
  npcGone: [],
  log: [{ day: 0, kind: "draw", ref: typeId }],
  outcome: "ongoing",
});

test("危機で荒れた地域が地図と旅欄に出る（⚔・立ち入れない）", async ({ page }) => {
  // 深層の鳴動・段階2（closeAreas:["forest"]）：森型の地域が荒れる
  const save = genSave("e2e-map", crisisOf("crisis.sample_deep", 2));
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/?crisis=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-map").click();
  const map = page.getByTestId("screen-map");
  await expect(map).toBeVisible();
  // 荒れた地域は旅欄で「荒れている」と出て選べない（⚔ は SVG の印）
  await expect(map).toContainText("⚔");
  const forest = page.getByTestId("map-travel-forest.2");
  await expect(forest).toBeVisible();
  await expect(forest).toContainText("荒れている");
  await expect(forest).toBeDisabled();
  // この危機では道は閉じていない（隣町へは出られる）
  await expect(page.getByTestId("map-go-t1")).toBeEnabled();
  await page.screenshot({ path: "e2e/artifacts/trace-gen-crisis-areas.png", fullPage: true });
});

/**
 * 季節の通行止め（G-02、docs/10 §7「閉ざされる道」）：山道は冬（季節3）に
 * 閉ざされる。seed=e2e-map は t2 から山道が2本出る（t3-t2・t5-t2）。
 * 冬の日（90日目＝季節3）に t2 に居るセーブを畳んで検証する
 */
test("冬は山道が閉ざされる（地図の✕と旅欄の通行止め）", async ({ page }) => {
  const save = genSave("e2e-map");
  const g = JSON.parse(save) as GameState;
  const winter: GameState = {
    ...g,
    time: { ...g.time, day: 90 }, // 季節3（冬）
    life: {
      ...g.life,
      town: "t2",
      map: { visited: ["t0", "t2"], heard: ["t0", "t2"] },
    },
  };
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), serialize(winter));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t2.gate");
  await page.getByTestId("place-map").click();
  const map = page.getByTestId("screen-map");
  await expect(map).toBeVisible();
  // 山道は破線＋✕。旅欄は「冬は通行止め」で選べない
  await expect(map).toContainText("✕");
  const go = page.getByTestId("map-go-t3");
  await expect(go).toContainText("冬は通行止め");
  await expect(go).toBeDisabled();
  // 街道（t2-t0）は冬でも通れる
  await expect(page.getByTestId("map-go-t0")).toBeEnabled();
  await page.screenshot({ path: "e2e/artifacts/trace-gen-winter-roads.png", fullPage: true });
});

test("危機で閉ざされた道が地図と旅欄に出る（破線＋✕・旅立てない）", async ({ page }) => {
  // 境の霧・段階2（closeRoads:["highway"]）：街道が全て閉ざされる
  const save = genSave("e2e-map", crisisOf("crisis.sample_mist", 2));
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/?crisis=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-map").click();
  const map = page.getByTestId("screen-map");
  await expect(map).toBeVisible();
  // 道は破線＋✕。旅欄は「危機で道は閉ざされている」で選べない
  await expect(map).toContainText("✕");
  const go = page.getByTestId("map-go-t1");
  await expect(go).toContainText("危機で道は閉ざされている");
  await expect(go).toBeDisabled();
  await page.screenshot({ path: "e2e/artifacts/trace-gen-crisis-roads.png", fullPage: true });
});
