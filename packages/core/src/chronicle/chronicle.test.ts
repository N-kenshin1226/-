import { describe, expect, it } from "vitest";
import { recordWork, type LedgerConfig } from "../ledger/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import {
  CHRONICLE_VERSION,
  deserializeChronicle,
  emptyChronicle,
  lifeEntryOf,
  recordLife,
  serializeChronicle,
} from "./index.js";

const ledgerCfg: LedgerConfig = {
  basePricePerQuality: 2,
  marketWindowDays: 7,
  marketDecayPerWork: 0.9,
  tierUpBonusPending: 8,
};

function base(): GameState {
  return newGame("world-a", "旅人", {
    skillIds: ["swordplay", "smithing"],
    initialPotential: 100,
    initialStatValue: 10,
  });
}

/** 称号2つ・作品3つ・市民の鍛冶師、42日目の人生を作る */
function rich(): GameState {
  let s = base();
  s = recordWork(s, { kind: "smithing", quality: 40, order: "order.nail" }, ledgerCfg).state;
  s = recordWork(s, { kind: "smithing", quality: 70 }, ledgerCfg).state;
  s = recordWork(s, { kind: "swordplay", quality: 55 }, ledgerCfg).state;
  s = {
    ...s,
    titles: ["title.first", "title.s_rank", "title.a_rank"],
    society: { ...s.society, standing: "citizen", profession: "smith", achievedGoals: ["goal.x"] },
    time: { day: 41, action: 2 },
  };
  return s;
}

const titleDefs = [
  { id: "title.first", rank: "B" as const },
  { id: "title.s_rank", rank: "S" as const },
  { id: "title.a_rank", rank: "A" as const },
];

describe("年代記エントリの変換（lifeEntryOf）", () => {
  it("名・二つ名・日数・称号・立場・代表作・死因・シードを摘む", () => {
    const e = lifeEntryOf(rich(), "death", { titleDefs });
    expect(e.name).toBe("旅人");
    expect(e.epithet).toBe("title.s_rank"); // 最上位ランクを二つ名に
    expect(e.daysLived).toBe(42); // day 41（0始まり）→ 42日目
    expect(e.titles).toEqual(["title.first", "title.s_rank", "title.a_rank"]);
    expect(e.standing).toBe("citizen");
    expect(e.profession).toBe("smith");
    expect(e.achievedGoals).toEqual(["goal.x"]);
    expect(e.cause).toBe("death");
    expect(e.worldSeed).toBe("world-a");
    // 代表作は品質上位3件（同品質ならティア高い方）
    expect(e.notableWorks.map((w) => w.quality)).toEqual([70, 55, 40]);
    expect(e.notableWorks[0]).toMatchObject({ kind: "smithing", tier: 2 });
    expect(e.notableWorks[2]).toMatchObject({ order: "order.nail" });
  });

  it("称号定義が無ければ最後に獲得した称号を二つ名にし、称号が無ければ省略", () => {
    const withTitles = { ...base(), titles: ["t1", "t2"] };
    expect(lifeEntryOf(withTitles, "retire").epithet).toBe("t2");
    expect(lifeEntryOf(base(), "retire").epithet).toBeUndefined();
    // opts.epithet は最優先
    expect(lifeEntryOf(withTitles, "retire", { epithet: "custom", titleDefs }).epithet).toBe(
      "custom",
    );
  });

  it("作品が無い人生は代表作が空、日数は1日目が1", () => {
    const e = lifeEntryOf(base(), "oldAge");
    expect(e.notableWorks).toEqual([]);
    expect(e.daysLived).toBe(1);
    expect(e.profession).toBeNull();
  });

  it("biography と maxWorks を差し込める", () => {
    const e = lifeEntryOf(rich(), "retire", { biography: "鍛冶師として生きた。", maxWorks: 1 });
    expect(e.biography).toBe("鍛冶師として生きた。");
    expect(e.notableWorks).toHaveLength(1);
  });
});

describe("recordLife", () => {
  it("年代記に1頁を足す。入力は変更しない", () => {
    const c0 = emptyChronicle();
    const c1 = recordLife(c0, rich(), "death", { titleDefs });
    expect(c0.lives).toHaveLength(0); // 純粋関数
    expect(c1.lives).toHaveLength(1);
    const c2 = recordLife(c1, base(), "retire");
    expect(c2.lives).toHaveLength(2);
    expect(c2.lives[0]).not.toBe(c2.lives[1]);
  });
});

describe("年代記の読み書き", () => {
  it("serialize → deserialize の往復で同じ年代記になる", () => {
    let c = emptyChronicle();
    c = recordLife(c, rich(), "death", { titleDefs, biography: "狼と生きた。" });
    c = recordLife(c, base(), "oldAge");
    const round = deserializeChronicle(serializeChronicle(c));
    expect(round).toEqual(c);
    expect(round.version).toBe(CHRONICLE_VERSION);
  });

  it("空の年代記も往復できる", () => {
    const c = emptyChronicle();
    const round = deserializeChronicle(serializeChronicle(c));
    expect(round).toEqual({ version: CHRONICLE_VERSION, lives: [] });
  });
});

describe("バージョン移行", () => {
  it("v0 の年代記は v1 へ移行される（lives 欠損は空に）", () => {
    const migrated = deserializeChronicle(JSON.stringify({ version: 0 }));
    expect(migrated).toEqual({ version: 1, lives: [] });
  });

  it("v0 の lives はそのまま引き継がれる", () => {
    const lives = [{ name: "古の英雄", cause: "death", worldSeed: "old", daysLived: 99 }];
    const migrated = deserializeChronicle(JSON.stringify({ version: 0, lives }));
    expect(migrated.lives).toEqual(lives);
  });

  it("version が無い・未来・配列でない lives はエラー", () => {
    expect(() => deserializeChronicle("{}")).toThrow("version");
    expect(() => deserializeChronicle(JSON.stringify({ version: 999, lives: [] }))).toThrow(
      "未知のバージョン",
    );
    expect(() => deserializeChronicle(JSON.stringify({ version: 1, lives: "x" }))).toThrow();
    expect(() => deserializeChronicle("not json")).toThrow();
  });
});
