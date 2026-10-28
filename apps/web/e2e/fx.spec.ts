import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { placeAct, skipIntro, waitVeil } from "./helpers.js";
import { newGame, serialize } from "@trace/core";
import type { GameState } from "@trace/core";

/**
 * F-02 演出層（docs/devin_tasks/F-02_juice.md）：
 *   B … 右上に滑り込み数秒で消える札（クリックでも畳める）
 *   A … 加護の層（銀青）の光る窓＋短い音。開いている間キーは背面へ漏れない
 *   S … 画面を暗くする中央の帯。1日1回まで（超過分は囁きの札）
 *   起床ログ … 数値のカウントアップ（reduced-motion では即時に最終値）
 *   設定 … 効果音オン/オフ・音量・「演出を短く」。localStorage に残る
 */

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);

/** 新規セーブを作り、patch で state を書き換えてから serialize する */
const saveOf = (seed: string, patch: (g: GameState) => GameState): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  return serialize(patch(g));
};

/** localStorage にセーブを仕込む addInitScript 用の関数 */
const putSave = (s: string) => {
  localStorage.setItem("trace.save.v1", s);
};

test("B通知は右上の札で届く：報酬・納品・称号が重なり、クリックか寿命で消える", async ({
  page,
}) => {
  await page.goto("/?world=legacy&seed=e2e-fx-b");
  await page.getByTestId("origin-wanderer").click();
  // F-06 の導入の会話窓が出たら読み進めてメニューへ（この種は年代記が空のため出る）
  await skipIntro(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // 最初の仕事：初仕事の称号（B）＋納品＋報酬がまとめて届く。
  // この種では初回の作品が自己ベスト（ティア）を更新しAの窓も重なる
  // ―― モーダルの窓が開いている間、札のクリックは窓に届かない（覆いは正しい）
  // 鍛冶の注文は鍛冶場に届く（P-01：仕事は場所に属する）
  await placeAct(page, "forge", "work");
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();

  const notice = page.getByTestId("notice-a");
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(notice).toBeHidden();

  const tags = page.getByTestId("fx-tag");
  await expect(tags.first()).toBeVisible();
  // 報酬は銅貨の色調、初仕事の称号は金の札
  await expect(page.locator('[data-testid="fx-tag"][data-tone="coin"]')).toContainText("報酬");
  await expect(page.locator('[data-testid="fx-tag"][data-tone="title"]')).toContainText("初仕事");
  await page.screenshot({ path: "e2e/artifacts/trace-fx-tags.png", fullPage: true });

  // クリックで畳める（残りは寿命で消える）
  const before = await tags.count();
  await tags.first().click();
  await expect.poll(() => page.getByTestId("fx-tag").count()).toBe(before - 1);
  await expect.poll(() => page.getByTestId("fx-tag").count(), { timeout: 6000 }).toBe(0);
});

test("A通知は加護の層（銀青）の光る窓で届く。開いている間キーは背面へ漏れない", async ({
  page,
}) => {
  // 鍛錬の徒（A）：action.train 200 ＋ 剣術40 を満たした世界。次の一歩で届く
  const save = saveOf("e2e-fx-a", (g) => ({
    ...g,
    counters: { ...g.counters, "action.train": 200 },
    player: {
      ...g.player,
      skills: {
        ...g.player.skills,
        swordplay: { ...g.player.skills["swordplay"]!, value: 40, peak: 40 },
      },
    },
  }));
  await page.addInitScript(putSave, save);
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  await placeAct(page, "home", "rest");
  await waitVeil(page); // 眠りの幕が開ききるまで待つ（幕はキーを呑む）
  const notice = page.getByTestId("notice-a");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("NEW TITLE");
  await expect(notice).toContainText("鍛錬の徒");
  await page.screenshot({ path: "e2e/artifacts/trace-fx-notice-a.png", fullPage: true });

  // モーダルの間は背面の窓へキーが漏れない（Nを押しても新聞は開かない）
  await page.keyboard.press("n");
  await expect(notice).toBeVisible();
  // Enter で飛ばす（スキップ）。起床の窓はまだ残る
  await page.keyboard.press("Enter");
  await expect(notice).toBeHidden();
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await expect(page.getByTestId("screen-news")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("S通知は世界の暗い帯で届く。同日に重なったSは囁きの札になる（1日1回）", async ({ page }) => {
  // 剣の理を見た者（S）＋剣聖（S。頂点到達旗）を同時に満たす世界。
  // core のS予算が後者を suppressed にする ―― 札としてだけ届く
  const save = saveOf("e2e-fx-s", (g) => ({
    ...g,
    flags: { ...g.flags, "pinnacle.sword_saint.apex": true },
    player: {
      ...g.player,
      skills: {
        ...g.player.skills,
        swordplay: { ...g.player.skills["swordplay"]!, value: 50, peak: 50 },
      },
    },
  }));
  await page.addInitScript(putSave, save);
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  await placeAct(page, "home", "rest");
  await waitVeil(page);
  const notice = page.getByTestId("notice-s");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("剣の理を見た者");
  // もう1つのS称号は刻印予算を超えたため、銀青の囁きの札としてだけ残る
  await expect(page.locator('[data-testid="fx-tag"][data-tone="whisper"]')).toContainText("剣聖");
  await page.screenshot({ path: "e2e/artifacts/trace-fx-notice-s.png", fullPage: true });

  // クリックで飛ばす → 起床の窓が残る
  await notice.click();
  await expect(notice).toBeHidden();
  await expect(page.getByTestId("screen-wake")).toBeVisible();
});

test("起床ログの数値はカウントアップで動き、reduced-motion では即座に最終値になる", async ({
  page,
}) => {
  // 未定着経験を積んだ世界：眠ると技能が定着し、起床ログの行が出る
  const save = saveOf("e2e-fx-wake", (g) => ({
    ...g,
    player: {
      ...g.player,
      skills: {
        ...g.player.skills,
        smithing: { ...g.player.skills["smithing"]!, value: 12, peak: 12, pending: 5 },
      },
    },
  }));
  await page.addInitScript(putSave, save);
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();
  await placeAct(page, "home", "rest");
  await waitVeil(page);

  await expect(page.getByTestId("screen-wake")).toBeVisible();
  const num = page.locator('[data-testid^="wake-skill-"]').first();
  await expect(num).toBeVisible();
  // 数値は最終値へ向かって動き、やがて from+5 より大きい値へ届く
  await expect
    .poll(async () => Number(await num.getAttribute("data-value")), { timeout: 3000 })
    .toBeGreaterThan(12);
  await page.screenshot({ path: "e2e/artifacts/trace-fx-wake.png", fullPage: true });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
});

test("reduced-motion の環境では数値は最初から最終値を示す", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const save = saveOf("e2e-fx-wake-rm", (g) => ({
    ...g,
    player: {
      ...g.player,
      skills: {
        ...g.player.skills,
        smithing: { ...g.player.skills["smithing"]!, value: 12, peak: 12, pending: 5 },
      },
    },
  }));
  await page.addInitScript(putSave, save);
  await page.goto("/?world=legacy");
  await placeAct(page, "home", "rest");
  await waitVeil(page);
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  const num = page.locator('[data-testid^="wake-skill-"]').first();
  await expect(num).toBeVisible();
  // アニメーションなし ―― 表示開始時点でもう最終値（12 + 定着分）を指している
  const v = Number(await num.getAttribute("data-value"));
  expect(v).toBeGreaterThan(12);
});

test("環境設定：効果音のオン/オフと演出の長さを整え、端末に記録される", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e-fx-set");
  await page.getByTestId("origin-wanderer").click();
  // F-06 の導入の会話窓が出たら読み進めてメニューへ
  await skipIntro(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  await placeAct(page, "home", "settings");
  const scr = page.getByTestId("screen-settings");
  await expect(scr).toBeVisible();

  // 効果音を切る → 保存される
  await expect(page.getByTestId("set-sound")).toContainText("鳴らす");
  await page.getByTestId("set-sound").click();
  await expect(page.getByTestId("set-sound")).toContainText("鳴らさない");
  // 「演出を短く」を入れる
  await page.getByTestId("set-short").click();
  await expect(page.getByTestId("set-short")).toContainText("短い");
  await page.screenshot({ path: "e2e/artifacts/trace-fx-settings.png", fullPage: true });

  const saved = await page.evaluate(() => localStorage.getItem("trace.fx.v1"));
  expect(saved).not.toBeNull();
  const parsed = JSON.parse(saved!) as { sound: boolean; shortFx: boolean };
  expect(parsed.sound).toBe(false);
  expect(parsed.shortFx).toBe(true);

  await page.keyboard.press("Escape");
  // P-01：環境設定は自宅に属する —— Esc で自宅へ、もう一度で見取り図へ
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "home");
  await page.keyboard.press("Escape");
  await waitVeil(page);
  await expect(page.getByTestId("menu")).toBeVisible();
});
