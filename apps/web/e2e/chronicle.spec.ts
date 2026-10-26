import { expect, test } from "@playwright/test";

// T-38 年代記：別領域の保存が開始画面と街の記録に出る
test("年代記が開始画面と街の記録に出る", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "trace.chronicle.v1",
      JSON.stringify({
        version: 1,
        lives: [
          {
            name: "古の英雄",
            epithet: "title.hundred_wolves",
            daysLived: 42,
            titles: ["title.hundred_wolves"],
            standing: "citizen",
            profession: "smith",
            achievedGoals: [],
            notableWorks: [{ kind: "smithing", quality: 80, tier: 3, order: "order.nail" }],
            cause: "death",
            worldSeed: "old-world",
          },
        ],
      }),
    );
  });
  await page.goto("/?seed=e2e");
  // セーブが無くても年代記の件数が開始画面に出る
  await expect(page.getByTestId("app")).toContainText("年代記には 1 人の人生が記録されている");
  await page.getByTestId("origin-wanderer").click();
  await page.getByTestId("menu-records").click();
  const view = page.getByTestId("chronicle");
  await expect(view).toContainText("古の英雄《百狼斬り》");
  await expect(view).toContainText("42日を生き");
  await expect(view).toContainText("命を落とした");
  await expect(view).toContainText("市民・鍛冶師");
  await expect(view).toContainText("品質80");
});
