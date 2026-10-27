import { expect, test } from "@playwright/test";
import { skipIntro } from "./helpers.js";

// T-47 ライバル・ランキング（簡易版）：街の記録に順位表が出る。
// ライバルの名は世界シードから決まるので、同じシードなら同じ顔ぶれになる
test("街の記録にライバル・ランキングが出る（自分の行に印が付く）", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await page.getByTestId("menu-records").click();

  const view = page.getByTestId("records-rivals");
  await expect(view).toContainText("街のランキング");
  // 1位から連番の行があり、名声の値が付く
  await expect(view).toContainText("1位");
  await expect(view).toContainText("名声");
  // 自分の行には「あなた」印が付く
  await expect(view).toContainText("（あなた）");
  // 二つ名は《》で包まれる
  await expect(view).toContainText("《");
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-rivals.png", fullPage: true });
});

test("同じシードでは同じ順位表が出る（決定論）", async ({ page }) => {
  const readRows = async () => {
    await page.goto("/?seed=e2e-rivals");
    await page.getByTestId("origin-wanderer").click();
    await skipIntro(page);
    await page.getByTestId("menu-records").click();
    return (await page.getByTestId("records-rivals").innerText())
      .split("\n")
      .filter((l) => l.includes("位"));
  };
  const first = await readRows();
  // セーブを消して同じシードで始め直すと、同じ順位表になる
  await page.evaluate(() => localStorage.clear());
  const second = await readRows();
  expect(second).toEqual(first);
});
