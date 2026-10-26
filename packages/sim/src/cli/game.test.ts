import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    const first = scriptedIo(["1", "1", "", "5", "1", "y", "q"]);
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
    const { io, output } = scriptedIo([...lines, "q"]);
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
