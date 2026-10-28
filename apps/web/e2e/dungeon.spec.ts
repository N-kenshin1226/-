import { expect, test, type Page } from "@playwright/test";
import { dismissFx, gotoPlace, skipIntro, waitVeil, wakeUp } from "./helpers.js";

/**
 * 有限迷宮（G-03、docs/10_world_generation.md §6）の e2e。
 * - 始まりの町の門から迷宮の場所へ出られる（dg0 は必ず始まりの町に置く）
 * - 迷宮の場所はダンジョンの情景（dungeon.<型>）で描かれる
 * - 「迷宮に潜る」で探索画面へ：部屋を抜き・引き上げて結果を畳む
 * - 野営で迷宮の中で眠り、翌日の潜りは行動を要さない
 */

const scene = (page: Page) => page.locator("svg.scene").first();

/** 生成地方で始めて、始まりの町の迷宮（dg0）の場所へ出る */
async function toDungeonPlace(page: Page, seed = "e2e-dgn") {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await dismissFx(page);
  await gotoPlace(page, "t0.gate");
  const to = page.getByTestId("place-go-dg0");
  await expect(to).toBeVisible();
  await to.click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await waitVeil(page);
}

test("門から迷宮へ出て、潜って引き上げられる", async ({ page }) => {
  await toDungeonPlace(page);
  // 迷宮の場所はダンジョンの情景（dungeon.<型>。型はシードで決まる）
  await expect(scene(page)).toHaveAttribute("data-scenery", /^dungeon\./);
  await expect(page.getByTestId("place-dungeon")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-place.png", fullPage: true });

  // 潜る：探索画面が開き、灯りと進行が見える
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();
  await expect(page.getByTestId("dungeon-advance")).toBeVisible();
  await expect(page.getByTestId("dungeon-camp")).toBeVisible();
  await expect(page.getByTestId("dungeon-retreat")).toBeVisible();

  // 1部屋抜く：戦闘なら逃げるか戦って畳み、罠・宝は即座に解決する。
  // 終端（dungeon-commit）が出るまで進行か離脱を続ける
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .getByTestId("dungeon-commit")
        .isVisible()
        .catch(() => false)
    )
      break;
    if (
      await page
        .getByTestId("combat-flee")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("combat-flee").click();
      continue;
    }
    if (
      await page
        .getByTestId("dungeon-advance")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("dungeon-advance").click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("dungeon-commit")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-dive.png", fullPage: true });
  await page.getByTestId("dungeon-commit").click();
  await waitVeil(page);
  // 場所の画面へ戻る（進行があれば「迷宮に潜る」に金の帯が残る）
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await expect(page.getByTestId("place-dungeon")).toBeVisible();
});

test("迷宮で野営すると迷宮の中で眠り、翌日の潜りは行動を要さない", async ({ page }) => {
  await toDungeonPlace(page, "e2e-dgn-camp");
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  // 野営：この潜りを閉じて迷宮の中で眠る
  await page.getByTestId("dungeon-camp").click();
  await page.getByTestId("dungeon-commit").click();
  // 起床の窓 → 起きると見取り図（野営の潜りは畳み済み）
  await wakeUp(page);
  await dismissFx(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // もう一度迷宮の場所へ（野営明けの潜りは行動を要さない —— その断りで出る）
  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-go-dg0").click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await waitVeil(page);
  const dive = page.getByTestId("place-dungeon");
  await expect(dive).toBeVisible();
  await expect(dive).toContainText("野営明け");
  await dive.click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-camp.png", fullPage: true });
});
