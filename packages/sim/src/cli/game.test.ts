import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appraisalGame, deserializeChronicle, newGame, serialize } from "@trace/core";
import { balance, orders, skills } from "@trace/content";
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
      "1", // 運命の傾向：穏やかな世（既定）
      "", // 誓約：なし
      ...threeDays([
        ["2", "y"],
        ["1", "n"],
        ["1", "y"],
      ]),
      "q",
    ]);
    // F-05：出来事の割り込みは入力を1つ消費するので、
    // 3日とも出来事の起きないシード（cli-3d-27）で固定する
    const state = await playCli({ io, savePath, seed: "cli-3d-27" });
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
    const first = scriptedIo(["1", "1", "", "1", "1", "", "5", "1", "y", "q"]);
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
      "1", // 傾向：穏やか
      "", // 誓約：なし
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
      "1", // 傾向：穏やか
      "", // 誓約：なし
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

describe("T-45/T-46 運命の傾向・誓約", () => {
  it("開始時に傾向と誓約を選べ、GameState に刻まれる", async () => {
    const savePath = tmpSave();
    const { io, output } = scriptedIo([
      "1", // 出自
      "2", // 運命の傾向：戦乱の世
      "1,5", // 誓約：1番（硬鱗）と5番（無風）
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("運命の傾向");
    expect(text).toContain("戦乱の世");
    expect(text).toContain("誓約");
    expect(state!.tendency).toBe("war");
    expect(state!.vows).toEqual(["vow.iron_hide", "vow.windless"]);
    expect(state!.flags["vow.taken.vow.iron_hide"]).toBe(true);
  });

  it("空入力・EOF は穏やか＋誓約なしに倒れる（従来どおり）", async () => {
    const savePath = tmpSave();
    const { io } = scriptedIo(["1", "", "", "q"]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    expect(state!.tendency).toBe("calm");
    expect(state!.vows).toEqual([]);
  });
});

describe("T-23 狩りメニュー（エリア別）", () => {
  it("エリア見出しつきで敵が列挙され、通し番号で選べる", async () => {
    const savePath = tmpSave();
    // 「3) 狩り」→ 一覧 → 「4) 追い剥ぎ」（旧街道側）で戦闘開始 → EOFで中断
    const { io, output } = scriptedIo(["1", "1", "", "3", "4"]); // 出自→傾向→誓約→狩り;
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
      if (day === 3) lines.push("6", "", ""); // 目標と認定（受諾/寄付の選択と目標の宣言を見る。X-9 で寄付が並ぶようになり、空入力が2つ要る）
      lines.push("5", "1", "y"); // 寝る（安い宿・夕食あり）
    }
    const { io, output } = scriptedIo(["1", "1", "", ...lines, "q"]); // 出自→傾向→誓約→1週間;
    // F-05：出来事の割り込みは入力を1つ消費するので、
    // 7日とも出来事の起きないシード（town-week-33）で固定する
    const state = await playCli({ io, savePath, seed: "town-week-33", delay: async () => {} });
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
      "1", // 傾向：穏やか
      "", // 誓約：なし
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

describe("T-38 年代記", () => {
  it("戦死すると年代記に記録される。セーブとは別領域に残る", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-chron-test-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    const { io, output } = scriptedIo([
      "1", // 出自
      "1", // 傾向：穏やか
      "", // 誓約：なし
      "3", // 狩りに出る
      "5", // 脱走兵（最強）に挑む
      ...Array.from({ length: 40 }, () => "1"), // 攻撃連打（このシードでは敗北する）
      "q",
    ]);
    await playCli({ io, savePath, chroniclePath, seed: "chron-smoke", delay: async () => {} });
    const text = output.join("\n");
    expect(text).toContain("力尽きた");
    expect(text).toContain("年代記に刻まれた");

    // 年代記は別ファイルに残る（save.json とは別領域）
    const chronicle = deserializeChronicle(readFileSync(chroniclePath, "utf8"));
    expect(chronicle.lives).toHaveLength(1);
    const life = chronicle.lives[0]!;
    expect(life.cause).toBe("death");
    expect(life.worldSeed).toBe("chron-smoke");
    expect(life.name).toBe("旅人");
    expect(life.biography).toBeTruthy(); // 伝記も一緒に刻まれる（T-37 → T-38 の連携）

    // 再起動（別シードの新しい周）でも開始行に件数が出る＝周回をまたぐ
    const again = scriptedIo(["2", "q"]);
    await playCli({
      io: again.io,
      savePath,
      chroniclePath,
      seed: "another",
      delay: async () => {},
    });
    expect(again.output.join("\n")).toContain("年代記には 1 人の人生が記録されている");
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
      "1", // 傾向：穏やか
      "", // 誓約：なし
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
    const { io, output } = scriptedIo(["1", "1", "", "2", String(idx), "y", ...cells, "q"]);
    const state = await playCli({ io, savePath, seed: SEED, delay: async () => {} });
    const text = output.join("\n");

    expect(text).toContain("すべての真品を見極めた");
    expect(text).toContain("真贋看破");
    expect(state!.ledger).toHaveLength(1);
    expect(state!.ledger[0]!.kind).toBe("appraisal");
    expect(state!.ledger[0]!.flags).toContain("真贋看破");
  });
});

describe("T-40 引退と転生", () => {
  it("引退すると伝記 → 年代記 → 転生へ進み、新しい世界が始まる", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-reinc-test-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    const { io, output } = scriptedIo([
      "1", // 出自
      "1", // 傾向：穏やか
      "", // 誓約：なし
      "11", // 引退する
      "y", // 確認（1回だけ）
      "1", // 継ぎ方：新しい世界に転生する（T-48）
      "1", // 転生先の出自（称号も作品も無いので継承の選択肢は出ない）
      "1", // 転生先の傾向：穏やか
      "", // 転生先の誓約：なし
      "q",
    ]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "reinc-smoke",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(text).toContain("引退しますか");
    expect(text).toContain("年代記に刻まれた");
    expect(text).toContain("新しい世界で、新しい生が始まる");

    // 年代記に retire の1頁（世界のシードは終わった生のもの）
    const chronicle = deserializeChronicle(readFileSync(chroniclePath, "utf8"));
    expect(chronicle.lives).toHaveLength(1);
    expect(chronicle.lives[0]!.cause).toBe("retire");
    expect(chronicle.lives[0]!.worldSeed).toBe("reinc-smoke");
    expect(chronicle.lives[0]!.biography).toBeTruthy();

    // セーブは新しい周に置き換わる。シードは決定論的に派生（seed:next:生きた日数）
    expect(state!.seed).toBe("reinc-smoke:next:0");
    const saved = JSON.parse(readFileSync(savePath, "utf8")) as { seed: string };
    expect(saved.seed).toBe("reinc-smoke:next:0");
    expect(state!.time.day).toBe(0);
  });

  it("引退をやめれば何も起きない（確認は1回）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-retire-cancel-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    const { io, output } = scriptedIo(["1", "1", "", "11", "n", "q"]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: SEED,
      delay: async () => {},
    });
    const text = output.join("\n");
    expect(text).toContain("引退は思いとどまった");
    expect(text).not.toContain("新しい世界で");
    expect(state!.seed).toBe(SEED);
    expect(state!.time.day).toBe(0);
    // 年代記には何も書かれない
    expect(existsSync(chroniclePath)).toBe(false);
  });

  it("称号と遺物を選んで継承し、次の周に持ち込める", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-reinc-pick-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    // 称号2つ・作品1つを持つ5日目の人生をセーブとして仕込む
    const life = newGame("inherit-seed", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
    });
    const seeded = {
      ...life,
      titles: ["title.saw_the_way", "title.master_smith"],
      ledger: [
        {
          id: "w1",
          kind: "smithing",
          maker: "旅人",
          quality: 70,
          tier: 2,
          order: "order.nail",
          flags: [],
          day: 3,
          worldSeed: "inherit-seed",
          marketValue: 140,
        },
      ],
      time: { day: 5, action: 1 },
    };
    writeFileSync(savePath, serialize(seeded));

    const { io, output } = scriptedIo([
      "1", // つづきから
      "11", // 引退する
      "y", // 確認
      "1", // 継ぎ方：新しい世界に転生する（T-48）
      "1", // 記憶に残す称号：1番（title.saw_the_way）
      "1", // 遺物：1番（釘の束）
      "1", // 転生先の出自
      "1", // 転生先の傾向：穏やか
      "", // 転生先の誓約：なし
      "q",
    ]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "inherit-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(text).toContain("前世の記憶に残す称号");
    expect(text).toContain("遺物にする作品");
    expect(text).toContain("前世の名品《釘の束》");
    expect(text).toContain("前世の記憶が滲んでいる");

    // 年代記には選んだ称号も含めて1頁
    const chronicle = deserializeChronicle(readFileSync(chroniclePath, "utf8"));
    expect(chronicle.lives).toHaveLength(1);
    expect(chronicle.lives[0]!.cause).toBe("retire");
    expect(chronicle.lives[0]!.epithet).toBe("title.master_smith"); // Sランク優先
    // 二つ名の表示も出る
    expect(text).toContain("年代記には《名工》の名が刻まれた");

    // 継承した周：記憶の称号は保持され、遺物は legacy に載る
    expect(state!.seed).toBe("inherit-seed:next:5");
    expect(state!.titles).toEqual(["title.saw_the_way"]);
    expect(state!.flags["memory.title.title.saw_the_way"]).toBe(true);
    expect(state!.legacy?.artifact).toMatchObject({ name: "order.nail", kind: "smithing" });
  });

  it("老衰死は教会蘇生せず、そのまま転生する（06 §1・D-31）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-oldage-test-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    // 寿命40年・開始15歳 → 55歳＝4480日目の朝に老衰死。直前の夜から寝る
    const life = newGame("oldage-seed", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
    });
    const seeded = { ...life, time: { day: 4479, action: 4 } };
    writeFileSync(savePath, serialize(seeded));

    const { io, output } = scriptedIo([
      "1", // つづきから
      "4", // 休む（今日を終える。無料なので所持金不要）
      "1", // 継ぎ方：新しい世界に転生する（T-48）
      "1", // 転生先の出自
      "1", // 転生先の傾向：穏やか
      "", // 転生先の誓約：なし
      "q",
    ]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "oldage-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(text).toContain("天命に達した");
    // 教会蘇生の文は出ない（老衰だけは蘇生しない。06 §1）
    expect(text).not.toContain("教会で目を覚ました");
    expect(text).toContain("年代記に刻まれた");
    expect(text).toContain("新しい世界で、新しい生が始まる");

    const chronicle = deserializeChronicle(readFileSync(chroniclePath, "utf8"));
    expect(chronicle.lives).toHaveLength(1);
    expect(chronicle.lives[0]!.cause).toBe("oldAge");
    expect(chronicle.lives[0]!.worldSeed).toBe("oldage-seed");

    // 新しい世界は終わった日から決定論的に派生する
    expect(state!.seed).toBe("oldage-seed:next:4480");
    expect(state!.time.day).toBe(0);
    expect(state!.counters["death.oldAge"]).toBeUndefined();
  });
});

describe("T-48 子・弟子への継承延長（同じ世界）", () => {
  /** 称号・作品・素質の頂きを持つ人生を仕込む */
  const seedLife = (savePath: string, extra?: Record<string, unknown>) => {
    const life = newGame("heir-seed", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
    });
    life.player.skills["smithing"]!.peak = 80;
    life.player.skills["mining"]!.peak = 500;
    const seeded = {
      ...life,
      titles: ["title.master_smith"],
      ledger: [
        {
          id: "w1",
          kind: "smithing",
          maker: "旅人",
          quality: 70,
          tier: 2,
          order: "order.nail",
          flags: [],
          day: 3,
          worldSeed: "heir-seed",
          marketValue: 140,
        },
      ],
      time: { day: 5, action: 1 },
      ...extra,
    };
    writeFileSync(savePath, serialize(seeded));
  };

  it("「この世界で次代を継ぐ」を選ぶと、同じシードで新しい生が始まり年代記には刻まない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-heir-test-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    seedLife(savePath);

    const { io, output } = scriptedIo([
      "1", // つづきから
      "11", // 引退する
      "y", // 確認
      "2", // 継ぎ方：この世界で次代を継ぐ
      "1", // 次代の出自
      "", // 次代の誓約：なし
      "q",
    ]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "heir-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(text).toContain("どう継ぎますか");
    expect(text).toContain("この世界で次代を継ぐ");
    // 子が継ぐ（弟子入り歴なし）＋ この世界の2代目
    expect(text).toContain("子が跡を継いだ");
    expect(text).toContain("2 代目の生が始まる");
    expect(text).toContain("年代記には刻まない");

    // 世界シードは不変（転生の :next: 派生ではない）
    expect(state!.seed).toBe("heir-seed");
    expect(state!.time.day).toBe(0);
    // 世代の刻印は counters/flags（GameState の形は変えない）
    expect(state!.counters["heir.count"]).toBe(1);
    expect(state!.flags["heir.child"]).toBe(true);
    expect(state!.flags["heir.disciple"]).toBeUndefined();

    // 弱い引継ぎ：peak に heir 係数（0.05・上限10）だけが乗る（記憶称号・遺物は渡さない）
    expect(state!.titles).toEqual([]);
    expect(state!.legacy?.artifact).toBeNull();
    // 同じ seed・同じ出自の素質の素点と比べて heir 分だけ高い（出自の散らしは同じ）
    const plain = newGame("heir-seed", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
      origin: { id: "origin.wanderer", potentialBase: 100, affinity: {} },
      potentialInitMin: balance.player.potentialInitMin,
      potentialInitMax: balance.player.potentialInitMax,
    });
    expect(state!.player.skills["smithing"]!.potentialCap).toBe(
      plain.player.skills["smithing"]!.potentialCap + 4, // 80×0.05
    );
    expect(state!.player.skills["mining"]!.potentialCap).toBe(
      plain.player.skills["mining"]!.potentialCap + 10, // 500×0.05 → 上限10
    );

    // 年代記には追記しない（前代の記録はその場の伝記が担う）
    expect(text).toContain("旅人"); // 伝記は表示されている
    expect(existsSync(chroniclePath)).toBe(false);
    // セーブは新しい生に置き換わり、シードも同じ
    const saved = JSON.parse(readFileSync(savePath, "utf8")) as { seed: string };
    expect(saved.seed).toBe("heir-seed");
  });

  it("弟子入り歴のある生からは弟子が継ぐ（継ぎ方の選択は転生を選べば従来どおり）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-heir-disciple-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    // 師匠の稽古歴がある生（門を出たあとでも弟子の系譜）
    seedLife(savePath, { counters: { "mentor.session.mentor.garo": 4 }, tendency: "war" });

    const { io, output } = scriptedIo([
      "1", // つづきから
      "11", // 引退する
      "y", // 確認
      "2", // 継ぎ方：この世界で次代を継ぐ
      "1", // 次代の出自
      "", // 次代の誓約：なし
      "q",
    ]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "heir-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(text).toContain("弟子が跡を継いだ");
    expect(state!.flags["heir.disciple"]).toBe(true);
    // 同じ世界なので運命の傾向は前世のものを引き継ぐ（選び直さない）
    expect(state!.tendency).toBe("war");
    expect(existsSync(chroniclePath)).toBe(false);
  });
});

describe("X-5 失われた書物（前世の技が次の世界の書店に）", () => {
  /** 指定した peak を持つ5日目の人生をセーブとして仕込む */
  const seedLife = (savePath: string, peaks: Record<string, number>) => {
    const life = newGame("lostbook-seed", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
    });
    for (const [id, peak] of Object.entries(peaks)) {
      life.player.skills[id]!.peak = peak;
    }
    writeFileSync(savePath, serialize({ ...life, time: { day: 5, action: 1 } }));
  };

  /** 引退 → 転生 → 書店を開くまでの入力行 */
  const rebirthToShop = [
    "1", // つづきから
    "11", // 引退する
    "y", // 確認
    "1", // 継ぎ方：新しい世界に転生する
    "1", // 転生先の出自
    "1", // 転生先の傾向：穏やか
    "", // 転生先の誓約：なし
    "9", // 書店
  ];

  it("前世の代表技能が閾値超なら、転生先の書店に「先達の手記」が並ぶ", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-lostbook-test-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    const th = balance.lostBooks.skillThreshold;
    seedLife(savePath, { swordplay: th + 20, smithing: th - 1 });

    const { io, output } = scriptedIo([...rebirthToShop, "6", "q"]); // 棚の6番＝剣術の手記
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "lostbook-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    // 転生時に flags["lostbook.swordplay"] が立ち、告知の1行が出る
    expect(state!.flags["lostbook.swordplay"]).toBe(true);
    expect(text).toContain("失われた手記を遺した");
    // 書店の棚に剣術の手記が並ぶ（閾値未満の鍛冶の手記は出ない）
    expect(text).toContain("剣鬼の手記");
    expect(text).not.toContain("炉辺の遺稿");
    // 棚にあるので選べる（値段は初期所持金を超えるので購入は足りない）
    expect(text).toContain("所持金が足りない");
  });

  it("代表技能がすべて閾値未満なら、手記は棚に出ない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-lostbook-under-"));
    const savePath = join(dir, "save.json");
    const chroniclePath = join(dir, "chronicle.json");
    const th = balance.lostBooks.skillThreshold;
    seedLife(savePath, { swordplay: th - 1, smithing: th - 1 });

    const { io, output } = scriptedIo([...rebirthToShop, "q"]);
    const state = await playCli({
      io,
      savePath,
      chroniclePath,
      seed: "lostbook-seed",
      delay: async () => {},
    });
    const text = output.join("\n");

    expect(state!.flags["lostbook.swordplay"]).toBeUndefined();
    expect(text).not.toContain("失われた手記を遺した");
    expect(text).not.toContain("剣鬼の手記");
    // 棚は従来の5冊だけ
    expect(text).toContain("山野の採集図鑑");
  });
});

describe("X-10 勝負所の行事", () => {
  it("届いた打診に勝負所から応え、交渉に臨んで、記録と朝刊に残る", async () => {
    const savePath = tmpSave();
    // 「行商の大取引」の打診が届いた朝として仕込む。
    // 届け方の抽選は core の occasions テストで検証済み ——
    // ここでは「人物の台詞 → 請け → 勝負 → 残り方」の通しを見る
    const g = newGame("x10-cli", "旅人", {
      skillIds: skills.skills.map((s) => s.id),
      initialPotential: 100,
      initialStatValue: 10,
      initialMoney: 300,
    });
    g.player.skills["eloquence"]!.value = 30;
    const seeded = {
      ...g,
      counters: { ...g.counters, "occasion.offer.day.deal.grand_bargain": g.time.day },
    };
    writeFileSync(savePath, serialize(seeded));

    const { io, output } = scriptedIo([
      "1", // つづきから
      "14", // 勝負所（届いた打診）
      "1", // 《行商の大取引》の打診に応える
      "14", // 勝負所にもどる
      "1", // 《行商の大取引》に臨む → 交渉
      "1",
      "1",
      "1", // 札を3枚出す（このシードでは3手で決着・勝つ）
      "8", // 街の記録
      "5", // 寝る →
      "1", //   宿：1番
      "y", //   夕食あり → 起床と朝刊
      "q",
    ]);
    const state = await playCli({ io, savePath, seed: "x10-cli", delay: async () => {} });
    const text = output.join("\n");

    // 打診は人物の口から届く（クエストボードではない）
    expect(text).toContain("勝負所の行事");
    expect(text).toContain("打診が届いている");
    expect(text).toContain("ひと山当てる話がある");
    // 請けて臨み、勝ちを収めた（交渉の出来が行事の閾値を上回る）
    expect(text).toContain("勝負を請けました");
    expect(text).toContain("《行商の大取引》で勝ちを収めた");
    // 街の記録に残る
    expect(text).toContain("勝負所の記録");
    expect(text).toContain("《行商の大取引》――勝ちを収めた");
    // 翌日の朝刊に載る
    expect(text).toContain("街の新聞");
    expect(text).toMatch(/《行商の大取引》(――見事な立ち回り|の勝負を制した者あり|で栄冠を掴んだ)/);
    // 結果は物語を動かす：賞金・評判・旗印が刻まれる
    // （宿・夕食の支払いがあるので、賞金は出力行と初期所持金からの増加で確かめる）
    expect(text).toContain("――報酬 250G を受け取った。");
    expect(state!.player.money).toBeGreaterThan(300);
    expect(state!.counters["occasion.renown"]).toBe(2);
    expect(state!.flags["occasion.merchant_trusted"]).toBe(true);
  });
});
