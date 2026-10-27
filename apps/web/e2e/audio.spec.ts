import { expect, test, type Page } from "@playwright/test";
import { gotoPlace, placeAct, skipIntro, travelTo, waitVeil } from "./helpers.js";

/**
 * S-01 音（BGM・環境音・効果音）：
 *   実音には依存しない —— 検査するのは「どの曲・環境音が選ばれているか」
 *   （window.__traceAudio のデバッグ窓口）と、設定の保存・互換だけ。
 *   sound=false は全系統のミュート（F-02互換）
 */

interface AudioState {
  ctx: string | null;
  music: string | null;
  ambient: string | null;
}

const audioState = (page: Page): Promise<AudioState> =>
  page.evaluate(() => (window as unknown as { __traceAudio: () => AudioState }).__traceAudio());

test("場面ごとにBGMが切り替わり、場所ごとに環境音が鳴る", async ({ page }) => {
  await page.goto("/?seed=e2e-audio-scene");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // 見取り図：街の時間帯曲（朝は town_morning 系）＋街のざわめき
  const atMap = await audioState(page);
  expect(atMap.music).toMatch(/^town_(morning|noon|evening|night)$/);
  expect(atMap.ambient).toBe("town");

  // 鍛冶場：個別の曲＋槌と火の音
  await gotoPlace(page, "forge");
  expect((await audioState(page)).music).toBe("forge");
  expect((await audioState(page)).ambient).toBe("forge");

  // 街の外（森）：森の曲＋鳥と風（時間帯で夜の森になることもある）
  await travelTo(page, "forest");
  expect((await audioState(page)).music).toBe("forest");
  expect((await audioState(page)).ambient).toMatch(/^forest(_night)?$/);

  // 酒場：酒場の曲＋ざわめき（門 → 見取り図 → 酒場）
  await gotoPlace(page, "gate");
  await page.getByTestId("place-back").click();
  await waitVeil(page);
  await gotoPlace(page, "tavern");
  expect((await audioState(page)).music).toBe("tavern");
  expect((await audioState(page)).ambient).toBe("tavern");

  // ステータス画面：画面名の曲が場所より先に効く
  await placeAct(page, "home", "status");
  await expect(page.getByTestId("screen-status")).toBeVisible();
  expect((await audioState(page)).music).toBe("status");
  // 自宅に居るので焚き火の音が続く
  expect((await audioState(page)).ambient).toBe("hearth");
});

test("音設定は3系統それぞれ保存され、再読み込み後も残る", async ({ page }) => {
  await page.goto("/?seed=e2e-audio-set");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await placeAct(page, "home", "settings");
  await expect(page.getByTestId("screen-settings")).toBeVisible();

  // 音量を一段下げる（切ると音量ボタンが使えなくなるので先に動かす）
  await page.getByTestId("set-music-vol-down").click();
  await page.getByTestId("set-sfx-down").click();
  // BGM を切る → 曲が止まる
  await page.getByTestId("set-music").click();
  expect((await audioState(page)).music).toBeNull();
  // 環境音を切る → 環境音が止まる
  await page.getByTestId("set-ambient").click();
  expect((await audioState(page)).ambient).toBeNull();

  const saved = await page.evaluate(() => localStorage.getItem("trace.fx.v1"));
  const parsed = JSON.parse(saved!) as {
    sound: boolean;
    sfxVolume: number;
    music: boolean;
    musicVolume: number;
    ambient: boolean;
  };
  expect(parsed.music).toBe(false);
  expect(parsed.ambient).toBe(false);
  expect(parsed.musicVolume).toBeLessThan(0.5);
  expect(parsed.sfxVolume).toBeLessThan(1);
  expect(parsed.sound).toBe(true);
  await page.screenshot({ path: "e2e/artifacts/trace-audio-settings.png", fullPage: true });

  // 再読み込み後も設定が残る（ミュートのまま。画面は見取り図から再開する）
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("menu")).toBeVisible();
  const after = await audioState(page);
  expect(after.music).toBeNull();
  expect(after.ambient).toBeNull();
  const reParsed = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("trace.fx.v1")))!,
  ) as { music: boolean; ambient: boolean };
  expect(reParsed.music).toBe(false);
  expect(reParsed.ambient).toBe(false);
});

test("sound=false（F-02互換の切り方）で全系統が無音でもゲームは進む", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace.fx.v1", JSON.stringify({ sound: false }));
  });
  await page.goto("/?seed=e2e-audio-off");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // 全系統ミュート —— 曲も環境音も選ばれない
  const off = await audioState(page);
  expect(off.music).toBeNull();
  expect(off.ambient).toBeNull();

  // 場所の移動も普通に動く（音なしで落ちない）
  await gotoPlace(page, "forge");
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "forge");
  const stillOff = await audioState(page);
  expect(stillOff.music).toBeNull();
  expect(stillOff.ambient).toBeNull();
});
