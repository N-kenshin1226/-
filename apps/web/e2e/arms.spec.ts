import { expect, test } from "@playwright/test";
import { placeAct, skipIntro, travelTo, waitVeil } from "./helpers.js";

// K-01「技能の種類を増やす」：武器は種類ごとに技能・威力・間隔・補正が違い、
// 鍛冶場の武器店で買い・持ち替え、戦闘の中でも1行動を消費して持ち替えられる
test("武器店で短刀を買って構え、装備中の印と所持金が変わる（K-01）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e-arms");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 鍛冶場 → 武器を見る（立ち寄るだけなら行動は消費しない）
  await placeAct(page, "forge", "arms");
  const arms = page.getByTestId("screen-arms");
  await expect(arms).toBeVisible();
  // 初期の持ち物は素手と剣・構えは剣、所持金は 40G
  await expect(arms).toContainText("所持金 40G");
  await expect(arms).toContainText("装備：剣");
  await expect(page.getByTestId("arms-eq-sword")).toBeDisabled();

  // 短刀（30G）を買う → 所持に変わり所持金が減る
  await page.getByTestId("arms-buy-knife").click();
  await expect(arms).toContainText("所持金 10G");
  await expect(page.getByTestId("arms-use-knife")).toBeVisible();

  // 持ち替える → 装備中の印が短刀に移る
  await page.getByTestId("arms-use-knife").click();
  await expect(arms).toContainText("装備：短刀");
  await expect(page.getByTestId("arms-eq-knife")).toBeDisabled();
  // 剣は所持のまま選び直せる
  await expect(page.getByTestId("arms-use-sword")).toBeEnabled();
});

test("戦闘中に武器を持ち替えられる（1行動を消費・K-01）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e-switch");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 初期から素手と剣を持っているので、持ち替えの項目は最初から出る
  await travelTo(page, "forest");
  await page.getByTestId("place-hunt").click();
  await page.getByTestId("enemy-stray_dog").click();
  await waitVeil(page);

  // 「武器を持ち替える」→ 一覧から素手へ持ち替える（装備中は選べない）
  await expect(page.getByTestId("combat-weapons")).toContainText("武器：剣");
  await page.getByTestId("combat-weapons").click();
  await expect(page.getByTestId("combat-switch-sword")).toBeDisabled();
  await page.getByTestId("combat-switch-fist").click();

  // 持ち替えの1行が拍に刻まれ、次の選択肢の武器表示が素手に変わる
  await expect(page.getByTestId("combat-beat")).toContainText("《素手》に持ち替えた");
  await expect(page.getByTestId("combat-weapons")).toContainText("武器：素手");

  // そのまま戦い続けられる（持ち替え後も戦闘は続く）
  for (let i = 0; i < 20; i++) {
    if (
      await page
        .getByTestId("combat-finish")
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByTestId("combat-attack").click();
  }
  await expect(page.getByTestId("combat-finish")).toBeVisible();
});
