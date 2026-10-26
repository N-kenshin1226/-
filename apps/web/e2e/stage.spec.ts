import { expect, test } from "@playwright/test";

// UI-01（README 決まりごと1）：1280×720 の固定キャンバスが、
// ウィンドウサイズに合わせて等倍で拡大縮小し、余白は黒帯になること。
const CASES = [
  { w: 1920, h: 1080, name: "1920" },
  { w: 1366, h: 768, name: "1366" },
  { w: 1024, h: 600, name: "1024" },
] as const;

for (const c of CASES) {
  test(`stage が ${c.w}x${c.h} で比率を保って縮退する`, async ({ page }) => {
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.goto("/?seed=e2e-stage");
    await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();

    const box = await page.locator(".stage").boundingBox();
    expect(box).not.toBeNull();
    const scale = Math.min(c.w / 1280, c.h / 720);
    // 表示サイズは 1280×720 × scale（±1px の丸め誤差を許す）
    expect(box!.width).toBeGreaterThanOrEqual(1280 * scale - 1.5);
    expect(box!.width).toBeLessThanOrEqual(1280 * scale + 1.5);
    expect(box!.height).toBeGreaterThanOrEqual(720 * scale - 1.5);
    expect(box!.height).toBeLessThanOrEqual(720 * scale + 1.5);
    // 中央配置・はみ出しなし（letterbox）
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(c.w + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(c.h + 1);

    await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
    await page.screenshot({ path: `e2e/artifacts/trace-stage-${c.name}.png` });
  });
}

test("小さいウィンドウでもメイン画面の全要素が収まる", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/?seed=e2e-stage");
  await page.getByTestId("origin-wanderer").click();
  await expect(page.getByTestId("menu")).toBeVisible();
  // 常設クロームと主要部品が viewport 内に見える
  for (const id of ["status", "menu-work", "menu-sleep"] as const) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1366 + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(768 + 1);
  }
});
