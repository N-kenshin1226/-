import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import { readAtom, type LoreConfig } from "./index.js";

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

const loreCfg: LoreConfig = {
  atoms: [
    { id: "item.hammer", reveals: ["fact.a"], unlock: { flag: "found.hammer" } },
    { id: "place.forge", reveals: ["fact.b"], unlock: null },
    { id: "npc.memo", reveals: [], unlock: null },
  ],
  connections: [{ eventId: "event.fire", facts: ["fact.a", "fact.b"], flag: "quest.fire_truth" }],
};

const cfg = (lore: LoreConfig = loreCfg): StepConfig =>
  ({
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
    actionLogMax: 50,
    gain: {
      base: { train: 1 },
      challengePoints: [
        [0, 1],
        [30, 0],
      ],
      challengeTrainCap: 0.6,
      noveltyK: 1,
      noveltyWindow: 10,
      failMultiplier: 0.6,
      modifierCap: 2.5,
      diminishBase: 110,
      diminishExponent: 1.5,
      fatigueScale: 0.8,
    },
    sleep: {
      nightlyCapPerSkill: 8,
      nightlyCapTotal: 999,
      innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
      dinnerFactors: { withDinner: 1, noDinner: 1 },
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
      fatiguePerAction: { read: 1 },
      fatigueDefaultPerAction: 2,
      fatigueRecover: 60,
      statLoadPerAction: {},
      statGainPerLoad: 0.05,
      overloadThreshold: 15,
      overworkStreakDays: 3,
      overworkConsolidateFactor: 0.5,
      restQuality: 0.9,
      restPotentialRecover: 3,
      potentialMax: 100,
    },
    society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
    lore,
    titles: [],
  }) as StepConfig;

describe("見聞録（07 §3）", () => {
  it("アトムを読むと read/facts/フラグが記録される", () => {
    const g = newGame("s", "t", newGameCfg);
    const r = readAtom(g, "item.hammer", loreCfg);
    expect(r.ok).toBe(true);
    expect(r.state.lore.read).toEqual(["item.hammer"]);
    expect(r.state.lore.facts).toEqual(["fact.a"]);
    expect(r.state.flags["found.hammer"]).toBe(true);
    // 読み済みは二度読めない
    expect(readAtom(r.state, "item.hammer", loreCfg).ok).toBe(false);
    // 不明IDは失敗
    expect(readAtom(g, "item.nothing", loreCfg).ok).toBe(false);
  });

  it("出来事の事実が揃うとつながりの報酬フラグが立つ", () => {
    let g = newGame("s", "t", newGameCfg);
    g = readAtom(g, "item.hammer", loreCfg).state;
    expect(g.lore.connections).toHaveLength(0);
    const r = readAtom(g, "place.forge", loreCfg);
    expect(r.connections).toEqual([{ eventId: "event.fire", flag: "quest.fire_truth" }]);
    expect(r.state.lore.connections).toEqual(["event.fire"]);
    expect(r.state.flags["quest.fire_truth"]).toBe(true);
  });

  it("step の readAtom コマンドで記録され、行動を1回消費する", () => {
    const g = newGame("s", "t", newGameCfg);
    const r = step(g, { type: "readAtom", id: "item.hammer" }, cfg());
    expect(r.state.time.action).toBe(1);
    expect(r.state.lore.read).toEqual(["item.hammer"]);
    expect(r.events.some((e) => e.type === "atomRead" && e.id === "item.hammer")).toBe(true);
    expect(r.events.some((e) => e.type === "factLearned" && e.id === "fact.a")).toBe(true);
    // 読み済みに再読しても時間は進まない
    const again = step(r.state, { type: "readAtom", id: "item.hammer" }, cfg());
    expect(again.state.time.action).toBe(1);
    expect(again.events).toHaveLength(0);
  });

  it("事実が揃うと loreConnection イベントが出る", () => {
    let g = newGame("s", "t", newGameCfg);
    g = step(g, { type: "readAtom", id: "item.hammer" }, cfg()).state;
    const r = step(g, { type: "readAtom", id: "place.forge" }, cfg());
    expect(
      r.events.some(
        (e) =>
          e.type === "loreConnection" && e.id === "event.fire" && e.flag === "quest.fire_truth",
      ),
    ).toBe(true);
  });
});
