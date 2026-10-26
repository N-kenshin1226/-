import { expect, test } from "@playwright/test";

test("トップ画面に TRACE と表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-home.png", fullPage: true });
});

test("3日分遊べる（鍛錬・仕事・睡眠・起床ログ）", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();

  // 1日目：メニュー→鍛錬→仕事→寝る
  await expect(page.getByTestId("status")).toContainText("所持金");
  await expect(page.getByTestId("menu-train")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-menu.png", fullPage: true });

  await page.getByTestId("menu-train").click();
  await page.getByTestId("skill-smithing").click();
  await page.getByTestId("diff-10").click();
  await expect(page.getByTestId("log")).toContainText("未定着");
  await page.getByRole("button", { name: "戻る" }).click();

  await page.getByTestId("menu-work").click();
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();
  await expect(page.getByTestId("log")).toContainText("品質");

  await page.getByTestId("menu-sleep").click();
  await page.getByTestId("inn-cheap").click();
  await expect(page.getByTestId("log")).toContainText("起床");
  await page.screenshot({ path: "e2e/artifacts/trace-wake.png", fullPage: true });

  // 2日目：行動がリセットされている（寝ると翌日になる）
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
  await page.getByTestId("menu-hunt").click();
  await expect(page.getByTestId("enemy-wolf")).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();

  // 見聞録を読む（1行動消費）
  await page.getByTestId("menu-lore").click();
  await page
    .getByTestId(/^atom-/)
    .first()
    .click();
  await page.getByTestId("lore-read").click();
  await expect(page.getByTestId("log")).toContainText("《");
  await page.getByRole("button", { name: "一覧へ" }).click();
  await page.getByRole("button", { name: "戻る" }).click();

  // 3日目まで進める（安宿で寝る）
  await page.getByTestId("menu-sleep").click();
  await page.getByTestId("inn-cheap").click();
  await expect(page.getByTestId("status")).toContainText("3日");
});

test("深層に潜んで1層進める（T-43。勝利→引き返し→記録）", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();

  await page.getByTestId("menu-abyss").click();
  await expect(page.getByTestId("screen-abyss")).toBeVisible();
  await page.getByTestId("abyss-dive").click();

  // 第1層の敵を倒すまで攻撃する（逃走・敗北ならその時点でラン終了＝commit が出る）
  for (let i = 0; i < 20; i++) {
    if (
      await page
        .getByTestId("abyss-retreat")
        .isVisible()
        .catch(() => false)
    )
      break;
    if (
      await page
        .getByTestId("abyss-commit")
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByTestId("combat-attack").click();
  }
  // 層をクリアした → 層の合間に引き返してランを閉じる
  await expect(page.getByTestId("abyss-retreat")).toBeVisible();
  await page.getByTestId("abyss-retreat").click();
  await page.getByTestId("abyss-commit").click();
  await expect(page.getByTestId("log")).toContainText("到達：第1層");
  await expect(page.getByTestId("log")).toContainText("自己ベスト更新");

  // 街の記録に深層の自己ベストが残る（counters 由来の派生表示）
  await page.getByTestId("menu-records").click();
  await expect(page.getByTestId("screen-records")).toContainText("深層：自己ベスト 第1層");
  await page.screenshot({ path: "e2e/artifacts/trace-abyss.png", fullPage: true });
});

test("師匠画面が開ける（T-27。初期状態では入門条件未達）", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await page.getByTestId("menu-mentor").click();
  await expect(page.getByTestId("screen-mentor")).toBeVisible();
  await expect(page.getByTestId("mentor-mentor.garo")).toContainText("ガロ");
  await expect(page.getByTestId("screen-mentor")).toContainText("まだ見込みなし");
  await page.screenshot({ path: "e2e/artifacts/trace-mentor.png", fullPage: true });
  await page.getByRole("button", { name: "戻る" }).click();
});
