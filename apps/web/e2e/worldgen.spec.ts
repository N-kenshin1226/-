import { expect, test } from "@playwright/test";
import { skipIntro, waitVeil } from "./helpers.js";

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
