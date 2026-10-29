import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  emptyCrisisFields,
  generateWorld,
  newGame,
  occasionPending,
  serialize,
  WORLD_RECIPE,
  type GameState,
  type OccasionsConfig,
} from "@trace/core";
import { dismissFx, gotoPlace, skipIntro, wakeUp, waitVeil } from "./helpers.js";

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

/**
 * 生成地方のセーブを組み立てる（seed → 世界を引き、始まりの町で始める）。
 * crisis を渡せばその危機状態を畳んだセーブになる（?crisis=sample と
 * 合わせて使う —— 公開サンプルの型表で typeId を引ける）
 */
function genWorldFor(seed: string) {
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
  return generateWorld(
    seed,
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
}

function genSave(seed: string, crisis: GameState["crisis"] = null, day = 0, town?: string): string {
  const w = genWorldFor(seed);
  const g = newGame(seed, "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  return serialize({
    ...g,
    crisis,
    time: { ...g.time, day },
    life: town === undefined ? g.life : { ...g.life, town },
  });
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
 * 生成町の師匠（X-16）：師匠は住人の居場所で訪ねる。mentor 行動が無い
 * 場所の師匠（9/13）は到達不能だった —— e2e-map の始まりの町は農村で、
 * 畑の番人（fieldmaster@fields）がその一人
 */
test("生成町の師匠は居場所で訪ねられる", async ({ page }) => {
  const save = genSave("e2e-map");
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.fields");
  const mentor = page.getByTestId("place-mentor");
  await expect(mentor).toBeVisible();
  await mentor.click();
  const screen = page.getByTestId("screen-mentor");
  await expect(screen).toBeVisible();
  // 師匠がいる場所では「いない」見出しを出さず、技能はIDでなく名で示す
  await expect(screen).not.toContainText("師匠はいない");
  await expect(screen).toContainText("《農耕》");
  await page.screenshot({ path: "e2e/artifacts/trace-gen-mentor.png", fullPage: true });
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

/**
 * 既定の新規フロー（?world= 無し＝生成地方）：出自を選ぶと生成町の
 * イントロ（生成町名入りのようこそ・生成住人の宿屋の主）を経て
 * 初日のメニューに届く。セーブ注入を使わない実経路の回帰
 */
test("既定の新規開始は生成世界 —— イントロに町名が出て初日まで届く", async ({ page }) => {
  await page.goto("/?seed=e2e-map");
  await page.getByTestId("origin-wanderer").click();
  const intro = page.getByTestId("screen-intro");
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("ようこそ");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
  // 生成町の場所は <町>.<key>（t0 が始まりの町）
  await expect(page.getByTestId("menu-place-t0.gate")).toBeVisible();
  await expect(page.getByTestId("menu-place-t0.guild")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-gen-firstday.png", fullPage: true });
});

/**
 * 終幕（X-19）：生成地方では canon の人物は居ない —— 段階の離散・死亡は
 * 「この世界に居る人」だけに記録される。終幕の語り・年代記の頁に
 * 会ったことのない人物の名が出ないこと
 */
test("生成地方の終幕に canon の人物名は出ない", async ({ page }) => {
  // 霧の型（deep 段に npc.sado の離散）を抽選で引いた世界を組み立て、
  // 拡大段・最終決着の1変わり目前（季節の最終日）に畳む
  const mist = (jsonAt("crises/sample.json") as { crises: { id: string }[] }).crises.filter(
    (c) => c.id === "crisis.sample_mist",
  );
  const worldJson = jsonAt("world.json") as Parameters<typeof generateWorld>[1];
  const balanceJson = jsonAt("balance.json") as {
    world: Parameters<typeof generateWorld>[2];
    dungeons: Parameters<typeof generateWorld>[2]["dungeons"];
    crisis: { strongFields: number; weakFieldFactor: number };
    time: { daysPerSeason: number };
  };
  const challenge = Object.fromEntries(
    (jsonAt("enemies.json") as { enemies: { id: string; challenge: number }[] }).enemies.map(
      (e) => [e.id, e.challenge],
    ),
  );
  const w = generateWorld(
    "e2e-map",
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
  const g = newGame("e2e-map", "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialMoney: 100,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
    crisis: {
      types: mist as never,
      strongFields: balanceJson.crisis.strongFields,
      weakFieldFactor: balanceJson.crisis.weakFieldFactor,
    },
  });
  const crisis = g.crisis!;
  const save = serialize({
    ...g,
    time: { ...g.time, day: balanceJson.time.daysPerSeason - 1, action: 0 },
    crisis: {
      ...crisis,
      stageIndex: 1,
      seasonsInStage: 0,
      boundaries: 3,
      finales: crisis.finales.map((f) => ({ ...f, resolved: false })),
    },
  });
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/?crisis=sample");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  // 家で眠ると季節の変わり目 —— 段階が深刻へ進み、両方の決着が判定されて終幕へ
  await gotoPlace(page, "t0.home");
  await page.getByTestId("place-rest").click();
  await waitVeil(page);
  await expect(page.getByTestId("notice-s")).toBeVisible();
  await page.getByTestId("notice-s").click();
  const ending = page.getByTestId("screen-ending");
  await expect(ending).toBeVisible();
  // 離散したはずの canon 人物「サド」はこの世界に居ない —— 語りにも頁にも名が出ない
  await expect(ending).not.toContainText("サド");
  await page.screenshot({ path: "e2e/artifacts/trace-gen-ending.png", fullPage: true });
});

/**
 * NPCの歳月（X-20）：生成地方に canon の人物は居ない —— 暦条件を
 * 満たす日が来ても居ない人の出来事は発火しない（通知・年代記に名が出ない）
 */
test("生成地方では canon の人物の歳月は動かない", async ({ page }) => {
  // npc.sado は2年目（year index 1）の春7日目＝通算119日目に祝言を挙げる定義。
  // 118日目のセーブから眠るとその日をまたぐ —— 生成地方にサドは居ない
  await page.addInitScript(
    (s) => localStorage.setItem("trace.save.v1", s),
    genSave("e2e-map", null, 118),
  );
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);
  await gotoPlace(page, "t0.home");
  await page.getByTestId("place-rest").click();
  await waitVeil(page);
  await expect(page.locator("body")).not.toContainText("サド");
});

/**
 * 行事の代打（X-21）：canon の持ちかけ人が居ない生成地方では、役割の近い
 * この世界の住人が代わりに持ちかける（話者行に生成の住人の名が出る）
 */
test("生成地方の行事はこの世界の住人が持ちかける", async ({ page }) => {
  const worldJson = jsonAt("world.json") as Parameters<typeof generateWorld>[1];
  const balanceJson = jsonAt("balance.json") as {
    world: Parameters<typeof generateWorld>[2];
    dungeons: Parameters<typeof generateWorld>[2]["dungeons"];
    occasions: Omit<OccasionsConfig, "occasions" | "npcs" | "rivals" | "speakerSubstitute">;
    rivals: { size: number; scoreMin: number; scoreMax: number; growthPerDay: number };
    time: Parameters<typeof occasionPending>[2];
  };
  const occasionsJson = jsonAt("occasions.json") as { occasions: OccasionsConfig["occasions"] };
  const rivalsJson = jsonAt("rivals.json") as {
    names: string[];
    epithets: string[];
  };
  const challenge = Object.fromEntries(
    (jsonAt("enemies.json") as { enemies: { id: string; challenge: number }[] }).enemies.map(
      (e) => [e.id, e.challenge],
    ),
  );
  const w = generateWorld(
    "e2e-map",
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
  const g = newGame("e2e-map", "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  // ブラウザ側と同じ行事の設定（名簿はこの世界の住人 —— cfgFor と同じ配線）
  const occCfg: OccasionsConfig = {
    occasions: occasionsJson.occasions,
    ...balanceJson.occasions,
    npcs: w.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role })),
    rivals: { names: rivalsJson.names, epithets: rivalsJson.epithets, ...balanceJson.rivals },
  };
  // 住人が持ちかける行事が届く最初の日を探す（日付＋世界シードの決定的な抽選）
  let day = -1;
  for (let d = 0; d < 120 && day < 0; d++) {
    const s = { ...g, time: { ...g.time, day: d } };
    const def = occasionPending(s, occCfg, balanceJson.time).find((o) => o.speaker.kind === "npc");
    if (def !== undefined) day = d;
  }
  expect(day).toBeGreaterThanOrEqual(0);

  await page.addInitScript(
    (s) => localStorage.setItem("trace.save.v1", s),
    serialize({ ...g, time: { ...g.time, day } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);
  // その日の行動で打診が届く —— 話者行にはこの世界の住人の名が出る
  await gotoPlace(page, "t0.square");
  await page.getByTestId("place-stroll").click();
  await waitVeil(page);
  const body = await page.locator("body").innerText();
  const speaker = /(\S+)――「/.exec(body)?.[1];
  const names = new Set(w.npcs.map((n) => n.name));
  expect(speaker !== undefined && names.has(speaker)).toBe(true);
});

/**
 * 生成住人の歳月（X-22）：生成の住人にも一生の節目が来る —— 世界シードで
 * 決まった日に、結婚・引退・旅立ち・死去・抜擢の記事文が届く
 */
test("生成地方の住人にも歳月が来る", async ({ page }) => {
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
    "e2e-map",
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
  const g = newGame("e2e-map", "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  // この世界で最初に来る節目の前日に畳む
  const ev = [...w.npcLife].sort((a, b) => a.day - b.day)[0]!;
  expect(ev).toBeDefined();
  await page.addInitScript(
    (s) => localStorage.setItem("trace.save.v1", s),
    serialize({ ...g, time: { ...g.time, day: ev.day - 1 } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);
  await gotoPlace(page, "t0.home");
  await page.getByTestId("place-rest").click();
  await waitVeil(page);
  // 起きると節目の日 —— 生成の住人の記事文が届く
  await expect(page.locator("body")).toContainText(ev.text);
});

/**
 * 釣りの注文名は水域で出る（X-23）：町の港は「海の釣り」、川の地域は「川の釣り」。
 * 港と川が揃うシードを先に探す（生成はシード由来 —— 決定的）
 */
const WATER_SEEDS = ["e2e-map", "e2e-gen", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"];
function waterSeed() {
  for (const s of WATER_SEEDS) {
    const w = genWorldFor(s);
    const harbor = w.places.find((p) => p.id.endsWith(".harbor"));
    const river = w.areas.find((a) => a.typeId === "river");
    if (harbor && river) return { seed: s, harbor, river };
  }
  throw new Error("港と川の揃うシードが見つからない");
}

test("港の釣りは「海の釣り」と出る", async ({ page }) => {
  const { seed, harbor } = waterSeed();
  const town = harbor.id.split(".")[0]!;
  const save = genSave(seed, null, 0, town);
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, harbor.id);
  await page.getByTestId("place-fish").click();
  const mode = page.getByTestId("screen-workmode");
  await expect(mode).toBeVisible();
  await expect(mode).toContainText("海の釣り");
  await expect(mode).not.toContainText("湖の釣り");
  await page.screenshot({ path: "e2e/artifacts/trace-gen-fish-sea.png", fullPage: true });
});

test("川の釣りは「川の釣り」と出る", async ({ page }) => {
  const { seed, river } = waterSeed();
  const g = JSON.parse(genSave(seed, null, 0, river.town)) as GameState;
  // 地域の名は「訪れた町に属する場所」で知れる —— その町を訪問済みにする
  const moved: GameState = {
    ...g,
    life: {
      ...g.life,
      map: { visited: [...g.life.map.visited, river.town], heard: [...g.life.map.heard] },
    },
  };
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), serialize(moved));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, `${river.town}.gate`);
  await page.getByTestId("place-map").click();
  await page.getByTestId(`map-travel-${river.id}`).click();
  await page.getByTestId("place-fish").click();
  const mode = page.getByTestId("screen-workmode");
  await expect(mode).toBeVisible();
  await expect(mode).toContainText("川の釣り");
  await page.screenshot({ path: "e2e/artifacts/trace-gen-fish-river.png", fullPage: true });
});
