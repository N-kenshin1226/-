import { describe, expect, it } from "vitest";
import { rollTailwind, windFor, type TailwindConfig } from "./tailwind.js";
import { createRng } from "../rng/index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";

const DEFS: TailwindConfig["defs"] = [
  {
    id: "tw.smithing",
    label: "《鍛冶》の伸び ↑",
    target: { kind: "skill", id: "smithing" },
    direction: "tailwind",
  },
  {
    id: "tw.swordplay",
    label: "《剣術》の伸び ↑",
    target: { kind: "skill", id: "swordplay" },
    direction: "tailwind",
  },
  {
    id: "tw.mining",
    label: "《採掘》の伸び ↑",
    target: { kind: "skill", id: "mining" },
    direction: "tailwind",
  },
  {
    id: "tw.observation",
    label: "《観察》の伸び ↑",
    target: { kind: "skill", id: "observation" },
    direction: "tailwind",
  },
  {
    id: "hw.train",
    label: "訓練での伸び ↓",
    target: { kind: "action", id: "train" },
    direction: "headwind",
  },
  {
    id: "hw.smithing",
    label: "《鍛冶》の伸び ↓",
    target: { kind: "skill", id: "smithing" },
    direction: "headwind",
  },
];

const tailwind: TailwindConfig = {
  defs: DEFS,
  tailwindFactor: 1.3,
  headwindFactor: 0.8,
  recentDays: 3,
  headwindBiasK: 1.5,
  tailwindBoostK: 0.5,
  drawMin: 1,
  drawMax: 2,
};

const cfg: StepConfig = {
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
  tailwind,
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
};

const newGameCfg = {
  skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
  initialPotential: 100,
  initialStatValue: 10,
};

function withLog(entries: { day: number; kind: string; target?: string }[]): GameState {
  const g = newGame("t7", "追い風", newGameCfg);
  g.actionLog.push(...entries);
  return g;
}

describe("rollTailwind", () => {
  it("同じ状態・シードなら同じ結果（決定論的）", () => {
    const g = newGame("t7-det", "決定", newGameCfg);
    const a = rollTailwind(g, createRng("s1"), tailwind).map((w) => w.id);
    const b = rollTailwind(g, createRng("s1"), tailwind).map((w) => w.id);
    expect(a).toEqual(b);
  });

  it("1〜2種引き、重複なし・倍率は方向に対応", () => {
    const g = newGame("t7-count", "数", newGameCfg);
    for (let i = 0; i < 500; i++) {
      const winds = rollTailwind(g, createRng(`s${i}`), tailwind);
      expect(winds.length).toBeGreaterThanOrEqual(1);
      expect(winds.length).toBeLessThanOrEqual(2);
      expect(new Set(winds.map((w) => w.id)).size).toBe(winds.length);
      for (const w of winds) {
        expect(w.factor).toBe(w.direction === "tailwind" ? 1.3 : 0.8);
      }
    }
  });

  it("偏った行動を続けると、その分野の逆風が出やすい", () => {
    const runs = 2000;
    const biased = withLog(
      Array.from({ length: 15 }, (_, i) => ({
        day: 0,
        kind: "train",
        target: "smithing",
        ...(i >= 0 ? {} : {}),
      })),
    );
    const quiet = newGame("t7-quiet", "静", newGameCfg);

    const rate = (g: GameState, id: string) => {
      let hit = 0;
      for (let i = 0; i < runs; i++) {
        const winds = rollTailwind(g, createRng(`bias-${i}`), tailwind);
        if (winds.some((w) => w.id === id)) hit++;
      }
      return hit / runs;
    };

    // 訓練一色の直近ログ → 「訓練の伸び↓」の出現率が無行動時より大幅に上がる
    const biasedRate = rate(biased, "hw.train");
    const quietRate = rate(quiet, "hw.train");
    expect(biasedRate).toBeGreaterThan(quietRate);
    // 鍛冶だけ連打 → 《鍛冶》の逆風も出やすい
    expect(rate(biased, "hw.smithing")).toBeGreaterThan(rate(quiet, "hw.smithing"));
  });
});

describe("windFor", () => {
  it("スキル対象は skill.id、行動対象は kind に効く", () => {
    const g = newGame("t7-wind", "風", newGameCfg);
    g.today.winds = [
      {
        id: "tw.smithing",
        label: "《鍛冶》の伸び ↑",
        direction: "tailwind",
        factor: 1.3,
        target: { kind: "skill", id: "smithing" },
      },
      {
        id: "hw.train",
        label: "訓練での伸び ↓",
        direction: "headwind",
        factor: 0.8,
        target: { kind: "action", id: "train" },
      },
    ];
    expect(windFor(g, "train", "smithing")).toBeCloseTo(1.3 * 0.8); // 両方が効く
    expect(windFor(g, "train", "swordplay")).toBeCloseTo(0.8);
    expect(windFor(g, "gather", "smithing")).toBeCloseTo(1.3);
    expect(windFor(g, "gather", "swordplay")).toBe(1);
  });
});

describe("step 統合", () => {
  it("睡眠で翌日の追い風が抽選され、起床ログに含まれる", () => {
    const g = newGame("t7-step", "統合", newGameCfg);
    const { state, events } = step(g, { type: "sleep" }, cfg);
    expect(state.today.winds.length).toBeGreaterThanOrEqual(1);
    const wake = events.find((e) => e.type === "wakeReport");
    expect(wake).toBeDefined();
    if (wake?.type === "wakeReport") {
      expect(wake.report.tailwinds.map((w) => w.id)).toEqual(state.today.winds.map((w) => w.id));
    }
  });

  it("追い風が W 項として獲得量に効く", () => {
    const g0 = newGame("t7-gain", "風の効果", newGameCfg);
    const gTail = JSON.parse(JSON.stringify(g0)) as GameState;
    gTail.today.winds = [
      {
        id: "tw.smithing",
        label: "《鍛冶》の伸び ↑",
        direction: "tailwind",
        factor: 1.3,
        target: { kind: "skill", id: "smithing" },
      },
    ];
    const calm = step(g0, { type: "train", skill: "smithing", difficulty: 20 }, cfg).state;
    const windy = step(gTail, { type: "train", skill: "smithing", difficulty: 20 }, cfg).state;
    expect(windy.player.skills.smithing!.pending).toBeCloseTo(
      calm.player.skills.smithing!.pending * 1.3,
      5,
    );
  });
});
