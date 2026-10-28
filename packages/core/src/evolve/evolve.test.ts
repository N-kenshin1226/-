import { describe, expect, it } from "vitest";
import {
  branchScore,
  checkEvolution,
  checkRivalClaims,
  checkSynthesis,
  checkUniques,
  evolveTilts,
  pickEvolution,
  synthesisHintOf,
  type EvolutionConfig,
  type SynthesisRecipe,
  type UniquesConfig,
} from "./index.js";
import type { ArtDef, ArtsConfig } from "../arts/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/* ── K-03：技の進化・合成・ユニークスキル（docs/09 §7） ── */

const mkArt = (id: string, over?: Partial<ArtDef>): ArtDef => ({
  id,
  name: `技${id}`,
  skill: "swordplay",
  learn: {},
  kind: "attack",
  power: 1,
  ki: 3,
  ct: 1,
  desc: `${id}。`,
  ...over,
});

/** 分岐2つを持つ素の技＋派生形2つ＋隠し形1つ＋特別な技 */
const defs: Record<string, ArtDef> = {
  s_slash: mkArt("s_slash", {
    learn: { at: 4 },
    evolve: {
      branches: [
        {
          tilt: "群れ",
          reason: "群れへ放ち続けた",
          weights: { "foe.beast": 1, "foe.stronger": 0.5 },
          to: "s_slash__e0",
        },
        {
          tilt: "一点",
          reason: "急所を穿ち続けた",
          weights: { "aim.head": 1, "foe.single": 0.5 },
          to: "s_slash__e1",
        },
      ],
    },
  }),
  s_slash__e0: mkArt("s_slash__e0", { name: "群狼斬" }),
  s_slash__e1: mkArt("s_slash__e1", { name: "穿ち" }),
  s_slash__h0: mkArt("s_slash__h0", { name: "獣喰らい" }),
  x_resonance: mkArt("x_resonance", { name: "響き合いの太刀" }),
  x_unique: mkArt("x_unique", { name: "夜明け" }),
};

const ARTS: ArtsConfig = {
  defs,
  slots: 8,
  passiveSlots: 4,
  weaponSlots: 2,
  kiBase: 20,
  kiPerEndurance: 1.5,
  kiRegenPerTick: 0.45,
  manaBase: 15,
  manaPerSpirit: 1.2,
  levelStep: 8,
  maxLevel: 10,
  levelPowerFactor: 0.04,
  levelStatusFactor: 0.08,
  expBase: 1,
  expChallengeFactor: 0.02,
  partBreakShare: 0.35,
  breakDamageFactor: 1.15,
  breakAgilityFactor: 0.5,
  breakMoveFactor: 0.5,
  breakStatusFactor: 1.5,
  staggerFactor: 1.15,
  parryFactor: 0.15,
  parryCounterFactor: 2.6,
  evadeArtBonus: 0.55,
  guardArtFactor: 0.25,
  styleShareMin: 0.15,
};

const EVO: EvolutionConfig = { hiddenShareMin: 0.6 };
const EVO_HIDDEN: EvolutionConfig = {
  hiddenShareMin: 0.6,
  hidden: {
    s_slash: [
      {
        tilt: "獣",
        reason: "獣だけを屠り続けた",
        // 公開分岐を上回るのは「獣しか屠らない」極端な使い方のときだけ
        // （強敵を相手取る使い方には罰の重みを置く）
        weights: { "foe.beast": 2, "foe.stronger": -1 },
        to: "s_slash__h0",
        hidden: true,
      },
    ],
  },
};

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

const mkState = (over?: Partial<GameState>): GameState => ({
  ...newGame("seed-k03", "名無し", {
    skillIds: ["swordplay"],
    initialPotential: 100,
    initialStatValue: 10,
    arts: ARTS,
  }),
  ...over,
});

/** 使い方の記録（artTags）を直接積んだ state */
const withArtTags = (g: GameState, artId: string, tags: Record<string, number>): GameState => ({
  ...g,
  player: {
    ...g.player,
    artTags: { ...g.player.artTags, [artId]: tags },
  },
});

/** 技を持った state（lv 指定可） */
const withArt = (g: GameState, artId: string, lv = 1, slot = 0): GameState => ({
  ...g,
  player: {
    ...g.player,
    arts: { ...g.player.arts, [artId]: { lv, exp: 0, pending: 0 } },
    build: {
      ...g.player.build,
      slots: g.player.build.slots.map((s, i) => (i === slot ? artId : s)),
    },
  },
});

describe("分岐スコアと傾き（09 §7.1）", () => {
  it("スコアは Σ weight × share（use.total が母数）", () => {
    const artTags = { s_slash: { "use.total": 10, "foe.beast": 6, "foe.stronger": 2 } };
    // 6/10×1 + 2/10×0.5 = 0.7
    expect(branchScore(artTags, "s_slash", defs["s_slash"]!.evolve!.branches[0]!)).toBeCloseTo(0.7);
    // aim.head・foe.single は無記録 → 0
    expect(branchScore(artTags, "s_slash", defs["s_slash"]!.evolve!.branches[1]!)).toBe(0);
  });

  it("使用記録の無い技はスコア0", () => {
    expect(branchScore({}, "s_slash", defs["s_slash"]!.evolve!.branches[0]!)).toBe(0);
    expect(branchScore(undefined, "s_slash", defs["s_slash"]!.evolve!.branches[0]!)).toBe(0);
  });

  it("evolveTilts は公開分岐の傾きと強さだけを返す（進化先の名は出さない）", () => {
    const artTags = { s_slash: { "use.total": 10, "foe.beast": 8, "aim.head": 2 } };
    const tilts = evolveTilts(artTags, defs["s_slash"]!);
    expect(tilts).toHaveLength(2);
    expect(tilts[0]).toEqual({ tilt: "群れ", share: 0.8 });
    expect(tilts[1]!.tilt).toBe("一点");
    expect(tilts[1]!.share).toBeCloseTo(0.2);
    // 進化先ID・隠し分岐は含まれない
    for (const t of tilts) expect("to" in t).toBe(false);
  });

  it("evolve の無い技の傾きは空", () => {
    expect(evolveTilts({}, defs["x_unique"]!)).toEqual([]);
  });
});

describe("進化先の決定（pickEvolution）", () => {
  const g = () => withArt(mkState(), "s_slash", ARTS.maxLevel);

  it("最も使い方に合う分岐を選ぶ（選択制ではない）", () => {
    const s = withArtTags(g(), "s_slash", { "use.total": 10, "foe.beast": 9 });
    const pick = pickEvolution(s, defs["s_slash"]!, ARTS, EVO);
    expect(pick).toEqual({ to: "s_slash__e0", reason: "群れへ放ち続けた", hidden: false });
  });

  it("使用記録が無くても必ずどれかの分岐を選ぶ（先頭が既定）", () => {
    const pick = pickEvolution(g(), defs["s_slash"]!, ARTS, EVO);
    expect(pick).not.toBeNull();
    expect(pick!.to).toBe("s_slash__e0"); // 同点 → 分岐表の先頭（決定的）
  });

  it("進化先の定義が無い分岐は候補から外れる", () => {
    const partial: ArtsConfig = {
      ...ARTS,
      defs: Object.fromEntries(Object.entries(defs).filter(([k]) => k !== "s_slash__e0")) as Record<
        string,
        ArtDef
      >,
    };
    const s = withArtTags(g(), "s_slash", { "use.total": 10, "foe.beast": 10 });
    const pick = pickEvolution(s, defs["s_slash"]!, partial, EVO);
    expect(pick!.to).toBe("s_slash__e1");
  });

  it("隠し分岐：極端な使い方（主シェア≥閾値）で公開の最良を上回るときだけ通る", () => {
    // foe.beast 100% の極端な記録 → 隠し分岐（スコア1.0）が公開（0.8）を上回る
    const s = withArtTags(g(), "s_slash", { "use.total": 10, "foe.beast": 10 });
    const pick = pickEvolution(s, defs["s_slash"]!, ARTS, EVO_HIDDEN);
    expect(pick).toEqual({ to: "s_slash__h0", reason: "獣だけを屠り続けた", hidden: true });
  });

  it("隠し分岐：主シェアが閾値未満なら公開分岐に戻る", () => {
    // foe.beast 50%（閾値0.6未満）→ 隠し分岐は通らない
    const s = withArtTags(g(), "s_slash", {
      "use.total": 10,
      "foe.beast": 5,
      "aim.head": 3,
      "foe.single": 4,
    });
    const pick = pickEvolution(s, defs["s_slash"]!, ARTS, EVO_HIDDEN);
    expect(pick!.hidden).toBe(false);
    expect(pick!.to).toBe("s_slash__e0"); // 0.5+0 → beast側が辛勝
  });

  it("隠し分岐：極端でも公開の最良を上回らなければ公開分岐", () => {
    // foe.beast 80% で hiddenShareMin は越えるが、公開e0側も 0.8+α で
    // 隠し分岐の重みと同じタグなので公開が勝つ
    const s = withArtTags(g(), "s_slash", {
      "use.total": 10,
      "foe.beast": 8,
      "foe.stronger": 8,
    });
    const pick = pickEvolution(s, defs["s_slash"]!, ARTS, EVO_HIDDEN);
    // 公開e0: 0.8×1 + 0.8×0.5 = 1.2 > 隠し0.8
    expect(pick!.hidden).toBe(false);
    expect(pick!.to).toBe("s_slash__e0");
  });
});

describe("進化の適用（checkEvolution）", () => {
  it("Lv10 の技は進化形に入れ替わり Lv1 から育ち直す。構成の枠は引き継ぐ", () => {
    let g = withArt(mkState(), "s_slash", ARTS.maxLevel, 0);
    g = withArtTags(g, "s_slash", { "use.total": 10, "foe.beast": 9 });
    const r = checkEvolution(g, ARTS, EVO);
    expect(r.evolved).toEqual([
      { from: "s_slash", to: "s_slash__e0", reason: "群れへ放ち続けた", hidden: false },
    ]);
    expect(r.state.player.arts["s_slash"]).toBeUndefined();
    expect(r.state.player.arts["s_slash__e0"]).toEqual({ lv: 1, exp: 0, pending: 0 });
    expect(r.state.player.build.slots[0]).toBe("s_slash__e0");
    // 元の技の使用記録は歴史として残る
    expect(r.state.player.artTags["s_slash"]).toBeDefined();
    // カウンタは購読者の領分 —— ここでは刻まない
    expect(r.state.counters["art.evolved"]).toBeUndefined();
  });

  it("Lv10 未満の技は進化しない", () => {
    const g = withArt(mkState(), "s_slash", ARTS.maxLevel - 1);
    const r = checkEvolution(g, ARTS, EVO);
    expect(r.evolved).toEqual([]);
    expect(r.state.player.arts["s_slash"]?.lv).toBe(ARTS.maxLevel - 1);
  });

  it("分岐を持たない技・既に進化形を持つ技は対象外", () => {
    let g = withArt(mkState(), "x_unique", ARTS.maxLevel);
    const r1 = checkEvolution(g, ARTS, EVO);
    expect(r1.evolved).toEqual([]);
    // 既に進化形を持っている（前の周や別経路で得た）場合も化けない
    g = withArt(g, "s_slash", ARTS.maxLevel);
    g = withArt(g, "s_slash__e0", 3);
    g = withArtTags(g, "s_slash", { "use.total": 10, "foe.beast": 10 });
    const r2 = checkEvolution(g, ARTS, EVO);
    expect(r2.evolved).toEqual([]);
    expect(r2.state.player.arts["s_slash"]?.lv).toBe(ARTS.maxLevel);
  });
});

describe("合成（checkSynthesis、09 §7「響き合い」）", () => {
  const recipes: SynthesisRecipe[] = [
    {
      to: "x_resonance",
      condition: { and: [{ art: "s_slash" }, { skill: "swordplay", gte: 10 }] },
      hint: "剣の技と剣の極意が響き合うらしい",
    },
  ];

  it("条件を満たすと特別な技が生まれる（learn.at を持たない技でも）", () => {
    let g = withArt(mkState(), "s_slash");
    g = {
      ...g,
      player: {
        ...g.player,
        skills: {
          ...g.player.skills,
          swordplay: { ...g.player.skills["swordplay"]!, value: 12, peak: 12 },
        },
      },
    };
    const r = checkSynthesis(g, recipes, TIME);
    expect(r.learned).toEqual(["x_resonance"]);
    expect(r.state.player.arts["x_resonance"]).toEqual({ lv: 1, exp: 0, pending: 0 });
  });

  it("条件が足りなければ生まれない／既に持っていれば二度と生まれない", () => {
    const g = withArt(mkState(), "s_slash"); // 技能0
    expect(checkSynthesis(g, recipes, TIME).learned).toEqual([]);
    const owned = withArt(g, "x_resonance");
    const high = {
      ...owned,
      player: {
        ...owned.player,
        skills: {
          ...owned.player.skills,
          swordplay: { ...owned.player.skills["swordplay"]!, value: 99, peak: 99 },
        },
      },
    };
    expect(checkSynthesis(high, recipes, TIME).learned).toEqual([]);
  });

  it("合成の噂は未獲得レシピから seed×日付で決定的に引く", () => {
    const arts = {};
    const h1 = synthesisHintOf("seed-a", 3, recipes, arts);
    const h2 = synthesisHintOf("seed-a", 3, recipes, arts);
    expect(h1?.hint).toBe("剣の技と剣の極意が響き合うらしい");
    expect(h1?.to).toBe(h2?.to);
    // 獲得済みのレシピはヒントに出ない
    expect(synthesisHintOf("seed-a", 3, recipes, { x_resonance: {} })).toBeNull();
  });
});

describe("ユニークスキル（09 §7「世界に一つだけ」）", () => {
  const UNIQUES: UniquesConfig = {
    uniques: [
      {
        art: "x_unique",
        condition: { counter: "kill.total", gte: 5 },
        rival: { dayMin: 2, chance: 0.5 },
      },
    ],
    rivalSize: 4,
  };

  it("条件を満たすと技を得て state.uniques に holder=player で刻む", () => {
    const g: GameState = { ...mkState(), counters: { "kill.total": 5 } };
    const r = checkUniques(g, UNIQUES, TIME);
    expect(r.gained).toEqual(["x_unique"]);
    expect(r.state.player.arts["x_unique"]).toEqual({ lv: 1, exp: 0, pending: 0 });
    expect(r.state.uniques["x_unique"]).toEqual({ holder: "player", day: 0 });
  });

  it("誰かの手に渡ったユニークは二度と得られない", () => {
    const g: GameState = {
      ...mkState(),
      counters: { "kill.total": 99 },
      uniques: { x_unique: { holder: "rival.2", day: 1 } },
    };
    const r = checkUniques(g, UNIQUES, TIME);
    expect(r.gained).toEqual([]);
    expect(r.state.player.arts["x_unique"]).toBeUndefined();
    expect(r.state.uniques["x_unique"]?.holder).toBe("rival.2");
  });

  it("ライバルの先取りは決定的（同じ世界・日なら同じ結末。state.rng を消費しない）", () => {
    const g = mkState();
    const r1 = checkRivalClaims(g, UNIQUES, 5);
    const r2 = checkRivalClaims(g, UNIQUES, 5);
    expect(JSON.stringify(r1.state.uniques)).toBe(JSON.stringify(r2.state.uniques));
    expect(r1.claimed).toEqual(r2.claimed);
    // 主乱数列は消費していない（先取りは世界シード×技×日の独立した列）
    expect(r1.state.rng).toBe(g.rng);
    // 先取りが起きた場合は rival.<index> の持ち主が記録に残る
    for (const c of r1.claimed) {
      expect(r1.state.uniques[c.art]?.holder).toBe(`rival.${c.rivalIndex}`);
      expect(r1.state.uniques[c.art]?.day).toBe(5);
    }
  });

  it("dayMin 前の日・既に持ち主のいるユニーク・rivalSize0 では先取りが起きない", () => {
    const g = mkState();
    expect(checkRivalClaims(g, UNIQUES, 1).claimed).toEqual([]); // dayMin=2 前
    const held: GameState = {
      ...mkState(),
      uniques: { x_unique: { holder: "player", day: 0 } },
    };
    expect(checkRivalClaims(held, UNIQUES, 9).claimed).toEqual([]);
    expect(checkRivalClaims(mkState(), { ...UNIQUES, rivalSize: 0 }, 9).claimed).toEqual([]);
  });

  it("先取り確率は日数を重ねるほどどこかで発火する（決定的な列のどこかで chance を割る）", () => {
    // chance0.5・20日分の列のどこかでは rival が取るはず（確率論的にほぼ確実・
    // かつ列は決定的なのでフレークしない）
    const g = mkState();
    const claimedDay = Array.from(
      { length: 20 },
      (_, d) => checkRivalClaims(g, UNIQUES, d + 2).claimed.length,
    );
    expect(claimedDay.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
