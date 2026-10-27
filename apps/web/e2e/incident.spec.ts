import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { incidentOutcome, newGame, serialize } from "@trace/core";

/**
 * F-05 日々の出来事：メニューへの自動割り込み → 応え（結末の文＋小さな効果）
 * → あとにする／応え直し → 翌日まで待たずに流れる、ひと通りの流れをブラウザで確かめる。
 * 届く出来事自体は刻印（incident.offer.day.<id>）を仕込む —— 抽選・間隔の制は
 * core のユニットテストで検証済み。ここでは届いた後の流れを見る
 */

// UI は skillList 全件を使うので、仕込むセーブは全技能を持つ必要がある
// （@trace/content は JSON 同梱のため e2e からは import できない。JSON を直接読む）
const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

const skillIds = (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id);
const incidentDefs = (
  jsonAt("incidents.json") as {
    incidents: {
      id: string;
      name: string;
      choices: { id: string; outcomes: { text: string }[] }[];
    }[];
  }
).incidents;
const defOf = (id: string) => incidentDefs.find((d) => d.id === id)!;

/** 届いている出来事を counters に刻んだセーブを仕込む（届いた順＝incidents.json の並び順） */
const saveOf = (seed: string, incidentIds: string[], money = 300): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: money,
  });
  const counters = { ...g.counters };
  for (const id of incidentIds) counters[`incident.offer.day.${id}`] = g.time.day;
  return serialize({ ...g, counters });
};

/** 結末の文は core の抽選と同じ乱数列 —— 表示側の先読みと同じ値をここでも引いて確かめる */
const expectedOutcome = (seed: string, incidentId: string, choiceId: string): string => {
  const g = newGame(seed, "旅人", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 300,
  });
  const def = defOf(incidentId);
  const choice = def.choices.find((c) => c.id === choiceId)!;
  return incidentOutcome(g, def as never, choice as never).text;
};

test("日々の出来事：割り込み → 応え → 結末と小さな効果 → あとにする → 応え直し", async ({
  page,
}) => {
  // 3件刻む：話し手つき（猟師の誘い）→ 小さな当たり（落ちた小銭）→ 先送りする分（野良猫）
  const seed = "e2e-inc";
  await page.addInitScript(
    (save) => {
      localStorage.setItem("trace.save.v1", save);
    },
    saveOf(seed, ["incident.garo_invite", "incident.dropped_coin", "incident.stray_cat"]),
  );
  await page.goto("/");

  // メニューに居ると届いた分が会話の窓として割り込む（クエストボードではなく会話）
  const scr = page.getByTestId("screen-incident");
  await expect(scr).toBeVisible();
  await expect(page.getByTestId("incident-name")).toContainText("猟師の誘い");
  await expect(page.getByTestId("incident-text")).toContainText("猟師のガロ");
  // 話し手の台詞は名札つきの会話窓で届く
  const say = page.getByTestId("incident-say");
  await expect(say).toContainText("ガロ");
  await expect(say).toContainText("山の獣が騒がしい");
  // 賭けの手と手堅い手が並ぶ
  await expect(page.getByTestId("incident-choice-follow")).toContainText("賭け");
  await expect(page.getByTestId("incident-choice-pass")).toContainText("手堅い");
  await page.screenshot({ path: "e2e/artifacts/trace-incident-offer.png", fullPage: true });

  // 賭けの手に応える → 結末の文が窓に返る（行動は消費しない）
  await page.getByTestId("incident-choice-follow").click();
  const result = page.getByTestId("incident-result");
  await expect(result).toContainText(expectedOutcome(seed, "incident.garo_invite", "follow"));
  await page.screenshot({ path: "e2e/artifacts/trace-incident-result.png", fullPage: true });
  await page.getByTestId("incident-next").click();

  // 次の届いた分が続く：落ちた小銭。稀な大当たり（革の小袋）も結末の文で返る
  await expect(page.getByTestId("incident-name")).toContainText("落ちた小銭");
  await page.getByTestId("incident-choice-take").click();
  await expect(result).toContainText(expectedOutcome(seed, "incident.dropped_coin", "take"));
  await page.getByTestId("incident-next").click();

  // 3件目は「あとにする」—— 先送りしても不利益はなく、その日は再び割り込まない
  await expect(page.getByTestId("incident-name")).toContainText("野良猫の尾行");
  await page.getByTestId("incident-defer").click();
  await expect(page.getByTestId("menu")).toBeVisible();

  // 記録には結末の文が残る（メニューの会話窓の記録。届いた旨の行は
  // 抽選で届いた時に出るもの —— 刻印を仕込んだこのセーブでは結末だけが残る）
  const log = page.getByTestId("log");
  await expect(log).toContainText("革の小袋ごと落ちていた");
  await expect(log).toContainText(expectedOutcome(seed, "incident.garo_invite", "follow"));

  // 先送りした分はメニューの「届いた出来事」から応え直せる
  await expect(page.getByTestId("menu-incident")).toBeVisible();
  await page.getByTestId("menu-incident").click();
  await expect(scr).toBeVisible();
  await expect(page.getByTestId("incident-name")).toContainText("野良猫の尾行");
  await page.getByTestId("incident-choice-pet").click();
  await expect(result).toContainText("猫はひと撫でだけ許して");
  await page.getByTestId("incident-next").click();

  // 全部に応えれば窓は閉じてメニューへ。小さな効果は所持金に刻まれている（300→340）
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("status")).toContainText("所持金 340G");
});

test("仕事：勝負所の印は今日の勝負所の注文にだけ付く（日常の注文は簡易が標準）", async ({
  page,
}) => {
  // 種 e2e-inc2・0日目の勝負所は「短剣の注文」（core の抽選で確かめ済み）
  await page.addInitScript(
    (save) => {
      localStorage.setItem("trace.save.v1", save);
    },
    saveOf("e2e-inc2", []),
  );
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();

  await page.getByTestId("menu-work").click();
  const work = page.getByTestId("screen-work");
  await expect(work).toBeVisible();
  // 勝負所の注文だけ「勝負所：」の印。日常の注文には付かない
  await expect(page.getByTestId("order-order.dagger")).toContainText("勝負所：短剣の注文");
  await expect(page.getByTestId("order-order.nail")).not.toContainText("勝負所");
  await expect(page.getByTestId("order-order.ore_survey")).not.toContainText("勝負所");
  await page.screenshot({ path: "e2e/artifacts/trace-work-showdown.png", fullPage: true });

  // 勝負所の注文を手動で仕上げる → 開始行に「勝負所です」と出る
  await page.getByTestId("order-order.dagger").click();
  await page.getByTestId("work-manual").click();
  const game = page.getByTestId("minigame");
  await expect(game).toBeVisible();
  await expect(game).toContainText("勝負所です");
  await page.screenshot({ path: "e2e/artifacts/trace-minigame-showdown.png", fullPage: true });

  // 日常の注文を手動で仕上げても「勝負所です」とは呼ばない（03 §2 使い所の原則）
  await page.getByTestId("minigame-quit").click();
  await page.getByTestId("order-order.nail").click();
  await page.getByTestId("work-manual").click();
  await expect(game).toBeVisible();
  await expect(game).toContainText("《釘の束》");
  await expect(game).not.toContainText("勝負所です");
  await page.screenshot({ path: "e2e/artifacts/trace-minigame-casual.png", fullPage: true });
});
