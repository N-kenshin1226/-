import { expect, type Page } from "@playwright/test";

/**
 * 初めての生（年代記に頁が無い）の冒頭に出る導入の会話窓を読み進める（F-06）。
 * 会話窓が出ていなければ何もしない ―― 年代記を仕込んだ世界でもそのまま使える。
 * Enter で2頁を読み進めると街のメニューへ着く
 */
export async function skipIntro(page: Page): Promise<void> {
  const intro = page.getByTestId("screen-intro");
  const shown = await intro
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("menu")).toBeVisible();
}

/**
 * F-02 の通知窓（A＝加護の窓 / S＝帯）が開いていたら畳む。
 * モーダルなので、開いたままだと背面の操作が効かない
 */
export async function dismissFx(page: Page): Promise<void> {
  for (const id of ["notice-a", "notice-s"]) {
    const el = page.getByTestId(id);
    while (await el.isVisible().catch(() => false)) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
    }
  }
}

/**
 * 移動・眠り・戦闘の幕（P-01）が消えるのを待つ。
 * 幕が掛かっている間は背面のコマンドへキー・クリックが届かないので、
 * 場所をまたぐ移動のあとには必ずこれを待ってから操作する
 */
export async function waitVeil(page: Page): Promise<void> {
  await expect(page.locator("[data-testid^='trv-']")).toHaveCount(0);
}

/**
 * 見取り図へ戻る（P-01）：場所の画面に居れば「戻る」で遡る。
 * 地域 → 門 → 見取り図 のように2段になることもあるので繰り返す。
 * 見取り図に居るとき・別の画面に居るときは何もしない
 */
export async function toMap(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (
      !(await page
        .getByTestId("place")
        .isVisible()
        .catch(() => false))
    )
      return;
    // Esc はコマンド列の「戻る」—— place-back を押すと幕とボタンの消え際が競合する
    await page.keyboard.press("Escape");
    await waitVeil(page);
  }
}

/**
 * 見取り図から場所へ行く（P-01）：街の場所の印を押す。
 * 場所の画面に居るときは先に見取り図へ戻る。
 * 場所の画面が開き、移動の幕が開ききるまで待つ
 */
export async function gotoPlace(page: Page, placeId: string): Promise<void> {
  await toMap(page);
  // 行動の合間に届いた出来事の会話窓が自動割り込みで掴んでいることがある ——
  // 「あとにする」で先送りにしてから見取り図を使う（Escでは戻らないので注意）
  for (let i = 0; i < 3; i++) {
    if (!(await page.getByTestId("screen-incident").isVisible().catch(() => false))) break;
    const defer = page.getByTestId("incident-defer");
    if (await defer.isVisible().catch(() => false)) await defer.click();
    else await page.getByTestId("incident-next").click();
  }
  await dismissFx(page);
  await page.getByTestId(`menu-place-${placeId}`).click();
  await expect(page.getByTestId("place")).toBeVisible();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", placeId);
  await waitVeil(page);
}

/** 場所の行動を選ぶ（見取り図 → 場所 → 行動の一段） */
export async function placeAct(page: Page, placeId: string, actionId: string): Promise<void> {
  await gotoPlace(page, placeId);
  await page.getByTestId(`place-${actionId}`).click();
}

/** 門から街の外へ出る（P-01。行動を消費する）。行き着く地域の画面が開くまで待つ */
export async function travelTo(page: Page, regionId: string): Promise<void> {
  await gotoPlace(page, "gate");
  await page.getByTestId(`place-go-${regionId}`).click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", regionId);
  await waitVeil(page);
}

/** 起床の窓が出たら、幕が開ききってから Enter で起きる（眠りの幕はキーを呑む） */
export async function wakeUp(page: Page): Promise<void> {
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await waitVeil(page);
  await page.keyboard.press("Enter");
}
