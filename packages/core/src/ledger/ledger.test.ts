import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import { matchesWork, recordWork, type LedgerConfig } from "./index.js";
import { evaluate } from "../conditions/index.js";
import type { GameState } from "../state/types.js";

const ledgerCfg: LedgerConfig = {
  basePricePerQuality: 2,
  marketWindowDays: 7,
  marketDecayPerWork: 0.9,
  tierUpBonusPending: 8,
};

function base(): GameState {
  return newGame("t16", "テスト", {
    skillIds: ["swordplay", "smithing"],
    initialPotential: 100,
    initialStatValue: 10,
  });
}

describe("作品台帳", () => {
  it("作品が記録され、id・日・worldSeed が付く", () => {
    const { work, state } = recordWork(base(), { kind: "smithing", quality: 40 }, ledgerCfg);
    expect(state.ledger).toHaveLength(1);
    expect(work.id).toBe("t16-w1");
    expect(work.day).toBe(0);
    expect(work.worldSeed).toBe("t16");
    expect(work.tier).toBe(1);
  });

  it("自己ベスト更新でティアが上がり、更新しないと据え置き", () => {
    let s = base();
    s = recordWork(s, { kind: "smithing", quality: 40 }, ledgerCfg).state; // tier1
    s = recordWork(s, { kind: "smithing", quality: 30 }, ledgerCfg).state; // tier1（ベスト未満）
    expect(s.ledger[1]!.tier).toBe(1);
    const { work, tierUp } = recordWork(s, { kind: "smithing", quality: 55 }, ledgerCfg);
    expect(tierUp).toBe(true);
    expect(work.tier).toBe(2);
  });

  it("同じ種類を売り続けると相場が下がる", () => {
    let s = base();
    const first = recordWork(s, { kind: "smithing", quality: 50 }, ledgerCfg).work.marketValue;
    s = { ...s, ledger: [recordWork(s, { kind: "smithing", quality: 50 }, ledgerCfg).work] };
    const second = recordWork(s, { kind: "smithing", quality: 50 }, ledgerCfg).work.marketValue;
    expect(second).toBeLessThan(first);
  });

  it("matchesWork: kind / tierGte / count の条件", () => {
    let s = base();
    s = recordWork(s, { kind: "smithing", quality: 40 }, ledgerCfg).state;
    s = recordWork(s, { kind: "smithing", quality: 60 }, ledgerCfg).state;
    s = recordWork(s, { kind: "mining", quality: 20 }, ledgerCfg).state;
    expect(matchesWork(s.ledger, { kind: "smithing", count: { atLeast: 2 } })).toBe(true);
    expect(matchesWork(s.ledger, { kind: "smithing", tierGte: 2 })).toBe(true);
    expect(matchesWork(s.ledger, { kind: "mining", count: { atLeast: 2 } })).toBe(false);
    expect(matchesWork(s.ledger, {})).toBe(true);
    expect(matchesWork(base().ledger, {})).toBe(false);
  });
});

describe("step の work コマンド", () => {
  const cfg = (over?: Partial<StepConfig>): StepConfig => ({
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
    actionLogMax: 5,
    gain: {
      base: { train: 1.0, work: 2.0 },
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
    body: {
      fatiguePerAction: { wait: 1, train: 10, work: 10 },
      fatigueDefaultPerAction: 2,
      fatigueRecover: 60,
      statLoadPerAction: { train: { strength: 2, endurance: 2, dexterity: 2 } },
      statGainPerLoad: 0.05,
      overloadThreshold: 20,
      overworkStreakDays: 3,
      overworkConsolidateFactor: 0.5,
      restQuality: 0.9,
      restPotentialRecover: 3,
      potentialMax: 100,
    },
    ledger: ledgerCfg,
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
    },
    society: {
      standings: [],
      professions: [],
      lifeGoals: [],
      goalRewardFactor: 1,
    },
    titles: [],
    ...over,
  });

  it("作品が台帳に入り、経験・行動消化・イベントが出る", () => {
    const res = step(
      base(),
      { type: "work", kind: "smithing", quality: 50, order: "ord-1" },
      cfg(),
    );
    expect(res.state.ledger).toHaveLength(1);
    expect(res.state.ledger[0]!.order).toBe("ord-1");
    expect(res.state.time.action).toBe(1);
    expect(res.state.player.skills.smithing!.pending).toBeGreaterThan(0);
    const kinds = res.events.map((e) => e.type);
    expect(kinds).toContain("workRecorded");
    expect(kinds).toContain("tierUp"); // 初作品は tierUp
    expect(res.state.player.fatigue).toBeGreaterThan(0);
  });

  it("ティア更新でボーナス pending が乗る", () => {
    let s = base();
    s = step(s, { type: "work", kind: "smithing", quality: 40, difficulty: 0 }, cfg()).state;
    const before = s.player.skills.smithing!.pending;
    const res = step(s, { type: "work", kind: "smithing", quality: 70, difficulty: 0 }, cfg());
    // 普通の gain より tierUpBonusPending 分だけ多い（難度差0＝gainは係数1.0系）
    const added = res.state.player.skills.smithing!.pending - before;
    expect(added).toBeGreaterThanOrEqual(ledgerCfg.tierUpBonusPending);
  });

  it("条件DSLの work 節が台帳を読む", () => {
    const s = step(base(), { type: "work", kind: "smithing", quality: 50 }, cfg()).state;
    expect(evaluate({ work: { kind: "smithing", count: { atLeast: 1 } } }, s, cfg().time)).toBe(
      true,
    );
    expect(evaluate({ work: { kind: "mining", count: { atLeast: 1 } } }, s, cfg().time)).toBe(
      false,
    );
  });
});
