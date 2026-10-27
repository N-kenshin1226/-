import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newGame, serialize, type GameState } from "@trace/core";

/**
 * X-5 失われた書物（06 §2）：前世の代表技能が閾値を超えていれば、
 * 転生した次の世界の書店にその技能の「先達の手記」が並ぶ。
 * 一周まるごと遊ぶと時間がかかるので、前世の終わり間際のセーブ
 * （代表技能の最高到達値だけを埋めた GameState）を直接仕込んで検証する。
 */

// UI は skillList 全件を描画するので、仕込むセーブは全技能を持つ必要がある。
// skills.json を直接読む（@trace/content は JSON 同梱のため e2e からは import できない）
const skillIds = (
  JSON.parse(
    readFileSync(new URL("../../../packages/content/skills.json", import.meta.url), "utf8"),
  ) as { skills: { id: string }[] }
).skills.map((s) => s.id);

/** 剣術の最高到達値を peak に持つ、引退直前の生のセーブJSON */
const saveOf = (seed: string, peak: number): string => {
  const base = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    // 手記は60G：長く生きた生の所持金として十分な額を持たせる
    initialMoney: 200,
  });
  const prev: GameState = {
    ...base,
    player: {
      ...base.player,
      skills: {
        ...base.player.skills,
        // 一生を駆け抜けて剣術が peak に届いたことにする（年代記の peakSkills が拾う）
        swordplay: { ...base.player.skills["swordplay"]!, value: peak, peak },
      },
    },
  };
  return serialize(prev);
};

/** 仕込んだ生を引退させて転生まで進める（戻る先はメニュー） */
const rebirth = async (page: import("@playwright/test").Page): Promise<void> => {
  await page.getByTestId("menu-retire").click();
  await page.getByTestId("retire-yes").click();
  await page.getByTestId("succession-rebirth").click();
  await page.getByTestId("rebirth-origin-wanderer").click();
  await page.getByTestId("rebirth-born").click();
};

/** 《釘の束》（簡易判定・報酬15G）を1回納める。自己ベスト等のA窓が出たら畳む（F-02） */
const workNail = async (page: import("@playwright/test").Page): Promise<void> => {
  await page.getByTestId("menu-work").click();
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-simple").click();
  for (let i = 0; i < 4; i++) {
    const n = page.locator('[data-testid="notice-a"], [data-testid="notice-s"]');
    if ((await n.count()) === 0) break;
    await n.first().click();
  }
};

test("剣術を極めた生は、次の世界の書店に《剣鬼の手記》を遺す", async ({ page }) => {
  await page.addInitScript(
    (json) => {
      localStorage.setItem("trace.save.v1", json);
    },
    saveOf("e2e-lost", 80),
  ); // peak 80 > 閾値（balance.lostBooks.skillThreshold）

  await page.goto("/?seed=e2e-lost");
  await expect(page.getByTestId("menu")).toBeVisible();

  await rebirth(page);

  // 転生の告知に手記の行が出る（cli.json の rebirthLostBooks 文）
  const log = page.getByTestId("log");
  await expect(log).toContainText("失われた手記");
  await expect(log).toContainText("剣術");

  // 生まれたての生の所持金は40G。手記は60Gなので、仕事を2回納めてから書店へ
  await workNail(page);
  await workNail(page);

  // 書店に《剣鬼の手記》が並ぶ（棚条件 lostbook.swordplay が立っている）
  await page.getByTestId("menu-book").click();
  const shop = page.getByTestId("screen-book");
  await expect(shop).toBeVisible();
  await expect(shop).toContainText("剣鬼の手記");
  // 既存の条件なし書物も変わらず並ぶ
  await expect(shop).toContainText("剣術指南");

  // 買って読める（読了文は books.json の readText。素質回復ログも出る）
  await page.getByTestId("book-buy-book.lost_swordplay").click();
  await page.getByTestId("book-read-book.lost_swordplay").click();
  await expect(log).toContainText("剣鬼の手記");

  // 新しい周のセーブに転生フラグが刻まれている
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trace.save.v1") ?? "null"),
  );
  expect(save.seed).toBe("e2e-lost:next:0");
  expect(save.flags["lostbook.swordplay"]).toBe(true);
});

test("代表技能が閾値に届かない生は手記を遺さない", async ({ page }) => {
  await page.addInitScript(
    (json) => {
      localStorage.setItem("trace.save.v1", json);
    },
    saveOf("e2e-lost-low", 30),
  ); // peak 30 < 閾値

  await page.goto("/?seed=e2e-lost-low");
  await expect(page.getByTestId("menu")).toBeVisible();

  await rebirth(page);

  // 告知は出ず、書店にも並ばない
  await expect(page.getByTestId("log")).not.toContainText("失われた手記");
  await page.getByTestId("menu-book").click();
  const shop = page.getByTestId("screen-book");
  await expect(shop).toBeVisible();
  await expect(shop).not.toContainText("剣鬼の手記");
  // 条件なしの既存書物は並ぶ
  await expect(shop).toContainText("剣術指南");

  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trace.save.v1") ?? "null"),
  );
  expect(save.flags["lostbook.swordplay"]).toBeUndefined();
});
