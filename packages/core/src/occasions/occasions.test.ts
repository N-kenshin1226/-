import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import {
  OCCASION_RENOWN_KEY,
  occasionAttemptDayKey,
  occasionDef,
  occasionJoinDayKey,
  occasionOfferDayKey,
  occasionOfferKindDayKey,
  occasionOffers,
  occasionPending,
  occasionSpeaker,
  type OccasionDef,
  type OccasionsConfig,
} from "./index.js";

/**
 * 勝負所の行事（X-10、docs/03 §2）のテスト。
 * 打診が日付＋世界シードの独立した抽選で決まること（state.rng を消費しない）、
 * 条件・周期・間隔（同種が続かない）が効くこと、
 * 打診 → 応諾 → 勝負所 → 勝敗の刻印までが step の同じ道で通ることを確かめる
 */

const SKILL_IDS = [
  "swordplay",
  "evasion",
  "observation",
  "smithing",
  "mining",
  "eloquence",
  "fishing",
  "performance",
  "appraisal",
];

/**
 * 試験用の行事表：
 * - occ.fair：周期開催の品評会（day 1, 5, 9, ... にだけ候補になる。ミニゲームの皮）
 * - occ.duel：戦績を見る決闘（戦闘の器。ライバルが持ちかける）
 * - occ.deal：所持金を見る大取引（money 条件の試験台）
 * - occ.free：条件なし・周期なしの行楽（毎日候補。fair との同日抽選を確かめる）
 */
const OCCASIONS: OccasionDef[] = [
  {
    id: "occ.fair",
    name: "炉前の品評会",
    kind: "exhibition",
    speaker: { kind: "npc", id: "npc.fenn" },
    line: "品評会がある。出てみろ",
    every: { days: 4, offset: 1 },
    weight: 1,
    vessel: { kind: "minigame", skill: "smithing", targetQuality: 60 },
    win: { money: 100, renown: 2, flags: ["occasion.fair_winner"] },
    loss: { renown: -1 },
  },
  {
    id: "occ.duel",
    name: "果たし合い",
    kind: "duel",
    speaker: { kind: "rival", index: 0 },
    line: "果たし合おうではないか",
    require: { counter: "action.combat", gte: 1 },
    cooldownDays: 5,
    vessel: { kind: "combat", ref: "wolf" },
    win: { money: 60, renown: 3, flags: ["occasion.duel_winner"] },
    loss: { money: -20, renown: -1 },
  },
  {
    id: "occ.deal",
    name: "行商の大取引",
    kind: "deal",
    speaker: { kind: "npc", id: "npc.fenn" },
    line: "一山当てる話がある",
    require: { money: { gte: 100 } },
    vessel: { kind: "minigame", skill: "eloquence", targetQuality: 50 },
    win: { money: 80, renown: 1 },
    loss: { money: -30 },
  },
  {
    id: "occ.free",
    name: "賭け弓の市",
    kind: "fair",
    speaker: { kind: "npc", id: "npc.fenn" },
    line: "賭け弓の市が立つ",
    vessel: { kind: "minigame", skill: "fishing", targetQuality: 50 },
    win: { money: 10, renown: 1 },
  },
];

const occConfig = (over?: Partial<OccasionsConfig>): OccasionsConfig => ({
  occasions: OCCASIONS,
  offersPerDay: 2,
  offerChance: 1,
  secondChance: 1,
  cooldownDays: 6,
  kindGapDays: 3,
  combatWinScore: 0.5,
  combatFledScore: 0.35,
  npcs: [{ id: "npc.fenn", name: "炉職人の親方", role: "鍛冶職人" }],
  rivals: {
    names: ["レン", "ヒルダ", "ガゼル"],
    epithets: ["疾風", "孤狼"],
    size: 2,
    scoreMin: 10,
    scoreMax: 20,
    growthPerDay: 1,
  },
  ...over,
});

const cfgBase: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 4,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 40,
  gain: {
    base: { train: 1.0 },
    challengePoints: [
      [-20, 0.05],
      [0, 1.0],
      [10, 1.6],
      [30, 0],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 1.0,
    noveltyWindow: 10,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.8,
  },
  sleep: {
    nightlyCapPerSkill: 8.0,
    nightlyCapTotal: 999,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
    qualityMin: 0.6,
    qualityMax: 1.2,
    potentialDecayPerPoint: 0.01,
  },
  tailwind: {
    defs: [],
    tailwindFactor: 1.3,
    headwindFactor: 0.8,
    recentDays: 3,
    headwindBiasK: 1.5,
    tailwindBoostK: 0.5,
    drawMin: 1,
    drawMax: 2,
  },
  ledger: {
    basePricePerQuality: 2,
    marketWindowDays: 7,
    marketDecayPerWork: 0.9,
    tierUpBonusPending: 8,
  },
  combat: {
    baseHp: 30,
    hpPerEndurance: 2,
    attackBase: 5,
    attackPerWeaponSkill: 0.15,
    attackPerStrength: 0.2,
    ctBase: 12,
    ctPerAgility: 0.15,
    ctMin: 6,
    defendFactor: 0.5,
    fleeBase: 0.7,
    fleePerAgility: 0.02,
    observeBonus: 20,
    preciseObserve: 40,
    deathPendingFactor: 0.5,
    hitBase: 0.86,
    hitPerWeaponSkill: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerWeaponSkill: 0.002,
    critFactor: 1.8,
    enemyCritBase: 0.05,
    enemyCritFactor: 1.6,
    evadeBase: 0.06,
    evadePerEvasion: 0.004,
    evadePerAgilityDiff: 0.008,
    evadeMax: 0.7,
    readEvadeBonus: 0.5,
    guardTelegraphFactor: 0.15,
    counterFactor: 2.4,
    counterFactorRead: 2.8,
    openingTicks: 16,
    staggerTicks: 11,
  },
  body: {
    fatiguePerAction: { wait: 1, train: 6 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: { train: { strength: 2, endurance: 2, dexterity: 1 } },
    statGainPerLoad: 0.05,
    overloadThreshold: 15,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
  },
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
};

const cfg: StepConfig = { ...cfgBase, occasions: occConfig() };

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 50,
};

const startWorld = (seed: string): GameState => newGame(seed, "名無し", newGameCfg);

const sleepDays = (state: GameState, days: number, stepCfg: StepConfig = cfg): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, stepCfg).state;
  return s;
};

/** 打診の届く日まで眠って進める（届かなければ null） */
const waitForOffer = (
  state: GameState,
  id: string,
  maxDays = 30,
  stepCfg: StepConfig = cfg,
): GameState | null => {
  let s = state;
  for (let i = 0; i < maxDays; i++) {
    const offered = occasionOffers(s, stepCfg.occasions!);
    if (offered.some((o) => o.def.id === id)) return s;
    s = step(s, { type: "rest" }, stepCfg).state;
    if (occasionOffers(s, stepCfg.occasions!).some((o) => o.def.id === id)) return s;
  }
  return null;
};

describe("行事の抽選（日付＋世界シードの独立した乱数列）", () => {
  it("同じ世界・同じ日には同じ行事が届く（決定的）", () => {
    const g1 = startWorld("w-occ-det");
    const g2 = startWorld("w-occ-det");
    // 届くまで進める（rest → occasionPending が発行する）
    const r1 = step(g1, { type: "rest" }, cfg);
    const r2 = step(g2, { type: "rest" }, cfg);
    const ids1 = occasionOffers(r1.state, cfg.occasions!).map((o) => o.def.id);
    const ids2 = occasionOffers(r2.state, cfg.occasions!).map((o) => o.def.id);
    expect(ids1).toEqual(ids2);
  });

  it("行事の抽選は state.rng を消費しない", () => {
    const g = startWorld("w-occ-rng");
    const before = g.rng;
    const res = step(g, { type: "wait" }, cfg);
    // 打診が届いても世界を進める乱数列は進まない（独立した乱数列）
    // （step は状態を複製して触るので同一性ではなく内容の一致を見る）
    expect(res.state.rng).toStrictEqual(before);
  });

  it("候補がなければ届かない・届いた分は再び届かない（同日の重複なし）", () => {
    // 候補ゼロの設定
    const emptyCfg: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [], offerChance: 1 }),
    };
    const g = startWorld("w-occ-empty");
    const res = step(g, { type: "wait" }, emptyCfg);
    expect(res.events.some((e) => e.type === "occasionOffered")).toBe(false);

    // 届いた行事には日が刻まれ、同じ日に再び pending に現れない
    const offered = res.state.counters;
    void offered;
    const g2 = step(startWorld("w-occ-once"), { type: "wait" }, cfg);
    const today = occasionOffers(g2.state, cfg.occasions!);
    for (const o of today) {
      expect(g2.state.counters[occasionOfferDayKey(o.def.id)]).toBe(g2.state.time.day);
    }
    // pending は「届いた分」を除く
    const pending = occasionPending(g2.state, cfg.occasions!, cfg.time);
    for (const d of pending) {
      expect(today.every((o) => o.def.id !== d.id)).toBe(true);
    }
  });

  it("1日に届く行事は offersPerDay まで、同じ種類は同日に並ばない", () => {
    // 全日候補・確率 1 の設定では offersPerDay まで届く
    const allCfg: StepConfig = {
      ...cfgBase,
      occasions: occConfig({
        occasions: OCCASIONS.map((o) => ({ ...o, require: undefined, every: undefined })),
      }),
    };
    const g = step(startWorld("w-occ-max"), { type: "wait" }, allCfg);
    const offers = occasionOffers(g.state, allCfg.occasions!);
    expect(offers.length).toBeLessThanOrEqual(allCfg.occasions!.offersPerDay);
    expect(offers.length).toBe(2);
    const kinds = offers.map((o) => o.def.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("届かない日もある（offerChance 0 では決して届かない）", () => {
    const noCfg: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ offerChance: 0 }),
    };
    const g = step(startWorld("w-occ-never"), { type: "wait" }, noCfg);
    expect(g.events.some((e) => e.type === "occasionOffered")).toBe(false);
    expect(occasionOffers(g.state, noCfg.occasions!)).toEqual([]);
  });
});

describe("届く条件（提示条件・周期・間隔）", () => {
  it("周期開催の行事は開催日にだけ候補になる（every.days/offset）", () => {
    // occ.fair 単独表：day 1, 5, 9… にだけ届く
    const fairOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[0]!], offerChance: 1 }),
    };
    const g = startWorld("w-occ-every");
    // day0：届かない
    expect(occasionPending(g, fairOnly.occasions!, fairOnly.time)).toEqual([]);
    // day1：開催日 → 届く
    const g1 = step(g, { type: "rest" }, fairOnly);
    expect(occasionOffers(g1.state, fairOnly.occasions!).map((o) => o.def.id)).toEqual([
      "occ.fair",
    ]);
  });

  it("提示条件（require）を満たさない行事は届かない（戦績・所持金を見る）", () => {
    // 決闘は戦績、大取引は所持金を見る
    const duelDeal: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[1]!, OCCASIONS[2]!] }),
    };
    const g = step(startWorld("w-occ-req"), { type: "wait" }, duelDeal);
    // 何もしていない・所持金 50 の生にはどちらも届かない
    expect(occasionOffers(g.state, duelDeal.occasions!)).toEqual([]);
    // 戦績を積むと決闘が届く
    let g2 = startWorld("w-occ-req2");
    g2 = step(g2, { type: "combat", enemyId: "slime", difficulty: 5, won: true }, duelDeal).state;
    const after = step(g2, { type: "wait" }, duelDeal);
    expect(
      occasionOffers(after.state, duelDeal.occasions!).some((o) => o.def.id === "occ.duel"),
    ).toBe(true);
    // 所持金が足りると大取引が届く（money 条件）
    let g3 = startWorld("w-occ-req3");
    g3 = { ...g3, player: { ...g3.player, money: 150 } };
    const r3 = step(g3, { type: "wait" }, duelDeal);
    expect(occasionOffers(r3.state, duelDeal.occasions!).some((o) => o.def.id === "occ.deal")).toBe(
      true,
    );
  });

  it("届いた行事は cooldownDays の間は再び届かない", () => {
    // occ.duel 単独表：cooldownDays 5。一度届いたら5日は開かない
    const duelOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[1]!] }),
    };
    let g = startWorld("w-occ-cool");
    g = { ...g, counters: { ...g.counters, "action.combat": 3 } };
    // 届くまで進める
    const offered = waitForOffer(g, "occ.duel", 30, duelOnly);
    expect(offered).not.toBeNull();
    const day = offered!.time.day;
    // 翌日から cooldown 期間中は pending に現れない
    let s = sleepDays(offered!, 1, duelOnly);
    for (let d = 1; d < 5; d++) {
      expect(occasionPending(s, duelOnly.occasions!, duelOnly.time)).toEqual([]);
      s = sleepDays(s, 1, duelOnly);
      void day;
    }
  });

  it("打診を運ぶ者が街に居なければ、その者の行事は届かない（X-12の歳月）", () => {
    // occ.free は npc.fenn の打診。居ない者は打診を運べない
    const freeOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[3]!] }),
    };
    const alive = step(startWorld("w-occ-gone"), { type: "wait" }, freeOnly);
    expect(occasionOffers(alive.state, freeOnly.occasions!).map((o) => o.def.id)).toEqual([
      "occ.free",
    ]);
    let g = startWorld("w-occ-gone");
    g = { ...g, flags: { ...g.flags, "npc.gone.npc.fenn": true } };
    const res = step(g, { type: "wait" }, freeOnly);
    expect(occasionOffers(res.state, freeOnly.occasions!)).toEqual([]);
    expect(res.events.some((e) => e.type === "occasionOffered")).toBe(false);

    // ライバルの打診も同じ：果たし合いを持ちかける rival.0 が去っていれば届かない
    const duelOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[1]!] }),
    };
    let g2 = startWorld("w-occ-gone-rival");
    g2 = {
      ...g2,
      counters: { ...g2.counters, "action.combat": 3 },
      flags: { ...g2.flags, "npc.gone.rival.0": true },
    };
    const res2 = step(g2, { type: "wait" }, duelOnly);
    expect(occasionOffers(res2.state, duelOnly.occasions!)).toEqual([]);
  });

  it("同じ種類の行事は kindGapDays の間は続かない", () => {
    // 同種 kind "exhibition" の2行事を用意（どちらも fair に近い種類）
    const sameKind: OccasionDef[] = [
      { ...OCCASIONS[0]!, every: undefined, id: "occ.e1", name: "品評会・甲" },
      { ...OCCASIONS[0]!, every: undefined, id: "occ.e2", name: "品評会・乙" },
    ];
    const kindCfg: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: sameKind, kindGapDays: 3, offersPerDay: 1 }),
    };
    const g = startWorld("w-occ-kind");
    const first = step(g, { type: "wait" }, kindCfg);
    const today = occasionOffers(first.state, kindCfg.occasions!);
    expect(today.length).toBe(1);
    expect(first.state.counters[occasionOfferKindDayKey("exhibition")]).toBe(first.state.time.day);
    // 翌日・翌々日は同種が届かない
    let s = sleepDays(first.state, 1, kindCfg);
    expect(occasionPending(s, kindCfg.occasions!, kindCfg.time)).toEqual([]);
    s = sleepDays(s, 1, kindCfg);
    expect(occasionPending(s, kindCfg.occasions!, kindCfg.time)).toEqual([]);
  });
});

describe("打診への応えと勝負所（step 統合）", () => {
  /** 打診の届いた状態を作る（occ.free は無条件なので必ず届く） */
  const offered = (): { state: GameState; id: string } => {
    const freeOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[3]!] }),
    };
    const res = step(startWorld("w-occ-flow"), { type: "wait" }, freeOnly);
    const o = occasionOffers(res.state, freeOnly.occasions!)[0];
    expect(o?.def.id).toBe("occ.free");
    return { state: res.state, id: "occ.free" };
  };

  it("届いた打診にだけ応えられる。応えると join の刻印が立つ", () => {
    const { state, id } = offered();
    const res = step(state, { type: "occasionAccept", id }, cfg);
    expect(res.events.some((e) => e.type === "occasionJoined" && e.id === id)).toBe(true);
    expect(res.state.counters[occasionJoinDayKey(id)]).toBe(state.time.day);
    // 届いていない行事への応諾は何も起きない
    const bad = step(state, { type: "occasionAccept", id: "occ.duel" }, cfg);
    expect(bad.events.some((e) => e.type === "occasionJoined")).toBe(false);
    expect(bad.state.counters[occasionJoinDayKey("occ.duel")]).toBeUndefined();
    // 応諾は行動を消費しない
    expect(res.state.time.action).toBe(state.time.action);
  });

  it("応えていない行事には臨めない。臨むと勝敗が刻まれる", () => {
    const { state, id } = offered();
    // 未受諾では臨めない
    const early = step(state, { type: "occasionAttempt", id, score: 0.9 }, cfg);
    expect(early.events.some((e) => e.type === "occasionAttempted")).toBe(false);
    // 応諾 → 臨む（品質 0.8 ≥ 閾値 0.5 → 勝ち）
    const joined = step(state, { type: "occasionAccept", id }, cfg).state;
    const res = step(joined, { type: "occasionAttempt", id, score: 0.8 }, cfg);
    const ev = res.events.find((e) => e.type === "occasionAttempted");
    expect(ev).toBeDefined();
    expect(ev && "won" in ev && ev.won).toBe(true);
    // 行動・日付・勝敗の刻印
    expect(res.state.counters[occasionAttemptDayKey(id)]).toBe(res.state.time.day);
    expect(res.state.counters["occasion.won"]).toBe(1);
    expect(res.state.counters[`occasion.won.${id}`]).toBe(1);
    expect(res.state.flags[`occasion.won.${id}`]).toBe(true);
    // 行動ログに kind:occasion / variant:win が残る（新聞・記録が読む）
    const log = res.state.actionLog.at(-1);
    expect(log?.kind).toBe("occasion");
    expect(log?.target).toBe(id);
    expect(log?.variant).toBe("win");
    // 勝ちの効果：賞金・評判
    expect(res.state.player.money).toBe(joined.player.money + 10);
    expect(res.state.counters[OCCASION_RENOWN_KEY]).toBe(1);
  });

  it("出来が閾値に届かなければ敗けになる。敗けも記録される", () => {
    const { state, id } = offered();
    const joined = step(state, { type: "occasionAccept", id }, cfg).state;
    const res = step(joined, { type: "occasionAttempt", id, score: 0.2 }, cfg);
    const ev = res.events.find((e) => e.type === "occasionAttempted");
    expect(ev && "won" in ev && ev.won).toBe(false);
    expect(res.state.counters["occasion.lost"]).toBe(1);
    expect(res.state.flags[`occasion.lost.${id}`]).toBe(true);
    expect(res.state.actionLog.at(-1)?.variant).toBe("loss");
  });

  it("同じ行事には同じ日に二度臨めない", () => {
    const { state, id } = offered();
    let s = step(state, { type: "occasionAccept", id }, cfg).state;
    s = step(s, { type: "occasionAttempt", id, score: 0.9 }, cfg).state;
    const again = step(s, { type: "occasionAttempt", id, score: 0.9 }, cfg);
    expect(again.events.some((e) => e.type === "occasionAttempted")).toBe(false);
    expect(again.state.counters["occasion.won"]).toBe(1);
  });

  it("勝負所は行動を1つ消費し、体の負荷も乗る", () => {
    const { state, id } = offered();
    const joined = step(state, { type: "occasionAccept", id }, cfg).state;
    const res = step(joined, { type: "occasionAttempt", id, score: 0.9 }, cfg);
    expect(res.state.time.action).toBe(joined.time.action + 1);
    // 負荷は balance ではなく cfg.body の fatigueDefaultPerAction 系に乗る
    expect(res.state.player.fatigue).toBeGreaterThan(joined.player.fatigue);
  });

  it("決闘（戦闘の器）は score ≥ combatWinScore で勝ち・死は教会蘇生の刻印を残す", () => {
    const duelOnly: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[1]!] }),
    };
    let g = startWorld("w-occ-duel");
    g = { ...g, counters: { ...g.counters, "action.combat": 3 } };
    const offeredDuel = waitForOffer(g, "occ.duel", 30, duelOnly)!;
    expect(offeredDuel).not.toBeNull();
    const joined = step(offeredDuel, { type: "occasionAccept", id: "occ.duel" }, duelOnly).state;
    // score 0.5 ≥ combatWinScore 0.5 → 勝ち（決闘の閾値は器の品質ではなく balance 側）
    const win = step(joined, { type: "occasionAttempt", id: "occ.duel", score: 0.5 }, duelOnly);
    expect(win.events.find((e) => e.type === "occasionAttempted")?.won).toBe(true);
    expect(win.state.flags["occasion.duel_winner"]).toBe(true);

    // 別の生で死ぬ：died は戦闘と同じ教会蘇生（death.count が立つ）
    let g2 = startWorld("w-occ-die");
    g2 = { ...g2, counters: { ...g2.counters, "action.combat": 3 } };
    const o2 = waitForOffer(g2, "occ.duel", 30, duelOnly)!;
    const j2 = step(o2, { type: "occasionAccept", id: "occ.duel" }, duelOnly).state;
    const die = step(
      j2,
      { type: "occasionAttempt", id: "occ.duel", score: 0, died: true },
      duelOnly,
    );
    expect(die.events.some((e) => e.type === "died")).toBe(true);
    expect(die.state.counters["death.count"]).toBe(1);
    expect(die.state.counters["occasion.lost"]).toBe(1);
  });
});

describe("話し手（打診は人物から届く）", () => {
  it("住人の打診は名簿から名を引き、ライバルの打診は抽選の顔ぶれから引く", () => {
    const g = startWorld("w-occ-speaker");
    const npcDef = occasionDef(cfg.occasions!, "occ.fair")!;
    const sp = occasionSpeaker(g, cfg.occasions!, npcDef);
    expect(sp?.name).toBe("炉職人の親方");
    expect(sp?.role).toBe("鍛冶職人");
    const rivalDef = occasionDef(cfg.occasions!, "occ.duel")!;
    const rsp = occasionSpeaker(g, cfg.occasions!, rivalDef);
    expect(rsp?.name).not.toBeUndefined();
    expect(["レン", "ヒルダ", "ガゼル"]).toContain(rsp?.name);
    // 同じ世界では同じ顔ぶれ（世界シードの抽選。state.rng は消費しない）
    const g2 = startWorld("w-occ-speaker");
    expect(occasionSpeaker(g2, cfg.occasions!, rivalDef)?.name).toBe(rsp?.name);
  });
});

describe("勝敗が物語を動かす（称号・条件への接続）", () => {
  it("勝負所の勝ちは称号の条件になる（counter occasion.won）", () => {
    const titled: StepConfig = {
      ...cfgBase,
      occasions: occConfig({ occasions: [OCCASIONS[3]!] }),
      titles: [
        {
          id: "title.test_fair",
          rank: "A",
          condition: { counter: "occasion.won.occ.free", gte: 1 },
          effect: { note: "試験用" },
        },
      ],
    };
    let g = step(startWorld("w-occ-title"), { type: "wait" }, titled).state;
    g = step(g, { type: "occasionAccept", id: "occ.free" }, titled).state;
    const res = step(g, { type: "occasionAttempt", id: "occ.free", score: 0.9 }, titled);
    expect(res.events.some((e) => e.type === "titleGained" && e.id === "title.test_fair")).toBe(
      true,
    );
    expect(res.state.titles).toContain("title.test_fair");
  });
});
