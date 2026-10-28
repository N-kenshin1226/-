import { describe, expect, it } from "vitest";
import {
  heirGenerationOf,
  heirKindOf,
  heirLegacyOf,
  succeedLife,
  type HeirConfig,
} from "./index.js";
import { legacyOf, type LegacyConfig } from "../legacy/index.js";
import { newGame } from "../state/newGame.js";
import { serialize, deserialize, SAVE_VERSION } from "../save/index.js";
import type { GameState, Work } from "../state/types.js";

/** T-48 の係数（balance.heir は legacy の半分・低い上限） */
const CFG: HeirConfig = { potentialFactor: 0.05, potentialMax: 10 };
const LEGACY_CFG: LegacyConfig = {
  potentialFactor: 0.1,
  potentialMax: 15,
  rememberedMax: 3,
  artifactGainFactor: 1.05,
};

const base = (): GameState =>
  newGame("t", "前代", {
    skillIds: ["smithing", "mining"],
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
  });

const work = (id: string, quality: number): Work => ({
  id,
  kind: "smithing",
  maker: "前代",
  quality,
  tier: 1,
  flags: [],
  day: 1,
  worldSeed: "t",
  marketValue: 0,
});

const lifeInit = () => ({
  skillIds: ["smithing", "mining"],
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 0,
});

describe("heirKindOf（T-48 次代の立ち位置）", () => {
  it("弟子入り歴がなければ子", () => {
    expect(heirKindOf(base())).toBe("child");
  });

  it("弟子入り中なら弟子", () => {
    const s = base();
    s.mentor = { id: "mentor.garo", sinceDay: 3 };
    expect(heirKindOf(s)).toBe("disciple");
  });

  it("門を出ていても稽古歴（mentor.session.*）があれば弟子", () => {
    const s = base();
    s.counters["mentor.session.mentor.garo"] = 4;
    expect(heirKindOf(s)).toBe("disciple");
    // 他のカウンタは弟子入り歴とみなさない
    const s2 = base();
    s2.counters["action.train"] = 30;
    expect(heirKindOf(s2)).toBe("child");
  });
});

describe("heirLegacyOf（T-48 弱い引継ぎ）", () => {
  it("素質補正は legacy より小さい係数・低い上限（記憶称号・遺物は渡さない）", () => {
    const s = base();
    s.player.skills["smithing"]!.peak = 80; // heir: 80×0.05 → +4（legacy なら +8）
    s.player.skills["mining"]!.peak = 500; // heir: 上限10（legacy なら 15）
    s.titles = ["title.master_smith"];
    s.ledger = [work("a", 90)];
    const l = heirLegacyOf(s, CFG);
    expect(l.potentialBonus["smithing"]).toBe(4);
    expect(l.potentialBonus["mining"]).toBe(10);
    // 弱い引継ぎ：legacy と同じ計算式で係数だけ小さい（称号・遺物は渡さない）
    const strong = legacyOf(s, LEGACY_CFG);
    expect(l.potentialBonus["smithing"]).toBeLessThan(strong.potentialBonus["smithing"]!);
    expect(l.rememberedTitles).toEqual([]);
    expect(l.artifact).toBeNull();
  });
});

describe("succeedLife（T-48 同じ世界で次代を継ぐ）", () => {
  it("世界シードは不変：転生（:next:）とは別系統で同じ世界に生まれる", () => {
    const prev = base();
    prev.time.day = 40;
    const { state: next } = succeedLife(prev, "次代", lifeInit(), CFG);
    expect(next.seed).toBe("t"); // nextWorldSeed ではなく同じ seed
    expect(next.time.day).toBe(0);
    expect(next.player.name).toBe("次代");
    // 新しい生なので周の持ち物は初期状態
    expect(next.titles).toEqual([]);
    expect(next.ledger).toEqual([]);
  });

  it("弱い引継ぎは素質の底上げとして焼き込まれる", () => {
    const prev = base();
    prev.player.skills["smithing"]!.peak = 80;
    const { state: next, legacy } = succeedLife(prev, "次代", lifeInit(), CFG);
    expect(legacy.potentialBonus["smithing"]).toBe(4);
    expect(next.player.skills["smithing"]!.potential).toBe(104);
    expect(next.player.skills["smithing"]!.potentialCap).toBe(104);
    // 記憶称号・遺物は引き継がない
    expect(next.titles).toEqual([]);
    expect(next.legacy?.artifact).toBeNull();
  });

  it("世代の刻印：heir.count が増え、kind のフラグが立つ", () => {
    const first = base();
    const g2 = succeedLife(first, "二代", lifeInit(), CFG);
    expect(g2.kind).toBe("child");
    expect(g2.state.counters["heir.count"]).toBe(1);
    expect(g2.state.flags["heir.child"]).toBe(true);
    expect(heirGenerationOf(g2.state)).toBe(2);
    // さらに継ぐと世代が進む（count は前代から引き継ぐ）
    const g3 = succeedLife(g2.state, "三代", lifeInit(), CFG);
    expect(g3.state.counters["heir.count"]).toBe(2);
    expect(heirGenerationOf(g3.state)).toBe(3);
    // 初代には刻印がない
    expect(first.counters["heir.count"]).toBeUndefined();
    expect(heirGenerationOf(first)).toBe(1);
  });

  it("弟子入り歴のある前代からは弟子が継ぐ", () => {
    const prev = base();
    prev.mentor = { id: "mentor.garo", sinceDay: 10 };
    const { state: next, kind } = succeedLife(prev, "弟子", lifeInit(), CFG);
    expect(kind).toBe("disciple");
    expect(next.flags["heir.disciple"]).toBe(true);
    expect(next.flags["heir.child"]).toBeUndefined();
  });

  it("決定論：同じ前代・同じ設定なら同じ次代が生まれる", () => {
    const prev = base();
    prev.player.skills["smithing"]!.peak = 60;
    const a = succeedLife(prev, "次代", lifeInit(), CFG);
    const b = succeedLife(prev, "次代", lifeInit(), CFG);
    expect(a.state).toEqual(b.state);
  });

  it("世界の傾向は前世のものを引き継げる（呼び出し側が tendency を渡す）", () => {
    const prev = { ...base(), tendency: "war" as const };
    const { state: next } = succeedLife(
      prev,
      "次代",
      { ...lifeInit(), tendency: prev.tendency },
      CFG,
    );
    expect(next.tendency).toBe("war");
  });

  it("GameState の形は変わらない：counters/flags だけに刻むので往復できる（v16 は W-01 の危機由来）", () => {
    const prev = base();
    const { state: next } = succeedLife(prev, "次代", lifeInit(), CFG);
    const restored = deserialize(serialize(next));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored).toEqual(next);
    // T-48 自体は形を変えない。17=K-01（武器）、18=P-02（日々の営み）、19=K-02（武技・資源・構成）、20=K-03（ユニーク）
    expect(SAVE_VERSION).toBe(20);
  });
});
