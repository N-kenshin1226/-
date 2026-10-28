import { expect, test } from "@playwright/test";
import { placeAct, skipIntro, toMap, travelTo, waitVeil } from "./helpers.js";

test("トップ画面に TRACE と表示される", async ({ page }) => {
  await page.goto("/?world=legacy");
  await expect(page.getByRole("heading", { name: "TRACE" })).toBeVisible();
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-home.png", fullPage: true });
});

test("3日分遊べる（鍛錬・仕事・睡眠・起床ログ）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 1日目：見取り図→ギルドで鍛錬→鍛冶場で仕事→宿で寝る（P-01：行動は場所に属する）
  await expect(page.getByTestId("status")).toContainText("所持金");
  await expect(page.getByTestId("menu-place-guild")).toBeVisible();
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-menu.png", fullPage: true });

  await placeAct(page, "guild", "train");
  await page.getByTestId("skill-smithing").click();
  await page.getByTestId("diff-10").click();
  await expect(page.getByTestId("log")).toContainText("未定着");
  // 難度を選んだあとは「選び直す」で技能一覧へ戻り、そこからギルドへ戻る
  await page.getByRole("button", { name: "選び直す" }).click();
  await page.getByRole("button", { name: "戻る" }).click();
  await toMap(page); // 見取り図へ

  await placeAct(page, "forge", "work");
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();
  await expect(page.getByTestId("log")).toContainText("品質");
  // F-02：初めての作品は自己ベスト（ティア更新）としてAの窓で届く ―― 畳んで進む
  const best = page.getByTestId("notice-a");
  if (await best.isVisible().catch(() => false)) {
    await expect(best).toContainText("自己ベスト");
    await best.click();
  }

  await placeAct(page, "inn", "sleep");
  await page.getByTestId("inn-cheap").click();
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await waitVeil(page); // 眠りの幕が開ききるまで待つ
  await expect(page.getByTestId("log")).toContainText("起床");
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-wake.png", fullPage: true });
  await page.getByTestId("wake-done").click();

  // 2日目：行動がリセットされている（寝ると翌日になる）
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
  // 狩りは街の外（門 → 森。移動は1行動を消費）
  await travelTo(page, "forest");
  await page.getByTestId("place-hunt").click();
  await expect(page.getByTestId("enemy-wolf")).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();
  await toMap(page); // 森 → 門 → 見取り図

  // 見聞録を読む（教会で。1行動消費）
  await placeAct(page, "church", "lore");
  await page
    .getByTestId(/^atom-/)
    .first()
    .click();
  await page.getByTestId("lore-read").click();
  await expect(page.getByTestId("log")).toContainText("《");
  await page.getByRole("button", { name: "一覧へ" }).click();
  await page.getByRole("button", { name: "戻る" }).click();
  await toMap(page); // 見取り図へ

  // 3日目まで進める（安宿で寝る）
  await placeAct(page, "inn", "sleep");
  await page.getByTestId("inn-cheap").click();
  await waitVeil(page);
  await page.getByTestId("wake-done").click();
  await expect(page.getByTestId("status")).toContainText("3日");
});

test("深層に潜んで1層進める（T-43。勝利→引き返し→記録）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);

  // 深層の穴は街の外（門から出る。移動は1行動を消費）
  await travelTo(page, "abyss");
  await page.getByTestId("place-abyss").click();
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
  // F-02：深層の自己ベストはAの窓で届く ―― 畳んでから記録へ進む
  const best = page.getByTestId("notice-a");
  if (await best.isVisible().catch(() => false)) await best.click();

  // 街の記録に深層の自己ベストが残る（counters 由来の派生表示）
  await toMap(page); // 深層 → 門 → 見取り図
  await placeAct(page, "guild", "records");
  await expect(page.getByTestId("screen-records")).toContainText("深層：自己ベスト 第1層");
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-abyss.png", fullPage: true });
});

test("師匠画面が開ける（T-27。初期状態では入門条件未達）", async ({ page }) => {
  await page.goto("/?world=legacy&seed=e2e");
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  // 師はそれぞれの住まいで教える（P-01）：剣の師ガロは近郊の森に居る
  await travelTo(page, "forest");
  await page.getByTestId("place-mentor").click();
  await expect(page.getByTestId("screen-mentor")).toBeVisible();
  await expect(page.getByTestId("mentor-mentor.garo")).toContainText("ガロ");
  await expect(page.getByTestId("screen-mentor")).toContainText("まだ見込みなし");
  await page.waitForTimeout(400); // 画面遷移フェード(0.25s)の完了を待つ
  await page.screenshot({ path: "e2e/artifacts/trace-mentor.png", fullPage: true });
  await page.getByRole("button", { name: "戻る" }).click();
});
