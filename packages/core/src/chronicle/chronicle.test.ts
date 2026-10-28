import { describe, expect, it } from "vitest";
import { recordWork, type LedgerConfig } from "../ledger/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import {
  CHRONICLE_VERSION,
  deserializeChronicle,
  emptyChronicle,
  hasLifeRecord,
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

  it("頂点に至ったルートID（T-41）を載せられる。無ければ省略", () => {
    const e = lifeEntryOf(rich(), "death", { pinnacles: ["sword_saint"] });
    expect(e.pinnacles).toEqual(["sword_saint"]);
    // 空・未指定は省略される
    expect(lifeEntryOf(rich(), "death").pinnacles).toBeUndefined();
    expect(lifeEntryOf(rich(), "death", { pinnacles: [] }).pinnacles).toBeUndefined();
  });

  it("代表技能（X-5）：最高到達値 peak の上位を載せる。技能を持たない生では省略", () => {
    const life = {
      ...rich(),
      player: {
        ...rich().player,
        skills: {
          // value（現在値）ではなく peak（最高到達値）を見る
          swordplay: { ...rich().player.skills["swordplay"]!, value: 10, peak: 80 },
          smithing: { ...rich().player.skills["smithing"]!, value: 55, peak: 55 },
          mining: {
            value: 0,
            peak: 0,
            pending: 0,
            potential: 100,
            potentialCap: 100,
            lastUsedDay: 0,
          },
        },
      },
    };
    const e = lifeEntryOf(life, "retire");
    expect(e.peakSkills).toEqual([
      { id: "swordplay", value: 80 }, // peak 80 > smithing 55。value 10 には惑わされない
      { id: "smithing", value: 55 },
    ]);
    // peak が 0 の技能は載せない
    expect(lifeEntryOf(base(), "retire").peakSkills).toBeUndefined();
  });

  it("代表技能は maxSkills 件まで。同値はスキルID順で決定論的に揃う", () => {
    const skills = Object.fromEntries(
      ["b_skill", "a_skill", "c_skill"].map((id) => [
        id,
        { value: 50, peak: 50, pending: 0, potential: 100, potentialCap: 100, lastUsedDay: 0 },
      ]),
    );
    const life = { ...base(), player: { ...base().player, skills } };
    // 同 peak なら ID 昇順。maxSkills で頭から切る
    expect(lifeEntryOf(life, "retire").peakSkills).toEqual([
      { id: "a_skill", value: 50 },
      { id: "b_skill", value: 50 },
      { id: "c_skill", value: 50 },
    ]);
    expect(lifeEntryOf(life, "retire", { maxSkills: 2 }).peakSkills).toHaveLength(2);
    expect(lifeEntryOf(life, "retire", { maxSkills: 0 }).peakSkills).toBeUndefined();
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

describe("hasLifeRecord（T-40：同じ一生の重複刻印を防ぐ）", () => {
  it("同じ世界・終わり方・日数・名の頁があれば true", () => {
    const life = rich(); // world-a・42日目・旅人
    const c = recordLife(emptyChronicle(), life, "death");
    expect(hasLifeRecord(c, life, "death")).toBe(true);
    // 終わり方が違えば別の頁
    expect(hasLifeRecord(c, life, "retire")).toBe(false);
    // 別の日・別の世界・別の名も別の頁
    expect(hasLifeRecord(c, { ...life, time: { ...life.time, day: 40 } }, "death")).toBe(false);
    expect(hasLifeRecord(c, { ...life, seed: "world-b" }, "death")).toBe(false);
    expect(hasLifeRecord(c, { ...life, player: { ...life.player, name: "別人" } }, "death")).toBe(
      false,
    );
  });

  it("転生フローの再入で同じ頁を二度書かない（冪等）", () => {
    const life = base();
    let c = recordLife(emptyChronicle(), life, "oldAge");
    if (!hasLifeRecord(c, life, "oldAge")) c = recordLife(c, life, "oldAge");
    expect(c.lives).toHaveLength(1);
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
  it("v0 の年代記は最新版へ移行される（lives 欠損は空に）", () => {
    const migrated = deserializeChronicle(JSON.stringify({ version: 0 }));
    expect(migrated).toEqual({ version: CHRONICLE_VERSION, lives: [] });
  });

  it("v0 の lives はそのまま引き継がれる", () => {
    const lives = [{ name: "古の英雄", cause: "death", worldSeed: "old", daysLived: 99 }];
    const migrated = deserializeChronicle(JSON.stringify({ version: 0, lives }));
    expect(migrated.lives).toEqual(lives);
  });

  it("v1 の年代記は最新版へ移行される（v2 頂点記録・T-41 経由）", () => {
    const lives = [{ name: "旧世代", cause: "retire", worldSeed: "w1", daysLived: 30 }];
    const migrated = deserializeChronicle(JSON.stringify({ version: 1, lives }));
    expect(migrated.version).toBe(CHRONICLE_VERSION);
    expect(migrated.lives).toEqual(lives); // pinnacles は任意フィールド。埋めない
  });

  it("v2 の年代記は最新版へ移行される（v3 代表技能・v4 ユニーク経由）", () => {
    // v2 時代の頁には peakSkills/uniques が無い。任意フィールドなので埋めるものはない
    const lives = [
      {
        name: "古の剣士",
        cause: "death",
        worldSeed: "w2",
        daysLived: 120,
        pinnacles: ["sword_saint"],
      },
    ];
    const migrated = deserializeChronicle(JSON.stringify({ version: 2, lives }));
    expect(migrated.version).toBe(CHRONICLE_VERSION);
    expect(migrated.lives).toEqual(lives); // 頁はそのまま。peakSkills/uniques は旧頁には無い
    expect(migrated.lives[0]!.peakSkills).toBeUndefined();
    expect(migrated.lives[0]!.uniques).toBeUndefined();
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
