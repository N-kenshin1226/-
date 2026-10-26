import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appraisalGame } from "@trace/core";
import { balance, orders } from "@trace/content";
import { playCli } from "./game.js";
import { scriptedIo } from "./io.js";

function tmpSave(): string {
  return join(mkdtempSync(join(tmpdir(), "trace-test-")), "save.json");
}

const SEED = "cli-test-seed";

/** 訓練→訓練→寝る を1日として3日分の入力列 */
function threeDays(sleepChoices: [string, string][]): string[] {
  const lines: string[] = [];
  for (const [inn, dinner] of sleepChoices) {
    lines.push("1", "1", ""); // 訓練：スキル1・推奨難度
    lines.push("1", "2", ""); // 訓練：スキル2・推奨難度
    lines.push("5", inn, dinner); // 寝る：宿・夕食
  }
  return lines;
}

describe("playCli", () => {
  it("3日分を通して遊べる（起床ログが3回出る）", async () => {
    const savePath = tmpSave();
    const { io, output } = scriptedIo([
      "1", // 出自：流れてきた孤児
      ...threeDays([
        ["2", "y"],
        ["1", "n"],
        ["1", "y"],
      ]),
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: SEED });
    const text = output.join("\n");

    expect(text).toContain("TRACE");
    expect(text.match(/起床/g)!.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("睡眠の質");
    expect(text).toContain("本日の追い風");
    expect(text).toContain("記録が残されました");
    expect(state!.time.day).toBe(3);
    expect(existsSync(savePath)).toBe(true);
  });

  it("セーブとロードで続きから遊べる", async () => {
    const savePath = tmpSave();
    // 1日目を遊んで寝る（自動セーブ）
    const first = scriptedIo(["1", "1", "1", "", "5", "1", "y", "q"]);
    const s1 = await playCli({ io: first.io, savePath, seed: SEED });
    expect(s1!.time.day).toBe(1);

    // 起動し直して「つづきから」→ 2日目が表示される
    const second = scriptedIo(["1", "q"]);
    const s2 = await playCli({ io: second.io, savePath, seed: SEED });
    const text = second.output.join("\n");
    expect(text).toContain("セーブを見つけました");
    expect(s2!.time.day).toBe(1);
    // セーブは同じGameState（日数が引き継がれる）
    const saved = JSON.parse(readFileSync(savePath, "utf8")) as { time: { day: number } };
    expect(saved.time.day).toBe(1);
  });

  it("仕事（簡易判定）で作品が台帳に残る", async () => {
    const savePath = tmpSave();
    const { io, output } = scriptedIo([
      "1", // 出自
      "2", // 仕事
      "1", // 《釘の束》
      "n", // 簡易判定
      "5",
      "2",
      "y", // 寝る
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: SEED });
    const text = output.join("\n");
    expect(text).toContain("簡易判定で仕上げました");
    expect(text).toContain("《釘の束》");
    expect(state!.ledger).toHaveLength(1);
    expect(state!.ledger[0]!.kind).toBe("smithing");
    expect(state!.ledger[0]!.order).toBe("order.nail");
  });

  it("起床ログの表示（スナップショット）", async () => {
    const savePath = tmpSave();
    const { io, output } = scriptedIo([
      "1", // 出自
      "1",
      "1",
      "", // 《剣術》を推奨難度で
      "1",
      "2",
      "", // 《回避》を推奨難度で
      "5",
      "2",
      "y", // 宿屋《麦穂亭》・夕食あり
      "q",
    ]);
    await playCli({ io, savePath, seed: SEED });
    const text = output.join("\n");
    const start = text.indexOf("━━━━━━━━━ 起床");
    const end = text.indexOf("━━━━━━━━━━━━━━━━━━━━━━");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(text.slice(start, end + "━━━━━━━━━━━━━━━━━━━━━━".length)).toMatchSnapshot();
  });
});

describe("T-23 狩りメニュー（エリア別）", () => {
  it("エリア見出しつきで敵が列挙され、通し番号で選べる", async () => {
    const savePath = tmpSave();
    // 「3) 狩り」→ 一覧 → 「4) 追い剥ぎ」（旧街道側）で戦闘開始 → EOFで中断
    const { io, output } = scriptedIo(["1", "3", "4"]); // 出自→狩り;
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("近郊の森");
    expect(text).toContain("旧街道");
    expect(text).toContain("1) 野犬");
    expect(text).toContain("4) 追い剥ぎ");
    expect(text).toContain("追い剥ぎ が立ちはだかった");
    expect(state!.time.day).toBe(0);
  });
});

describe("T-20 街のプレイループ", () => {
  it("1週間分を自動入力で通せる（仕事・見聞録・記録・認定が出る）", async () => {
    const savePath = tmpSave();
    const lines: string[] = [];
    for (let day = 0; day < 7; day++) {
      lines.push("2", "1", "n"); // 仕事：注文1を簡易判定で
      lines.push("1", "1", ""); // 訓練
      if (day === 1) lines.push("7", "1"); // 見聞録：最初のアトムを読む
      if (day === 2) lines.push("8"); // 街の記録
      if (day === 3) lines.push("6", ""); // 目標と認定（目標の宣言を見る）
      lines.push("5", "1", "y"); // 寝る（安い宿・夕食あり）
    }
    const { io, output } = scriptedIo(["1", ...lines, "q"]); // 出自→1週間;
    const state = await playCli({ io, savePath, seed: "town-week", delay: async () => {} });
    const text = output.join("\n");

    expect(state!.time.day).toBe(7);
    expect(state!.ledger.length).toBeGreaterThanOrEqual(7);
    expect(state!.lore.read.length).toBeGreaterThanOrEqual(1);
    // 報酬（釘15G）− 宿代（8G）で所持金が増える
    expect(state!.player.money).toBe(40 + 7 * 7);
    expect(text).toContain("街の記録");
    expect(text).toContain("街の新聞");
    expect(text).toContain("報酬");
  });
});

describe("T-26 書店", () => {
  it("書物を選んで買い、もう一度開くと読める（買うのは行動を使わない）", async () => {
    const savePath = tmpSave();
    const { io, output } = scriptedIo([
      "1", // 出自
      "9", // 書店
      "5", // 《旧街道の獣と匪賊》45G → 所持金不足
      "9", // 書店
      "3", // 《山野の採集図鑑》25G を購入
      "9", // 書店
      "3", // 所持している3番を読む（1行動）
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("古紙堂");
    expect(text).toContain("所持金が足りない");
    expect(text).toContain("《山野の採集図鑑》を買った");
    expect(text).toContain("あと 5 日、身体に残る");
    expect(state!.books.owned).toEqual(["book.field_almanac"]);
    expect(state!.books.read).toEqual([{ id: "book.field_almanac", day: 0 }]);
    expect(state!.player.money).toBe(40 - 25);
    // 購入は行動を消費せず、読むと1行動消費する
    expect(state!.time.action).toBe(1);
  });
});

describe("M2 新しい皮の仕事フロー", () => {
  it("釣り注文を手動でこなす（タイミングの皮。即応答＝全アタリ命中で大物）", async () => {
    const savePath = tmpSave();
    const idx = orders.orders.findIndex((o) => o.kind === "fishing") + 1;
    expect(idx).toBeGreaterThan(0);
    const beats = balance.minigame.fishing.beats;
    const { io, output } = scriptedIo([
      "1", // 出自
      "2", // 仕事
      String(idx), // 《荒れ川の大物》
      "y", // 手動で挑む
      ...Array.from({ length: beats }, () => ""), // 各アタリに即座にEnter（delayなし＝命中）
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("アタリ");
    expect(text).toContain("大物");
    expect(state!.ledger).toHaveLength(1);
    expect(state!.ledger[0]!.kind).toBe("fishing");
    expect(state!.ledger[0]!.flags).toContain("大物");
  });

  it("鑑定注文を手動でこなす（盤面の皮。全真品を見極めて真贋看破）", async () => {
    const savePath = tmpSave();
    const idx = orders.orders.findIndex((o) => o.kind === "appraisal") + 1;
    expect(idx).toBeGreaterThan(0);
    // 盤面は seed で決定的：autoplay が返す真品の座標をそのまま流す
    const cells = appraisalGame(balance.minigame.appraisal)
      .autoplay({ skill: 0, seed: SEED })
      .map((i) => `${i.x + 1},${i.y + 1}`);
    const { io, output } = scriptedIo(["1", "2", String(idx), "y", ...cells, "q"]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("すべての真品を見極めた");
    expect(text).toContain("真贋看破");
    expect(state!.ledger).toHaveLength(1);
    expect(state!.ledger[0]!.kind).toBe("appraisal");
    expect(state!.ledger[0]!.flags).toContain("真贋看破");
  });
});
