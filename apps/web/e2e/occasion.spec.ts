import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newGame, serialize } from "@trace/core";
import { placeAct, waitVeil } from "./helpers.js";

/**
 * X-10 勝負所の行事（docs/03 §2）：人物から届いた打診 → 請け → 勝負所（交渉の皮）
 * → 勝敗が刻印・記録・新聞に残る、ひと通りの流れをブラウザで確かめる。
 * 「行商の大取引」（交渉の器）はラウンド制なので、予告を読んで最善手を
 * 選ぶ貪欲プレイで決定的に勝てる（シード e2e-occ・0日目・行動0 で品質 96）
 */

// UI は skillList 全件を使うので、仕込むセーブは全技能を持つ必要がある
// （@trace/content は JSON 同梱のため e2e からは import できない。JSON を直接読む）
const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const nego = (
  jsonAt("balance.json") as {
    minigame: {
      negotiation: {
        topics: { id: string; name: string; beats: string }[];
        counterFactor: number;
      };
    };
  }
).minigame.negotiation;
const nameToTopic = Object.fromEntries(nego.topics.map((t) => [t.name, t.id]));
const beatsOf = Object.fromEntries(nego.topics.map((t) => [t.id, t.beats]));

/**
 * 「行商の大取引」の打診が今日届いているセーブを仕込む
 * （打診の刻印 occasion.offer.day.<id> が届いた証。届け方の抽選自体は
 *  core のユニットテストで検証済み。ここでは届いた後の流れを見る）
 */
const saveOf = (seed: string): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  const patched = {
    ...g,
    player: {
      ...g.player,
      money: 300,
      skills: {
        ...g.player.skills,
        eloquence: { ...g.player.skills["eloquence"]!, value: 30 },
      },
    },
    counters: {
      ...g.counters,
      "occasion.offer.day.deal.grand_bargain": g.time.day,
      // 序盤の披露目（F-06）が初日の抽選で混ざらないよう、届いた履歴にして抑える
      "occasion.offer.day.debut.inn_recital": g.time.day - 1,
    },
  };
  return serialize(patched);
};

/**
 * 交渉を貪欲に遊ぶ：相手の予告の最初の論点に、相性の取れる最大威力の札を出す
 * （core の autoplay と同じ読み。予告が尽きたら最大威力の札）
 */
async function playNegotiation(page: Page): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    if ((await page.getByTestId("minigame-done").count()) > 0) return;
    const negoText = await page.getByTestId("nego").innerText();
    // 「相手の次の論点：値段3 / 品質2」の先頭だけ読む
    const m = negoText.match(/相手の次の論点：([^\s0-9]+)(\d)/);
    const oppTopic = m !== null && m[1] !== undefined ? nameToTopic[m[1]] : undefined;
    const hand = await page.getByTestId("nego").locator("[data-testid^='hand-']").all();
    let best = 0;
    let bestPow = -1;
    for (let i = 0; i < hand.length; i++) {
      const text = (await hand[i]!.innerText()).trim();
      const cm = text.match(/^([^\s0-9]+)\s*(\d+)$/);
      if (cm === null || cm[1] === undefined) continue;
      const topic = nameToTopic[cm[1]];
      const power = Number(cm[2]);
      const eff = Math.round(
        power *
          (oppTopic !== undefined && topic !== undefined && beatsOf[topic] === oppTopic
            ? nego.counterFactor
            : 1),
      );
      if (eff > bestPow) {
        bestPow = eff;
        best = i;
      }
    }
    await hand[best]!.click();
    await page.waitForTimeout(30);
  }
  throw new Error("交渉が終わらなかった");
}

test("勝負所の行事：打診 → 請け → 大取引に勝つ → 記録と新聞に残る", async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem("trace.save.v1", save);
  }, saveOf("e2e-occ"));
  await page.goto("/?world=legacy");
  await expect(page.getByTestId("menu")).toBeVisible();

  // 届いた打診がある日だけ、場所の行動に「勝負所の行事」が出る（P-01：行事はギルドに届く。
  // 見取り図のギルドの印には届き物の印が付く）
  await placeAct(page, "guild", "occasion");
  const scr = page.getByTestId("screen-occasion");
  await expect(scr).toBeVisible();
  // 打診は人物（行商人ノラ）の口から届く ―― クエストボードではなく会話
  const offer = page.getByTestId("occasion-offer-deal.grand_bargain");
  await expect(offer).toContainText("ひと山当てる話がある");
  await expect(offer).toContainText("ノラ");
  await expect(scr).toContainText("打診が届いている");
  await page.screenshot({ path: "e2e/artifacts/trace-occasion-offer.png", fullPage: true });

  // 打診に応える（行動は消費しない）→ 請けた状態になる
  await page.getByTestId("occasion-accept-deal.grand_bargain").click();
  await expect(scr).toContainText("請けている");

  // 勝負所に臨む → 交渉の皮（ミニゲーム）が開く
  await page.getByTestId("occasion-attempt-deal.grand_bargain").click();
  await expect(page.getByTestId("minigame")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/trace-occasion-deal.png", fullPage: true });
  await playNegotiation(page);
  await expect(page.getByTestId("minigame-done")).toBeVisible();
  await page.getByTestId("minigame-commit").click();

  // 結果：勝ちはAランクの通知（光る窓）として届く。
  // F-02で同日のA称号（大取引を制した者 等）も窓に重なるので、続く窓も畳む
  const notice = page.getByTestId("notice-a");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("行商の大取引");
  await notice.click();
  for (let i = 0; i < 4; i++) {
    const n = page.locator('[data-testid="notice-a"], [data-testid="notice-s"]');
    if ((await n.count()) === 0) break;
    await n.first().click();
  }

  // 記録に残る（街の記録の「勝負所」欄。記録はギルドの掲示板 —— P-01）
  await expect(page.getByTestId("menu")).toBeVisible();
  await placeAct(page, "guild", "records");
  await expect(page.getByTestId("records-occasions")).toContainText("行商の大取引");
  await expect(page.getByTestId("records-occasions")).toContainText("勝ちを収めた");

  // 眠る → 翌朝の新聞に勝負所の記事が載る
  await expect(page.getByTestId("screen-records")).toBeVisible();
  await page.keyboard.press("Escape");
  // P-01：Esc で場所（ギルド）へ戻り、見取り図から自宅で休む
  await placeAct(page, "home", "rest");
  // 起床の窓を閉じてメニューへ（眠りの幕はキーを呑むので開ききるまで待つ）
  await expect(page.getByTestId("screen-wake")).toBeVisible();
  await waitVeil(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu")).toBeVisible();
  // 新聞を開く：勝負所の結果が紙面に載る（新聞は宿屋に届く）
  await placeAct(page, "inn", "news");
  const news = page.getByTestId("screen-news");
  await expect(news).toBeVisible();
  await expect(news).toContainText("行商の大取引");
  await page.screenshot({ path: "e2e/artifacts/trace-occasion-news.png", fullPage: true });
});
