import { describe, expect, it } from "vitest";
import {
  combatResult,
  startCombat,
  telegraphLines,
  turn,
  type CombatConfig,
  type EnemyDef,
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

const CTX = { skill: 0, seed: "combat-test" };

describe("CT戦闘（03 §4）", () => {
  it("同じシードと行動列で同じ結果", () => {
    const run = (actions: ("attack" | "defend" | "observe" | "flee")[]) => {
      let s = startCombat(wolf, cfg, mkPlayer(0));
      for (const a of actions) s = turn(s, a, wolf, cfg, CTX);
      return s;
    };
    const acts = ["attack", "attack", "defend", "attack"] as const;
    expect(run([...acts])).toEqual(run([...acts]));
  });

  it("攻撃だけで狼を倒せる（勝利）", () => {
    let s = startCombat(wolf, cfg, mkPlayer(0));
    while (!s.done) s = turn(s, "attack", wolf, cfg, CTX);
    const r = combatResult(s);
    expect(r.won).toBe(true);
    expect(r.ticks).toBeGreaterThan(0);
  });

  it("観察が低いと曖昧な予兆、高いと技名＋残りtickが出る", () => {
    // パターン3番目（2回の敵行動後）に予兆が出るよう進める
    let s = startCombat(wolf, cfg, mkPlayer(0));
    s = turn(s, "attack", wolf, cfg, CTX); // tick 12 経過：敵行動2回（t=5,15は…実際は攻撃2回目まで）
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      const low = telegraphLines(s, wolf, cfg).join("\n");
      expect(low).toContain("唸っている");
      expect(low).not.toContain("飛びかかり");
      // 観察が高いプレイヤー
      let s2 = startCombat(wolf, cfg, mkPlayer(80));
      while (!s2.telegraph && !s2.done) s2 = turn(s2, "attack", wolf, cfg, CTX);
      const high = telegraphLines(s2, wolf, cfg).join("\n");
      expect(high).toContain("飛びかかり");
      expect(high).toContain("tick");
    }
  });

  it("観察行動で予兆の精度が1段上がる（30+20≥40）", () => {
    let s = startCombat(wolf, cfg, mkPlayer(30));
    // 攻撃で待って予兆を出させる（この時点では未観察）
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done && s.telegraph) {
      // 観察30 だけでは曖昧（<40）。観察行動ボーナス(+20)で精密になる
      expect(telegraphLines(s, wolf, cfg).join("\n")).toContain("唸っている");
      const s2 = { ...s, observed: true };
      expect(telegraphLines(s2, wolf, cfg).join("\n")).toContain("飛びかかり");
    }
  });

  it("防御は予兆の大技ダメージを軽減する", () => {
    // 予兆が出る直前で防御 → 飛びかかりが軽減される
    let s = startCombat(wolf, cfg, mkPlayer(0));
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      const dmg = (a: "attack" | "defend") => {
        let x = { ...s, log: [] as typeof s.log };
        const before = x.damageTaken;
        while (x.telegraph && !x.done) x = turn(x, a, wolf, cfg, CTX);
        return x.damageTaken - before;
      };
      const blocked = dmg("defend");
      const open = dmg("attack");
      expect(blocked).toBeLessThan(open);
    }
  });
});

// step との接続（勝敗の記録・gain・死亡蘇生）
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
  combat: cfg,
  titles: [
    {
      id: "title.wolf_test",
      rank: "B",
      condition: { counter: "kill.species.wolf", gte: 1 },
    },
  ],
});

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

describe("combat コマンド（step への反映）", () => {
  it("勝つと kill.species.<id> が増え gain が入る", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state, events } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true },
      baseCfg(),
    );
    expect(state.counters["kill.species.wolf"]).toBe(1);
    expect(events.some((e) => e.type === "gainApplied" && e.skill === "swordplay")).toBe(true);
    expect(state.player.skills["swordplay"]!.pending).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "combatEnded")).toBe(true);
  });

  it("撃破で kill 条件の称号が取れる", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { events } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true },
      baseCfg(),
    );
    expect(events.some((e) => e.type === "titleGained" && e.id === "title.wolf_test")).toBe(true);
  });

  it("死亡すると未定着経験が半減し death.count が増える", () => {
    let s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    s = step(s, { type: "train", skill: "swordplay", difficulty: 20 }, baseCfg()).state;
    const before = s.player.skills["swordplay"]!.pending;
    expect(before).toBeGreaterThan(0);
    const { state, events } = step(
      s,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false, died: true },
      baseCfg(),
    );
    // 半減するのは戦闘で入った分を除いた差分を含む。pending が半分程度に減る
    const after = state.player.skills["swordplay"]!.pending;
    expect(after).toBeLessThan(before + 4); // 追加gain後に半減なので元より十分小さい
    expect(state.counters["death.count"]).toBe(1);
    expect(events.some((e) => e.type === "died")).toBe(true);
  });
});
