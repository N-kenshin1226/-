import { describe, expect, it } from "vitest";
import {
  canFightUnique,
  combatResult,
  enhancedEnemy,
  startCombat,
  turn,
  type CombatConfig,
  type EnemyDef,
  type UniqueConfig,
} from "./index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";

const cfg: CombatConfig = {
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
};

const unique: UniqueConfig = {
  afterKills: 3,
  hpFactor: 1.6,
  powerFactor: 1.5,
  challengeBonus: 10,
  agilityBonus: 2,
};

const wolf: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 18,
  intervalTicks: 10,
  challenge: 15,
  agility: 5,
  attack: { id: "bite", name: "咬みつき", power: 4 },
  moves: { pounce: { id: "pounce", name: "飛びかかり", power: 9 } },
  pattern: [
    { type: "attack" },
    { type: "attack" },
    { type: "telegraph", move: "pounce", ticks: 8 },
  ],
};

const mkPlayer = (obs: number, agility = 0, sword = 10) => ({
  stats: {
    strength: 10,
    endurance: 10,
    agility,
    dexterity: 0,
    perception: 0,
    spirit: 0,
  },
  skills: {
    observation: { value: obs },
    swordplay: { value: sword },
    evasion: { value: 5 },
  },
});

const CTX = { skill: 0, seed: "unique-test" };

describe("強化版ユニーク（T-44、06 §3B）", () => {
  it("enhancedEnemy は数値だけを強化し、パターンはそのまま", () => {
    const ue = enhancedEnemy(wolf, unique);
    expect(ue.hp).toBe(Math.round(18 * 1.6));
    expect(ue.challenge).toBe(15 + 10);
    expect(ue.agility).toBe(5 + 2);
    expect(ue.attack.power).toBe(Math.round(4 * 1.5));
    expect(ue.moves["pounce"]!.power).toBe(Math.round(9 * 1.5));
    // 行動パターン・技名・id は素の敵のものを引き継ぐ
    expect(ue.pattern).toEqual(wolf.pattern);
    expect(ue.id).toBe("wolf");
    expect(ue.intervalTicks).toBe(wolf.intervalTicks);
  });

  it("同種を afterKills 体倒すと解禁される", () => {
    expect(canFightUnique({ counters: {} }, "wolf", unique)).toBe(false);
    expect(canFightUnique({ counters: { "kill.species.wolf": 2 } }, "wolf", unique)).toBe(false);
    expect(canFightUnique({ counters: { "kill.species.wolf": 3 } }, "wolf", unique)).toBe(true);
    // 別種の討伐数では解禁されない
    expect(canFightUnique({ counters: { "kill.species.boar": 3 } }, "wolf", unique)).toBe(false);
  });

  it("強個体は同じシードと行動列で同じ結果になる（決定的）", () => {
    const ue = enhancedEnemy(wolf, unique);
    const run = () => {
      let s = startCombat(ue, cfg, mkPlayer(0));
      while (!s.done) s = turn(s, "attack", ue, cfg, CTX);
      return combatResult(s);
    };
    expect(run()).toEqual(run());
  });

  it("強個体は素の敵より強い（同じ行動列では倒しきれない or 遅い）", () => {
    const ue = enhancedEnemy(wolf, unique);
    const ticksOf = (e: EnemyDef) => {
      let s = startCombat(e, cfg, mkPlayer(0));
      while (!s.done) s = turn(s, "attack", e, cfg, CTX);
      return combatResult(s).ticks;
    };
    // HP1.6倍・攻撃1.5倍なので、同じ攻撃連打なら討伐に掛かるtickは確実に増える
    expect(ticksOf(ue)).toBeGreaterThan(ticksOf(wolf));
  });
});

// step との接続（kill.unique.* カウンタ・uniqueDefeated イベント・称号条件）
const baseCfg = (): StepConfig => ({
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 100,
  gain: {
    base: { train: 3.6, work: 2.5, combat: 4 },
    challengePoints: [
      [-20, 0.4],
      [0, 1],
      [10, 1.3],
      [30, 1.5],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 0.15,
    noveltyWindow: 20,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.5,
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
  body: {
    fatiguePerAction: { wait: 1, train: 12, work: 10, combat: 20 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: {
      train: { strength: 2, endurance: 2, dexterity: 2 },
      work: { dexterity: 2, spirit: 1 },
      combat: { strength: 2, endurance: 3, agility: 2 },
    },
    statGainPerLoad: 0.05,
    overloadThreshold: 25,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
  },
  ledger: {
    basePricePerQuality: 1,
    marketWindowDays: 7,
    marketDecayPerWork: 0.9,
    tierUpBonusPending: 2,
  },
  combat: { ...cfg, unique },
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [
    {
      id: "title.unique_test",
      rank: "B",
      condition: { counter: "kill.unique.total", gte: 1 },
    },
  ],
});

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const hunt = (s: ReturnType<typeof newGame>, unique_ = false) =>
  step(
    s,
    {
      type: "combat",
      enemyId: "wolf",
      difficulty: 15,
      won: true,
      ...(unique_ ? { unique: true } : {}),
    },
    baseCfg(),
  );

describe("combat コマンドの強個体記録（T-44）", () => {
  it("普通の勝利は kill.species のみで kill.unique は増えない", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state, events } = hunt(s0);
    expect(state.counters["kill.species.wolf"]).toBe(1);
    expect(state.counters["kill.unique.wolf"]).toBeUndefined();
    expect(state.counters["kill.unique.total"]).toBeUndefined();
    expect(events.some((e) => e.type === "uniqueDefeated")).toBe(false);
  });

  it("unique: true の勝利は kill.species・kill.unique.<id>・kill.unique.total が全て増える", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state, events } = hunt(s0, true);
    expect(state.counters["kill.species.wolf"]).toBe(1);
    expect(state.counters["kill.unique.wolf"]).toBe(1);
    expect(state.counters["kill.unique.total"]).toBe(1);
    expect(events.some((e) => e.type === "uniqueDefeated" && e.enemyId === "wolf")).toBe(true);
  });

  it("kill.unique.total の称号が取れる（図鑑→称号の条件接続）", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { events } = hunt(s0, true);
    expect(events.some((e) => e.type === "titleGained" && e.id === "title.unique_test")).toBe(true);
  });

  it("敗北・逃走では kill.unique は増えない", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const lost = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 25, won: false, fled: true, unique: true },
      baseCfg(),
    ).state;
    expect(lost.counters["kill.unique.wolf"]).toBeUndefined();
    expect(lost.counters["kill.species.wolf"]).toBeUndefined();
  });

  it("同種の累計が afterKills に達した後の解禁が state から決定的に判定できる", () => {
    let s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const u = baseCfg().combat.unique!;
    expect(canFightUnique(s, "wolf", u)).toBe(false);
    s = hunt(s).state;
    s = hunt(s).state;
    expect(canFightUnique(s, "wolf", u)).toBe(false);
    s = hunt(s).state;
    // 3体目を倒したので解禁（行動回数は翌日に進むので sleep を挟まなくても計上される）
    expect(canFightUnique(s, "wolf", u)).toBe(true);
  });
});
