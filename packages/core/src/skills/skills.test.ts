import { describe, expect, it } from "vitest";
import { isSkillUnlocked, unlockFlag, unlockSkills, type SkillUnlockDef } from "./index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";

const TIME: StepConfig["time"] = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const defs: Required<SkillUnlockDef>[] = [
  {
    id: "iaijutsu",
    condition: {
      and: [
        { skill: "swordplay", gte: 25 },
        { skill: "observation", gte: 15 },
      ],
    },
  },
];

/** step() が要求する最小限の設定（他の系は空/中立値） */
const cfg: StepConfig = {
  time: TIME,
  actionLogMax: 10,
  gain: {
    base: { train: 1.0 },
    challengePoints: [
      [-999, 1.0],
      [999, 1.0],
    ],
    challengeTrainCap: 1,
    noveltyK: 0,
    noveltyWindow: 1,
    failMultiplier: 1,
    modifierCap: 99,
    diminishBase: 1,
    diminishExponent: 1,
    fatigueScale: 1,
  },
  sleep: {
    nightlyCapPerSkill: 99,
    nightlyCapTotal: 999,
    innFactors: { cheap: 1, normal: 1, good: 1 },
    dinnerFactors: { withDinner: 1, noDinner: 1 },
    qualityMin: 1,
    qualityMax: 1,
    potentialDecayPerPoint: 0,
  },
  tailwind: {
    defs: [],
    tailwindFactor: 1,
    headwindFactor: 1,
    recentDays: 1,
    headwindBiasK: 0,
    tailwindBoostK: 0,
    drawMin: 0,
    drawMax: 0,
  },
  ledger: {
    basePricePerQuality: 1,
    marketWindowDays: 1,
    marketDecayPerWork: 1,
    tierUpBonusPending: 0,
  },
  combat: {
    baseHp: 1,
    hpPerEndurance: 0,
    attackBase: 0,
    attackPerSwordplay: 0,
    attackPerStrength: 0,
    ctBase: 1,
    ctPerAgility: 0,
    ctMin: 1,
    defendFactor: 1,
    fleeBase: 1,
    fleePerAgility: 0,
    observeBonus: 0,
    preciseObserve: 1,
    deathPendingFactor: 0,
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
    fatiguePerAction: {},
    fatigueDefaultPerAction: 0,
    fatigueRecover: 0,
    statLoadPerAction: {},
    statGainPerLoad: 0,
    overloadThreshold: 99,
    overworkStreakDays: 99,
    overworkConsolidateFactor: 1,
    restQuality: 1,
    restPotentialRecover: 0,
    potentialMax: 999,
  },
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [],
  skillUnlocks: defs,
};

function game(): GameState {
  return newGame("t28", "派生", {
    skillIds: ["swordplay", "observation", "iaijutsu"],
    initialPotential: 100,
    initialStatValue: 10,
  });
}

describe("派生スキル", () => {
  it("解放条件なしは最初から鍛えられる", () => {
    const s = game();
    expect(isSkillUnlocked(s, { id: "swordplay" })).toBe(true);
  });

  it("条件を満たすまで解放されず、満たすと flags が立つ", () => {
    let s = game();
    expect(isSkillUnlocked(s, defs[0]!)).toBe(false);

    // 剣術だけ上げても観察が足りない
    s = setSkill(s, "swordplay", 30);
    expect(unlockSkills(s, defs, TIME).unlocked).toEqual([]);

    // 両方満たすと解放
    s = setSkill(s, "observation", 15);
    const r = unlockSkills(s, defs, TIME);
    expect(r.unlocked).toEqual(["iaijutsu"]);
    expect(r.state.flags[unlockFlag("iaijutsu")]).toBe(true);
    expect(isSkillUnlocked(r.state, defs[0]!)).toBe(true);

    // 二度目は発火しない
    expect(unlockSkills(r.state, defs, TIME).unlocked).toEqual([]);
  });

  it("step() の中で解放され skillUnlocked イベントが出る", () => {
    let s = game();
    s = setSkill(s, "swordplay", 25);
    s = setSkill(s, "observation", 15);
    // 行動せずとも wait で判定される
    const res = step(s, { type: "wait" }, cfg);
    expect(res.events.some((e) => e.type === "skillUnlocked" && e.id === "iaijutsu")).toBe(true);
    expect(res.state.flags[unlockFlag("iaijutsu")]).toBe(true);
  });

  it("未解放の派生スキルは step でも鍛えられない", () => {
    const s = game();
    expect(() => step(s, { type: "train", skill: "iaijutsu", difficulty: 10 }, cfg)).toThrow(
      "未解放",
    );
    // 解放後なら鍛えられる
    const u = unlockSkills(setSkill(setSkill(s, "swordplay", 30), "observation", 20), defs, TIME);
    const r = step(u.state, { type: "train", skill: "iaijutsu", difficulty: 10 }, cfg);
    expect(r.state.player.skills["iaijutsu"]!.pending).toBeGreaterThan(0);
  });
});

function setSkill(s: GameState, id: string, value: number): GameState {
  return {
    ...s,
    player: {
      ...s.player,
      skills: { ...s.player.skills, [id]: { ...s.player.skills[id]!, value, peak: value } },
    },
  };
}
