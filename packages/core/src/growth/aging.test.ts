import { describe, expect, it } from "vitest";
import {
  ageBand,
  agingOnWake,
  agingSignStage,
  lifespanProgress,
  reachedLifespan,
  type AgingConfig,
} from "./aging.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";

/**
 * T-36 寿命・加齢の決定論テスト。
 * 1年 = daysPerSeason(28) × seasonsPerYear(4) = 112 日。
 * 年齢 = startAge(15) + floor(day / 112)
 */

const DAYS_PER_YEAR = 28 * 4; // 112
const START_AGE = 15;
/** 年齢 age になる最初の日 */
const dayOfAge = (age: number): number => (age - START_AGE) * DAYS_PER_YEAR;

// テスト用の係数は balance.json とは別に、差がはっきり出る値を使う
const aging: AgingConfig = {
  lifespanYears: 40, // 55歳で寿命
  signWarnAt: 0.7, // 経過28年（43歳）から弱い兆候
  signSevereAt: 0.9, // 経過36年（51歳）から強い兆候
  signEveryDays: 28,
  bands: [
    { upToAge: 24, statFactor: 2.0, skillFactor: 0.5 },
    { upToAge: 39, statFactor: 1.0, skillFactor: 1.0 },
    { upToAge: 999, statFactor: 0.5, skillFactor: 2.0 },
  ],
  texts: { warn: "WARN-LINE", severe: "SEVERE-LINE" },
};

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];
const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

const cfg: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: START_AGE,
  },
  actionLogMax: 100,
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
    carryoverRatio: 0.5,
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
    attackPerSwordplay: 0.15,
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
    hitPerSwordplay: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerSwordplay: 0.002,
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
  aging,
};

/** day を指定した state（step が内部で複製するので直接書き換えてよい） */
const atDay = (g: GameState, day: number): GameState => ({
  ...g,
  time: { day, action: 0 },
});

describe("ageBand: 年齢帯の選択", () => {
  it("age <= upToAge の最初の帯が返る（境界値）", () => {
    expect(ageBand(15, aging).upToAge).toBe(24);
    expect(ageBand(24, aging).upToAge).toBe(24);
    expect(ageBand(25, aging).upToAge).toBe(39);
    expect(ageBand(39, aging).upToAge).toBe(39);
    expect(ageBand(40, aging).upToAge).toBe(999);
    expect(ageBand(999, aging).upToAge).toBe(999);
  });

  it("どの帯にも入らない（全帯を越える）場合は末尾の帯", () => {
    const narrow: AgingConfig = {
      ...aging,
      bands: [{ upToAge: 20, statFactor: 2, skillFactor: 0.5 }],
    };
    expect(ageBand(80, narrow).statFactor).toBe(2);
  });

  it("帯ごとに statFactor / skillFactor の大小関係が逆転する（若い=身体、高齢=技と知恵）", () => {
    const young = ageBand(20, aging);
    const old = ageBand(60, aging);
    expect(young.statFactor).toBeGreaterThan(old.statFactor);
    expect(young.skillFactor).toBeLessThan(old.skillFactor);
  });
});

describe("lifespanProgress / agingSignStage / reachedLifespan", () => {
  it("寿命経過は経過年/寿命年（開始前は 0）", () => {
    expect(lifespanProgress(15, START_AGE, aging)).toBe(0);
    expect(lifespanProgress(35, START_AGE, aging)).toBe(0.5); // 経過20/寿命40
    expect(lifespanProgress(55, START_AGE, aging)).toBe(1);
  });

  it("兆候段階の境界値：70% 弱い兆候、90% 強い兆候", () => {
    // 経過27年（42歳）= 67.5% → なし
    expect(agingSignStage(42, START_AGE, aging)).toBe(0);
    // 経過28年（43歳）= 70% → 弱い兆候（ちょうどの境界でも発火する）
    expect(agingSignStage(43, START_AGE, aging)).toBe(1);
    // 経過35年（50歳）= 87.5% → まだ弱い
    expect(agingSignStage(50, START_AGE, aging)).toBe(1);
    // 経過36年（51歳）= 90% → 強い兆候
    expect(agingSignStage(51, START_AGE, aging)).toBe(2);
    expect(agingSignStage(55, START_AGE, aging)).toBe(2);
  });

  it("寿命到達は startAge + lifespanYears（55歳）の境界で", () => {
    expect(reachedLifespan(54, START_AGE, aging)).toBe(false);
    expect(reachedLifespan(55, START_AGE, aging)).toBe(true);
    expect(reachedLifespan(60, START_AGE, aging)).toBe(true);
  });
});

describe("agingOnWake: 兆候と老衰死", () => {
  const wake = (g: GameState) => agingOnWake(g, aging, cfg.time, cfg.combat.deathPendingFactor);

  it("兆候の境界日の朝に oldAgeSign が出る（前日までは出ない）", () => {
    // dayOfAge(43)-1 日の朝（年齢42）では出ない
    const r0 = wake(atDay(newGame("a1", "t", newGameCfg), dayOfAge(43) - 1));
    expect(r0.signLine).toBeNull();
    expect(r0.events).toEqual([]);

    const at43 = atDay(newGame("a1", "t", newGameCfg), dayOfAge(43));
    const r1 = wake(at43);
    expect(r1.signLine).toBe("WARN-LINE");
    expect(r1.events).toEqual([{ type: "oldAgeSign", stage: 1, age: 43 }]);
    expect(r1.state.counters["aging.signStage"]).toBe(1);
    expect(r1.state.counters["aging.signDay"]).toBe(dayOfAge(43));
  });

  it("弱い兆候は同じ段階では繰り返さない（次の朝は出ない）", () => {
    const r1 = wake(atDay(newGame("a2", "t", newGameCfg), dayOfAge(43)));
    const r2 = wake({ ...r1.state, time: { day: dayOfAge(43) + 1, action: 0 } });
    expect(r2.signLine).toBeNull();
    expect(r2.events).toEqual([]);
  });

  it("強い兆候に段階が上がると severe が出て、間隔を置いて繰り返す", () => {
    let g = wake(atDay(newGame("a3", "t", newGameCfg), dayOfAge(43))).state; // stage 1
    const r = wake(atDay(g, dayOfAge(51)));
    expect(r.signLine).toBe("SEVERE-LINE");
    expect(r.events).toEqual([{ type: "oldAgeSign", stage: 2, age: 51 }]);
    g = r.state;
    // 間隔（28日）未満では繰り返さない
    const r2 = wake(atDay(g, dayOfAge(51) + 27));
    expect(r2.signLine).toBeNull();
    // 28日後には再度出る
    const r3 = wake(atDay(g, dayOfAge(51) + 28));
    expect(r3.signLine).toBe("SEVERE-LINE");
    expect(r3.events).toEqual([{ type: "oldAgeSign", stage: 2, age: 51 }]);
  });

  it("途中開始（すでに強い兆候の年齢）は一度だけ severe が出る", () => {
    const r = wake(atDay(newGame("a4", "t", newGameCfg), dayOfAge(53)));
    expect(r.signLine).toBe("SEVERE-LINE");
    expect(r.events).toEqual([{ type: "oldAgeSign", stage: 2, age: 53 }]);
    expect(r.state.counters["aging.signStage"]).toBe(2);
  });

  it("寿命の朝に deathByAge と died が出て、pending が半減する。二度目は出ない", () => {
    const g0 = newGame("a5", "t", newGameCfg);
    g0.player.skills.swordplay = { ...g0.player.skills.swordplay!, pending: 10 };
    const r = wake(atDay(g0, dayOfAge(55)));
    expect(r.events).toEqual([
      { type: "oldAgeSign", stage: 2, age: 55 }, // 兆候も寿命到達も同じ朝なら両方出る
      { type: "deathByAge", age: 55 },
      { type: "died" },
    ]);
    expect(r.state.counters["death.count"]).toBe(1);
    expect(r.state.counters["death.oldAge"]).toBe(dayOfAge(55));
    expect(r.state.player.skills.swordplay!.pending).toBe(5);

    // 翌朝は死なない（death.oldAge で一度だけ。T-40 で生が終わるまでの暫定措置）
    const r2 = wake(atDay(r.state, dayOfAge(55) + 1));
    expect(r2.events.some((e) => e.type === "deathByAge" || e.type === "died")).toBe(false);
  });
});

describe("step: 睡眠の統合", () => {
  it("兆候の朝に sleep すると oldAgeSign イベントと起床サプライズ行が出る", () => {
    const g = atDay(newGame("s1", "t", newGameCfg), dayOfAge(43) - 1);
    const r = step(g, { type: "sleep" }, cfg);
    const sign = r.events.find((e) => e.type === "oldAgeSign");
    expect(sign).toEqual({ type: "oldAgeSign", stage: 1, age: 43 });
    const report = r.events.find((e) => e.type === "wakeReport");
    expect(report?.type === "wakeReport" && report.report.surprises).toContain("WARN-LINE");
    // イベント順: slept → wakeReport → oldAgeSign
    const types = r.events.map((e) => e.type);
    expect(types.indexOf("slept")).toBeLessThan(types.indexOf("wakeReport"));
    expect(types.indexOf("wakeReport")).toBeLessThan(types.indexOf("oldAgeSign"));
  });

  it("寿命の朝に sleep すると deathByAge → died が出て pending が半減する", () => {
    const g = atDay(newGame("s2", "t", newGameCfg), dayOfAge(55) - 1);
    // 定着上限を超える pending を積んでおく（cap=8×質0.85=6.8 → 持越しがあり半減を検査できる）
    g.player.skills.swordplay = { ...g.player.skills.swordplay!, pending: 30 };
    const r = step(g, { type: "sleep" }, cfg);
    const types = r.events.map((e) => e.type);
    expect(types).toContain("deathByAge");
    expect(types.indexOf("deathByAge")).toBeLessThan(types.indexOf("died"));
    const death = r.events.find((e) => e.type === "deathByAge");
    expect(death?.type === "deathByAge" && death.age).toBe(55);
    expect(r.state.counters["death.count"]).toBe(1);
    // 持ち越し 11.6 → 半減で 5.8
    expect(r.state.player.skills.swordplay!.pending).toBeCloseTo(5.8, 10);
  });

  it("aging 未指定なら兆候も老衰も起きない（後方互換）", () => {
    const { aging: _omit, ...noAging } = cfg;
    const g = atDay(newGame("s3", "t", newGameCfg), dayOfAge(55) - 1);
    const r = step(g, { type: "sleep" }, noAging);
    expect(r.events.some((e) => e.type === "oldAgeSign" || e.type === "deathByAge")).toBe(false);
    expect(r.state.counters["death.count"] ?? 0).toBe(0);
  });
});

describe("step: 年齢帯で成長係数が変わる", () => {
  /** 同じシード・同じ行動を、若い年齢と高齢で行って睡眠後の伸びを比べる */
  const growthAt = (day: number) => {
    let g = atDay(newGame("age-sim", "t", newGameCfg), day);
    g = step(g, { type: "train", skill: "swordplay", difficulty: 10 }, cfg).state;
    g = step(g, { type: "train", skill: "swordplay", difficulty: 10 }, cfg).state;
    const before = { skill: g.player.skills.swordplay!.value, str: g.player.stats.strength };
    g = step(g, { type: "sleep" }, cfg).state;
    return {
      skillDelta: g.player.skills.swordplay!.value - before.skill,
      strDelta: g.player.stats.strength - before.str,
    };
  };

  it("若い帯は基礎能力が伸び、高齢帯はスキルが伸びる（決定論・係数差）", () => {
    const young = growthAt(dayOfAge(20)); // 帯1: stat 2.0 / skill 0.5
    const old = growthAt(dayOfAge(50)); // 帯3: stat 0.5 / skill 2.0（寿命未到達で死亡イベントは出ない）
    // 同じシード・同じ行動 → pending・負荷・睡眠の質は同一。差は係数だけ
    expect(old.skillDelta).toBeCloseTo(young.skillDelta * 4, 10); // 2.0 / 0.5
    expect(young.strDelta).toBeCloseTo(old.strDelta * 4, 10); // 2.0 / 0.5
    expect(old.skillDelta).toBeGreaterThan(young.skillDelta);
    expect(young.strDelta).toBeGreaterThan(old.strDelta);
  });

  it("中間帯（係数1.0）の伸びは係数なしと同じ", () => {
    const mid = growthAt(dayOfAge(30)); // 帯2: 1.0 / 1.0
    // 予想: pending = B1.0×C0.6(訓練上限)×(N 1 + 0.5×F0.99712) = 0.899136 を全定着。
    // str: 負荷4×statGainPerLoad0.05×質0.85
    expect(mid.skillDelta).toBeCloseTo(0.899136, 5);
    expect(mid.strDelta).toBeCloseTo(4 * 0.05 * 0.85, 5);
  });
});
