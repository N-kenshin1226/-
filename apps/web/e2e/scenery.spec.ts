import { expect, test, type Page } from "@playwright/test";
import { dismissFx, gotoPlace, skipIntro, toMap, travelTo, waitVeil } from "./helpers.js";

/**
 * 情景の部品（G-05、docs/10 §8）の e2e。
 * - ?scn= の確認用窓で全型（町9・地域17・ダンジョン8=深層+有限迷宮7）が描ける
 * - 生成地方の場所・地域・深層が型の情景（data-scenery）で描かれる
 * - legacy（?world=legacy）も scenery.legacy の当て方で型のレシピに写り、
 *   屋内は従来の部屋の情景（data-scene のみ）に倒れる
 * - 時間帯・天候は同じ語彙で重なる
 */

const scene = (page: Page) => page.locator("svg.scene").first();

/** 新規ゲームを生成地方で始めて見取り図まで進める */
async function startGen(page: Page, seed = "scenery-e2e") {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await dismissFx(page);
}

const SCENERY_KEYS = [
  "town.shukuba",
  "town.port",
  "town.mine",
  "town.castle",
  "town.farm",
  "town.academy",
  "town.fort",
  "town.holy",
  "town.hidden",
  "region.forest",
  "region.deep_forest",
  "region.hills",
  "region.mountain",
  "region.lake",
  "region.river",
  "region.coast",
  "region.marsh",
  "region.wasteland",
  "region.snowfield",
  "region.volcano",
  "region.battlefield",
  "region.dead_village",
  "region.ruins_field",
  "region.farm",
  "region.abyss",
  "region.road",
  "dungeon.abyss",
  "dungeon.cave",
  "dungeon.mine",
  "dungeon.crypt",
  "dungeon.nest",
  "dungeon.ruins",
  "dungeon.tower",
  "dungeon.sunken",
];

test("情景の全型が ?scn= で描ける（町9・地域17・ダンジョン8）", async ({ page }) => {
  for (const key of SCENERY_KEYS) {
    await page.goto(`/?scn=${key}&tod=evening&weather=clear&seed=e2e`);
    await expect(scene(page)).toHaveAttribute("data-scenery", key);
    // 空っぽでないことの代替：形が1つ以上描かれている
    await expect(
      scene(page).locator("path,rect,circle,ellipse,polygon,line").first(),
    ).toBeAttached();
    await page.screenshot({ path: `e2e/artifacts/scenery-${key}.png` });
  }
});

test("情景の一覧（?scn=all）が全型を並べる", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?scn=all&tod=evening&weather=clear&seed=e2e");
  await expect(page.locator("svg.scene")).toHaveCount(SCENERY_KEYS.length);
  await page.screenshot({ path: "e2e/artifacts/scenery-gallery.png", fullPage: true });
});

test("情景は時間帯・天候で変わる", async ({ page }) => {
  await page.goto("/?scn=town.port&tod=night&weather=rain&seed=e2e");
  await expect(scene(page)).toHaveAttribute("data-tod", "night");
  await expect(scene(page)).toHaveAttribute("data-weather", "rain");
  await expect(page.getByTestId("wx-rain")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/scenery-town.port-night-rain.png" });

  await page.goto("/?scn=region.snowfield&tod=noon&weather=snow&seed=e2e");
  await expect(page.getByTestId("wx-snow")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/scenery-snowfield-noon-snow.png" });
});

test("同じ seed では同じ情景になり、別 seed では配置が変わる", async ({ page }) => {
  await page.goto("/?scn=town.shukuba&tod=morning&seed=alpha");
  const a = await scene(page).innerHTML();
  await page.goto("/?scn=town.shukuba&tod=morning&seed=alpha");
  expect(await scene(page).innerHTML()).toBe(a);
  await page.goto("/?scn=town.shukuba&tod=morning&seed=beta");
  expect(await scene(page).innerHTML()).not.toBe(a);
});

test("生成地方：見取り図・町の場所・地域が型の情景で描かれる", async ({ page }) => {
  await startGen(page);
  // 見取り図は町の型の情景
  const menuScenery = await scene(page).getAttribute("data-scenery");
  expect(menuScenery).toMatch(/^town\./);
  await page.screenshot({ path: "e2e/artifacts/scenery-gen-menu.png" });

  // 町の場所（門）は型のレシピ＋場所の差分
  await gotoPlace(page, "t0.gate");
  const gateScenery = await scene(page).getAttribute("data-scenery");
  expect(gateScenery).toMatch(/^town\..+#gate$/);
  await page.screenshot({ path: "e2e/artifacts/scenery-gen-gate.png" });

  // 門から地域へ（生成地方の地域は型の情景）
  const target = page.locator("[data-testid^='place-go-']").first();
  const regionId = (await target.getAttribute("data-testid"))!.replace("place-go-", "");
  await target.click();
  await waitVeil(page);
  await expect(scene(page)).toHaveAttribute("data-scenery", /^region\./);
  await page.screenshot({ path: `e2e/artifacts/scenery-gen-region-${regionId}.png` });
});

test("生成地方：同じ世界 seed では同じ情景が再現される", async ({ page }) => {
  await startGen(page, "scenery-replay");
  const first = await scene(page).innerHTML();
  await page.reload();
  // セーブは localStorage に残る —— 同じ世界なら同じ情景
  await dismissFx(page);
  const second = await scene(page).innerHTML();
  expect(second).toBe(first);
});

test("legacy：アルディは宿場街・地域は型の情景、屋内は部屋の情景", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await dismissFx(page);

  await expect(scene(page)).toHaveAttribute("data-scenery", "town.shukuba");
  await page.screenshot({ path: "e2e/artifacts/scenery-legacy-menu.png" });

  await gotoPlace(page, "market");
  await expect(scene(page)).toHaveAttribute("data-scenery", "town.shukuba#market");
  await page.screenshot({ path: "e2e/artifacts/scenery-legacy-market.png" });

  // 屋内（鍛冶場）は情景を引かず部屋の情景に倒れる
  await gotoPlace(page, "forge");
  await expect(scene(page)).toHaveAttribute("data-scene", "forge");
  expect(await scene(page).getAttribute("data-scenery")).toBeNull();
  await page.screenshot({ path: "e2e/artifacts/scenery-legacy-forge.png" });

  // 地域（森）は地域の型の情景
  await travelTo(page, "forest");
  await expect(scene(page)).toHaveAttribute("data-scenery", "region.forest");
  await page.screenshot({ path: "e2e/artifacts/scenery-legacy-forest.png" });
  await toMap(page);
});

test("深層：灯りが減るほど霞が深くなる（X-36）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await dismissFx(page);

  // 深層の穴へ潜る（街の外 → 穴 → 潜るボタン）
  await travelTo(page, "abyss");
  await page.getByTestId("place-abyss").click();
  await expect(page.getByTestId("screen-abyss")).toBeVisible();
  await page.getByTestId("abyss-dive").click();
  // 降りている画面は深層の型の情景（X-24 の迷宮と同じ器）
  const bg = page.locator("svg[data-scenery='dungeon.abyss']");
  await expect(bg).toBeAttached();

  // 灯りは1手ごとに減る —— 潜った時点の霞（世界の危機分）を基線に、
  // 戦闘の1手で灯りの分だけ霞が立ち始める
  const haze = async () => Number((await bg.getAttribute("data-haze")) ?? "0");
  const base = await haze();
  await page.getByTestId("combat-attack").click();
  await expect.poll(haze).toBeGreaterThan(base);
  const early = await haze();

  // 灯りを使うほど霞は深くなる —— 層を抜くか次の層へ潜るたびに深く
  for (let i = 0; i < 20; i++) {
    if ((await haze()) > early) break;
    if (
      await page
        .getByTestId("abyss-commit")
        .isVisible()
        .catch(() => false)
    )
      break;
    if (
      await page
        .getByTestId("abyss-dive")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("abyss-dive").click();
      continue;
    }
    if (
      await page
        .getByTestId("combat-attack")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("combat-attack").click();
      continue;
    }
    break;
  }
  const late = await haze();
  expect(late, "灯りを使うほど霞は深くなる").toBeGreaterThan(early);
  await page.screenshot({ path: "e2e/artifacts/scenery-abyss-haze.png", fullPage: true });

  // 引き返してランを閉じると合図は下りる（霞は世界の分だけに戻る）
  if (
    await page
      .getByTestId("abyss-retreat")
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByTestId("abyss-retreat").click();
    await expect.poll(haze).toBe(base);
  }
});

test("情景の窓は375px幅でも崩れない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/?scn=town.port&tod=evening&weather=clear&seed=e2e");
  await expect(scene(page)).toHaveAttribute("data-scenery", "town.port");
  await page.screenshot({ path: "e2e/artifacts/scenery-mobile-375.png" });
});
