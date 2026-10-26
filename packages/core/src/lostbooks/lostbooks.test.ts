import { describe, expect, it } from "vitest";
import { shelfBooks, buyBook, type BooksConfig } from "../books/index.js";
import { emptyChronicle, recordLife, type Chronicle } from "../chronicle/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";
import { lostBookFlags, lostBookSkillId, type LostBookConfig } from "./index.js";

/**
 * X-5 失われた書物（docs/06_endgame.md §2）。
 * 前世の代表技能（chronicle の peakSkills）が閾値超なら、転生先の世界の
 * 書店に「先達の手記」が並ぶ —— flags["lostbook.<skillId>"] で結ぶ一連を
 * 決定論的に検証する（recordLife → lostBookFlags → newGame → 棚・購入）。
 */

const TIME: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const LOST_CFG: LostBookConfig = { skillThreshold: 60, maxBooks: 3, flagPrefix: "lostbook." };

const SKILL_IDS = ["swordplay", "smithing", "mining"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

/** 指定した peak を持つ人生（終わった世界 seed を選べる） */
function lifeWith(seed: string, peaks: Record<string, number>): GameState {
  const g = newGame(seed, "旅人", newGameCfg);
  const skills = { ...g.player.skills };
  for (const [id, peak] of Object.entries(peaks)) {
    if (skills[id] !== undefined) skills[id] = { ...skills[id]!, peak };
  }
  return { ...g, player: { ...g.player, skills } };
}

/** 書店の棚：通常書1冊＋剣術の失われた手記1冊 */
const booksCfg: BooksConfig = {
  books: [
    { id: "book.plain", price: 10, effect: { gainVs: { swordplay: 1.1 } }, durationDays: 3 },
    {
      id: "book.lost_swordplay",
      price: 60,
      effect: { gainVs: { swordplay: 1.25 } },
      durationDays: 7,
      potentialRecover: { swordplay: 15 },
      condition: { flag: "lostbook.swordplay" },
    },
  ],
  potentialMax: 100,
};

describe("lostBookFlags（年代記 → 転生先フラグ）", () => {
  it("代表技能が閾値以上なら、その技能の手記フラグを返す", () => {
    const c = recordLife(emptyChronicle(), lifeWith("w1", { swordplay: 80, mining: 20 }), "retire");
    expect(lostBookFlags(c, LOST_CFG, "w1")).toEqual(["lostbook.swordplay"]);
  });

  it("閾値ちょうどでも出る（gte）。閾値未満だけの生では出ない", () => {
    const at = recordLife(emptyChronicle(), lifeWith("w1", { swordplay: 60 }), "retire");
    expect(lostBookFlags(at, LOST_CFG, "w1")).toEqual(["lostbook.swordplay"]);
    const under = recordLife(
      emptyChronicle(),
      lifeWith("w1", { swordplay: 59, smithing: 30 }),
      "retire",
    );
    expect(lostBookFlags(under, LOST_CFG, "w1")).toEqual([]);
  });

  it("閾値超が多いときは peakSkills 上位から maxBooks 件まで", () => {
    const c = recordLife(
      emptyChronicle(),
      lifeWith("w1", { swordplay: 90, smithing: 80, mining: 70 }),
      "retire",
    );
    // maxSkills（既定3）で peakSkills 自体が3件。そのまま maxBooks=3 なら全部出る
    expect(lostBookFlags(c, LOST_CFG, "w1")).toEqual([
      "lostbook.swordplay",
      "lostbook.smithing",
      "lostbook.mining",
    ]);
    // maxBooks=2 なら上位2件だけ
    expect(lostBookFlags(c, { ...LOST_CFG, maxBooks: 2 }, "w1")).toEqual([
      "lostbook.swordplay",
      "lostbook.smithing",
    ]);
  });

  it("対象は年代記の最新の頁。seed を渡すとその世界で最後に刻まれた頁を選ぶ", () => {
    // 世界 w1 で2頁（戦死→引退の同一人物は起きないが、頁の選択順序を見る）、
    // 末尾が別世界の頁でも seed 指定なら w1 の直前の生を拾う
    let c: Chronicle = emptyChronicle();
    c = recordLife(c, lifeWith("w1", { swordplay: 75 }), "retire");
    c = recordLife(c, lifeWith("w2", { mining: 95 }), "death");
    // seed 省略は末尾（w2 の生）
    expect(lostBookFlags(c, LOST_CFG)).toEqual(["lostbook.mining"]);
    // seed 指定はその世界で最後の頁
    expect(lostBookFlags(c, LOST_CFG, "w1")).toEqual(["lostbook.swordplay"]);
    expect(lostBookFlags(c, LOST_CFG, "w2")).toEqual(["lostbook.mining"]);
    // その世界の頁が無ければ空
    expect(lostBookFlags(c, LOST_CFG, "w3")).toEqual([]);
  });

  it("空の年代記・peakSkills の無い頁では空配列", () => {
    expect(lostBookFlags(emptyChronicle(), LOST_CFG)).toEqual([]);
    // v2 以前の頁（peakSkills なし）を直接置いた年代記でも落ちない
    const old: Chronicle = {
      version: 3,
      lives: [
        {
          name: "旧世代",
          daysLived: 30,
          titles: [],
          standing: "citizen",
          profession: null,
          achievedGoals: [],
          notableWorks: [],
          cause: "retire",
          worldSeed: "w1",
        },
      ],
    };
    expect(lostBookFlags(old, LOST_CFG, "w1")).toEqual([]);
  });
});

describe("lostBookSkillId（フラグ → 技能ID）", () => {
  it("接頭辞を剥がして技能IDを返す。合わない文字列には null", () => {
    expect(lostBookSkillId("lostbook.swordplay", LOST_CFG)).toBe("swordplay");
    expect(lostBookSkillId("vow.taken.x", LOST_CFG)).toBeNull();
    expect(lostBookSkillId("lostbookX", LOST_CFG)).toBeNull();
  });
});

describe("失われた書物の棚（X-5 受け入れ：書店への出現）", () => {
  /** 前世 → 転生先の GameState（newGame の flags に刻む） */
  const nextWorld = (prevSeed: string, peaks: Record<string, number>): GameState => {
    const chronicle = recordLife(emptyChronicle(), lifeWith(prevSeed, peaks), "retire");
    const flags = lostBookFlags(chronicle, LOST_CFG, prevSeed);
    return newGame(`${prevSeed}:next:0`, "旅人", { ...newGameCfg, flags });
  };

  it("前世の代表技能が閾値超なら、次の世界の書店に対応書物が並ぶ", () => {
    const next = nextWorld("w1", { swordplay: 80 });
    expect(next.flags["lostbook.swordplay"]).toBe(true);
    // 棚に失われた手記が出る（通常書と一緒に）
    const shelf = shelfBooks(next, booksCfg, TIME);
    expect(shelf.map((b) => b.id)).toEqual(["book.plain", "book.lost_swordplay"]);
    // 棚にあるので買える
    const bought = buyBook(
      { ...next, player: { ...next.player, money: 100 } },
      "book.lost_swordplay",
      booksCfg,
      TIME,
    );
    expect(bought.ok).toBe(true);
  });

  it("閾値未満では棚に出ず、直接購入もできない", () => {
    const next = nextWorld("w1", { swordplay: 59 });
    expect(next.flags["lostbook.swordplay"]).toBeUndefined();
    const shelf = shelfBooks(next, booksCfg, TIME);
    expect(shelf.map((b) => b.id)).toEqual(["book.plain"]);
    // 棚に出ていなくても購入側でも condition を判定する（抜け道を塞ぐ）
    const bought = buyBook(
      { ...next, player: { ...next.player, money: 100 } },
      "book.lost_swordplay",
      booksCfg,
      TIME,
    );
    expect(bought.ok).toBe(false);
  });

  it("転生しない最初の周では失われた手記は並ばない", () => {
    const first = newGame("w1", "旅人", newGameCfg);
    const shelf = shelfBooks(first, booksCfg, TIME);
    expect(shelf.map((b) => b.id)).toEqual(["book.plain"]);
  });
});
