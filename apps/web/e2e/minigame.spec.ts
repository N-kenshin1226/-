import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { miningGame, newGame, serialize } from "@trace/core";
import type { BoardState, GameState } from "@trace/core";
import { placeAct } from "./helpers.js";

/**
 * F-03 ミニゲームの動き（docs/devin_tasks/F-03_minigame_motion.md）：
 *   鍛冶（タイミング系）… 動く拍レール・判定窓・命中の刻み・品質の積み上げ・結果の見せ場
 *   採掘（盤面系）      … マスを開ける手応え（鉱石が光る）・品質の積み上げ・結果の見せ場
 *   どちらも Space/Enter・クリックで操作でき、効果音は切って遊ぶ
 *   （trace.fx.v1 = {sound:false}。拍の判定窓は技能を上げたセーブで広げて確実に捉える）
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const miningCfg = (
  jsonAt("balance.json") as {
    minigame: { mining: Parameters<typeof miningGame>[0] };
  }
).minigame.mining;

/** 新規セーブを作り、patch で state を書き換えて serialize する */
const saveOf = (seed: string, patch: (g: GameState) => GameState): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  return serialize(patch(g));
};

/** セーブと演出設定（音なし）を仕込む addInitScript 用の関数 */
const putSave = (s: string) => {
  localStorage.setItem("trace.save.v1", s);
  localStorage.setItem("trace.fx.v1", JSON.stringify({ sound: false }));
};

/** ミニゲーム確定後：Enter で「納める/確定」へ進み、重なった通知の窓を畳んで街へ戻る */
async function commitAndSettle(page: Page): Promise<void> {
  await page.keyboard.press("Enter");
  for (let i = 0; i < 6; i++) {
    // 仕事を納めたあとは場所の画面（P-01）か見取り図に帰る
    if ((await page.getByTestId("place").count()) > 0) return;
    if ((await page.getByTestId("menu").count()) > 0) return;
    const n = page.locator('[data-testid="notice-a"], [data-testid="notice-s"]');
    if ((await n.count()) === 0) break;
    await n.first().click();
  }
}

test("鍛冶（タイミング系）：拍レールが動き、窓の内側で打てば命中が刻まれて結果が開く", async ({
  page,
}) => {
  // 判定窓を広げるため鍛冶の腕を上げた世界（±70ms → ±150ms 程度。押し所を確実に捉える）
  const save = saveOf("e2e-mg-smith", (g) => ({
    ...g,
    player: {
      ...g.player,
      skills: {
        ...g.player.skills,
        smithing: { ...g.player.skills["smithing"]!, value: 50, peak: 50 },
      },
    },
  }));
  await page.addInitScript(putSave, save);
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 仕事 → 釘の束 → 「自分でやる」でミニゲームへ（鍛冶の注文は鍛冶場に届く —— P-01）
  await placeAct(page, "forge", "work");
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-manual").click();
  await expect(page.getByTestId("minigame")).toBeVisible();

  // 何に合わせるかが見える：拍の流れるレール・判定窓・品質ゲージ
  const rail = page.getByTestId("mg-beat-rail");
  await expect(rail).toBeVisible();
  await expect(page.getByTestId("mg-window")).toBeVisible();
  await expect(page.getByTestId("mg-quality")).toBeVisible();
  await expect(rail).toContainText("◎");

  // 針が判定窓に入るまで待って Space で打つ ×5 —— すべて命中するはず
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="smithing-hit"]')?.getAttribute("data-armed") === "1",
      undefined,
      { timeout: 8000 },
    );
    await page.keyboard.press("Space");
    await expect.poll(() => page.locator(".mg-beat.hit").count()).toBe(i + 1);
  }

  // 結果の見せ場：品質が立ち上がり最終値（全命中で 100）へ届く
  const done = page.getByTestId("minigame-done");
  await expect(done).toBeVisible();
  await expect(done).toContainText("5/5 命中");
  await expect
    .poll(async () => Number(await page.getByTestId("mg-result-quality").innerText()), {
      timeout: 4000,
    })
    .toBe(100);
  await page.screenshot({ path: "e2e/artifacts/trace-mg-smithing.png", fullPage: true });

  // Enter で確定（最初のカーソルは「納める」側）。戻る画面には行かない
  await commitAndSettle(page);
  await expect(page.getByTestId("screen-workmode")).toBeHidden();
});

test("採掘（盤面系）：キーで選んで掘ると鉱石が光り、品質が積み上がって結果が開く", async ({
  page,
}) => {
  const g = newGame("e2e-mg-mine", "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  // 盤面は core が seed:kind:day:action から決める ―― 皮と同じ器をこちらで再現し、
  // 鉱石の座標を先読みして狙う（乱数ではなくシード由来の確定配置）
  const board = miningGame(miningCfg).init({
    skill: g.player.skills["mining"]?.value ?? 0,
    skills: Object.fromEntries(Object.entries(g.player.skills).map(([k, v]) => [k, v.value])),
    seed: `${g.seed}:mining:${g.time.day}:${g.time.action}`,
  }) as BoardState;
  const cellsOf = (kind: string) =>
    board.cells
      .map((c, i) =>
        c.kind === kind ? { x: i % board.width, y: Math.floor(i / board.width) } : null,
      )
      .filter((p): p is { x: number; y: number } => p !== null);
  const ores = cellsOf("ore");
  const rocks = cellsOf("rock");
  expect(ores.length).toBe(board.oresTotal);
  expect(rocks.length).toBeGreaterThan(0);

  await page.addInitScript(putSave, serialize(g));
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 鉱石の仕事はギルドの注文板に届く（P-01）
  await placeAct(page, "guild", "work");
  await page.getByTestId("order-order.ore_survey").click();
  await page.getByTestId("work-manual").click();
  await expect(page.getByTestId("minigame")).toBeVisible();
  await expect(page.getByTestId("mining-board")).toBeVisible();

  // 最初の鉱石はキーボードで掘る：カーソルは最初のマス（0,0）から動く
  const first = ores[0]!;
  for (let i = 0; i < first.y; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < first.x; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId(`cell-${first.x}-${first.y}`)).toHaveClass(/mg-focus/);
  await page.keyboard.press("Enter");
  // 開ける手応え：鉱石が光るクラスが付き、品質ゲージが積み上がる
  await expect(page.getByTestId(`cell-${first.x}-${first.y}`)).toContainText("◆");
  await expect
    .poll(async () => Number(await page.getByTestId("mg-quality").getAttribute("data-value")))
    .toBeGreaterThan(0);
  await page.screenshot({ path: "e2e/artifacts/trace-mg-mining.png", fullPage: true });

  // 残りの鉱石はクリックで掘る（Space/Enter とクリックの両方で遊べる）
  for (const o of ores.slice(1)) {
    await page.getByTestId(`cell-${o.x}-${o.y}`).click();
  }
  const done = page.getByTestId("minigame-done");
  await expect(done).toBeVisible();
  await expect(done).toContainText(`鉱石 ${board.oresTotal}/${board.oresTotal}`);
  await expect
    .poll(async () => Number(await page.getByTestId("mg-result-quality").innerText()), {
      timeout: 4000,
    })
    .toBeGreaterThan(0);

  // Enter で確定（最初のカーソルは「納める」側）
  await commitAndSettle(page);
  await expect(page.getByTestId("screen-workmode")).toBeHidden();
});
