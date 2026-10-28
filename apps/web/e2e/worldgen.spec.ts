import { expect, test } from "@playwright/test";
import { dismissFx, gotoPlace, skipIntro, wakeUp, waitVeil } from "./helpers.js";

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
