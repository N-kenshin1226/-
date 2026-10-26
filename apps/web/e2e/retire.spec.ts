import { expect, test } from "@playwright/test";

// T-40 引退と転生：引退 → 確認 → 伝記＋継承 → 新しい生（06 §1「一生＝1周」）
test("引退から転生まで通せる（年代記に1頁残る）", async ({ page }) => {
  await page.goto("/?seed=e2e");
  await page.getByTestId("origin-wanderer").click();

  // 引退はいつでも選べる。確認は1回（思いとどまると何も起きない）
  await page.getByTestId("menu-retire").click();
  await expect(page.getByTestId("screen-retire")).toContainText("引退しますか");
  await page.getByTestId("retire-no").click();
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("log")).toContainText("引退は思いとどまった");

  await page.getByTestId("menu-retire").click();
  await page.getByTestId("retire-yes").click();

  // 転生画面：伝記が開き、継承の選択（記憶・遺物）と新しい生の出自を選ぶ
  const rebirth = page.getByTestId("screen-rebirth");
  await expect(rebirth).toBeVisible();
  await expect(page.getByTestId("rebirth-bio")).toContainText("旅人");
  // 生まれたばかりの生なので記憶に残せる称号も遺物も無い
  await expect(rebirth).toContainText("前世の記憶に残せる称号はない");
  await expect(rebirth).toContainText("遺物にできる作品はない");
  // 出自を選ぶまでは生まれない
  await expect(page.getByTestId("rebirth-born")).toBeDisabled();
  await page.getByTestId("rebirth-origin-wanderer").click();
  await page.getByTestId("rebirth-born").click();

  // 新しい周は1日目から。死んだ状態の画面は残らない
  await expect(page.getByTestId("status")).toContainText("残り行動 5/5");
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("log")).toContainText("新しい世界で、新しい生が始まる");

  // 年代記に retire の1頁（世界のシードは終わった生のもの）
  const chronicle = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trace.chronicle.v1") ?? "null"),
  );
  expect(chronicle.lives).toHaveLength(1);
  expect(chronicle.lives[0].cause).toBe("retire");
  expect(chronicle.lives[0].worldSeed).toBe("e2e");
  expect(chronicle.lives[0].biography).toBeTruthy();

  // セーブは新しい周に置き換わる。シードは決定論的に派生（seed:next:生きた日数）
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trace.save.v1") ?? "null"),
  );
  expect(save.seed).toBe("e2e:next:0");
});

// T-40：遺物を選んで継承する（作品を1本作ってから引退）
test("遺物を選んで継承できる", async ({ page }) => {
  await page.goto("/?seed=e2e-artifact");
  await page.getByTestId("origin-wanderer").click();

  // 《釘の束》を簡易判定で1本作る
  await page.getByTestId("menu-work").click();
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();
  await expect(page.getByTestId("log")).toContainText("品質");

  await page.getByTestId("menu-retire").click();
  await page.getByTestId("retire-yes").click();
  const rebirth = page.getByTestId("screen-rebirth");
  await expect(rebirth).toBeVisible();
  // 遺物の候補に釘の束が出て、選べる（初期値＝最高品質の自動選択）
  await expect(page.getByTestId("rebirth-artifacts")).toContainText("釘の束");
  await page.getByTestId("rebirth-origin-wanderer").click();
  await page.getByTestId("rebirth-born").click();
  await expect(page.getByTestId("log")).toContainText("前世の名品《釘の束》");
  await expect(page.getByTestId("log")).toContainText("新しい世界で");
});
