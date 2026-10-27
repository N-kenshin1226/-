import { describe, expect, it } from "vitest";
import { startCombat, turn, type CombatConfig, type EnemyDef } from "../combat/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import { step, type Command, type StepConfig } from "../step.js";
import { activeEffects, damageFactor, gainModifier, priceFactor, type Effect } from "./index.js";

/**
 * T-35：称号・認定職の効果接続（docs/03 §7、02 §2 の M 項）。
 * gain の M 項・与ダメージ・報酬に効くこと、modifierCap で頭打ちになることを
 * 決定論的に検証する（乱数は使わない）。
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const combat: CombatConfig = {
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
};

const base = (
  titles: readonly { id: string; effect?: Effect }[] = [],
  professions: readonly { id: string; effect?: Effect }[] = [],
): StepConfig => ({
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
    base: { train: 1.0, work: 1.0, combat: 1.0 },
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
  combat,
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
    standings: [{ id: "drifter", name: "流れ者", order: 0 }],
    professions: professions.map((p) => ({
      id: p.id,
      name: p.id,
      // テストでは打診を出さない条件（立たないフラグ）にしておく
      condition: { flag: "never.set" },
      ...(p.effect !== undefined ? { effect: p.effect } : {}),
    })),
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: titles.map((t) => ({
    id: t.id,
    rank: "B" as const,
    condition: { flag: "never.set" },
    ...(t.effect !== undefined ? { effect: t.effect } : {}),
  })),
});

const run = (state: GameState, cmd: Command, cfg: StepConfig) => step(state, cmd, cfg);

const freshGame = (seed = "fx"): GameState =>
  newGame(seed, "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });

const withTitles = (g: GameState, ids: string[]): GameState => ({ ...g, titles: ids });

const withProfession = (g: GameState, id: string): GameState => ({
  ...g,
  society: { ...g.society, profession: id },
});

const trainGain = (g: GameState, skill: string, cfg: StepConfig): number => {
  const r = run(g, { type: "train", skill, difficulty: 15 }, cfg);
  const ev = r.events.find((e) => e.type === "gainApplied");
  return ev?.type === "gainApplied" ? ev.amount : 0;
};

describe("gain の M 項への接続", () => {
  it("称号の gainVs（対象=スキルID）がそのスキルの経験にだけ効く", () => {
    const cfg = base([{ id: "title.x", effect: { gainVs: { swordplay: 1.5 } } }]);
    const plain = freshGame();
    const titled = withTitles(freshGame(), ["title.x"]);

    expect(trainGain(titled, "swordplay", cfg)).toBeCloseTo(
      trainGain(plain, "swordplay", cfg) * 1.5,
      10,
    );
    // 他のスキルには効かない
    expect(trainGain(titled, "smithing", cfg)).toBeCloseTo(trainGain(plain, "smithing", cfg), 10);
  });

  it("称号の gainVs（対象=行動 kind）がその行動全体に効く", () => {
    const cfg = base([{ id: "title.x", effect: { gainVs: { train: 2.0 } } }]);
    const plain = freshGame();
    const titled = withTitles(freshGame(), ["title.x"]);
    for (const skill of ["swordplay", "smithing", "mining"]) {
      expect(trainGain(titled, skill, cfg)).toBeCloseTo(trainGain(plain, skill, cfg) * 2, 10);
    }
  });

  it("複数の効果は積で重なり、modifierCap で頭打ちになる", () => {
    const cfg = base(
      [{ id: "title.a", effect: { gainVs: { train: 2 } } }],
      [{ id: "smith", effect: { gainVs: { swordplay: 2 } } }],
    );
    const titled = withProfession(withTitles(freshGame(), ["title.a"]), "smith");
    // 2 × 2 = 4 だが cap 2.5 で頭打ち
    expect(
      gainModifier(
        activeEffects(titled, cfg.titles, cfg.society.professions),
        "train",
        "swordplay",
      ),
    ).toBe(4);
    expect(trainGain(titled, "swordplay", cfg)).toBeCloseTo(
      trainGain(freshGame(), "swordplay", cfg) * 2.5,
      10,
    );
    // 2 × 1 = 2 は cap 未満なのでそのまま
    expect(trainGain(titled, "smithing", cfg)).toBeCloseTo(
      trainGain(freshGame(), "smithing", cfg) * 2,
      10,
    );
  });

  it("認定職の gainVs は profession を持つときだけ効く", () => {
    const cfg = base([], [{ id: "smith", effect: { gainVs: { smithing: 1.2 } } }]);
    const plain = freshGame();
    const pro = withProfession(freshGame(), "smith");
    expect(trainGain(pro, "smithing", cfg)).toBeCloseTo(
      trainGain(plain, "smithing", cfg) * 1.2,
      10,
    );
    // 未認定（profession = null）では効かない
    expect(trainGain(plain, "smithing", cfg)).toBeCloseTo(
      trainGain(freshGame("fx2"), "smithing", cfg),
      10,
    );
  });

  it("戦闘経験には kind=combat と対象（スキル/敵ID）の両方が効く", () => {
    const cfg = base([
      { id: "title.wolf", effect: { gainVs: { wolf: 1.5 } } },
      { id: "title.war", effect: { gainVs: { combat: 1.2 } } },
    ]);
    const titled = withTitles(freshGame(), ["title.wolf", "title.war"]);
    const plain = freshGame();

    const combatGain = (g: GameState, enemyId: string, skill: string): number => {
      const r = run(g, { type: "combat", enemyId, difficulty: 10, won: true }, cfg);
      const ev = r.events.find((e) => e.type === "gainApplied" && e.skill === skill);
      return ev?.type === "gainApplied" ? ev.amount : 0;
    };
    // wolf には 1.5 × 1.2、他の敵には 1.2 だけ
    expect(combatGain(titled, "wolf", "swordplay")).toBeCloseTo(
      combatGain(plain, "wolf", "swordplay") * 1.8,
      10,
    );
    expect(combatGain(titled, "boar", "swordplay")).toBeCloseTo(
      combatGain(plain, "boar", "swordplay") * 1.2,
      10,
    );
  });

  it("獲得していない称号の効果は働かない", () => {
    const cfg = base([{ id: "title.x", effect: { gainVs: { train: 5 } } }]);
    expect(trainGain(freshGame(), "swordplay", cfg)).toBeCloseTo(
      trainGain(freshGame("fx2"), "swordplay", cfg),
      10,
    );
  });
});

describe("報酬（priceVs）への接続", () => {
  it("priceFactor は持っている効果の該当 kind だけに効く", () => {
    const fx = [{ priceVs: { smithing: 1.1 } }] satisfies Effect[];
    expect(priceFactor(fx, "smithing")).toBe(1.1);
    expect(priceFactor(fx, "mining")).toBe(1);
    expect(priceFactor([], "smithing")).toBe(1);
  });

  it("priceVs が仕事の報酬に乗る（認定による値段変化）", () => {
    const cfg = base([], [{ id: "smith", effect: { priceVs: { smithing: 1.5 } } }]);
    const cmd: Command = { type: "work", kind: "smithing", quality: 50, rewardMoney: 100 };
    const plain = run(freshGame(), cmd, cfg);
    const pro = run(withProfession(freshGame(), "smith"), cmd, cfg);
    const paidOf = (evs: { type: string; amount?: number }[]) =>
      evs.find((e) => e.type === "moneyPaid")?.amount ?? 0;
    expect(paidOf(plain.events)).toBe(100);
    expect(paidOf(pro.events)).toBe(150);
  });

  it("priceVs は他の系統の仕事には効かない", () => {
    const cfg = base([], [{ id: "smith", effect: { priceVs: { smithing: 1.5 } } }]);
    const pro = withProfession(freshGame(), "smith");
    const r = run(pro, { type: "work", kind: "mining", quality: 50, rewardMoney: 100 }, cfg);
    const paid = r.events.find((e) => e.type === "moneyPaid");
    expect(paid?.type === "moneyPaid" && paid.amount).toBe(100);
  });
});

describe("与ダメージ（damageVs）への接続", () => {
  const wolf: EnemyDef = {
    id: "wolf",
    name: "狼",
    hp: 30,
    intervalTicks: 10,
    challenge: 15,
    agility: 5,
    attack: { id: "bite", name: "咬みつき", power: 4 },
    moves: {},
    pattern: [{ type: "attack" }],
  };

  it("damageFactor は持っている称号の該当敵だけに効く", () => {
    const fx = [{ damageVs: { wolf: 1.5 } }] satisfies Effect[];
    expect(damageFactor(fx, "wolf")).toBe(1.5);
    expect(damageFactor(fx, "boar")).toBe(1);
    expect(damageFactor([], "wolf")).toBe(1);
  });

  it("称号の damageVs が戦闘の一撃に乗る", () => {
    const g = freshGame();
    const plain = startCombat(wolf, combat, g.player);
    const buffed = startCombat(wolf, combat, g.player, 1.5);
    expect(buffed.playerAttack).toBeCloseTo(plain.playerAttack * 1.5, 1);

    // 実際に殴って敵HPが倍率分だけ多く減る
    const ctx = { skill: 0, seed: "fx-combat" };
    const afterPlain = turn(plain, "attack", wolf, combat, ctx);
    const afterBuffed = turn(buffed, "attack", wolf, combat, ctx);
    // F-04：攻撃力は 0.1 刻みに丸められ、ダメージには揺らぎが乗るので
    // 同じシードの乱数列でも比は厳密には 1.5 に乗らない —— 整数精度で十分
    expect(30 - afterBuffed.enemyHp).toBeCloseTo((30 - afterPlain.enemyHp) * 1.5, 0);
  });

  it("activeEffects は獲得称号＋認定職だけを拾う", () => {
    const cfg = base(
      [
        { id: "title.a", effect: { damageVs: { wolf: 1.05 } } },
        { id: "title.b", effect: { damageVs: { wolf: 2 } } },
      ],
      [{ id: "smith", effect: { gainVs: { smithing: 1.1 } } }],
    );
    // title.a だけ獲得、職業は未認定
    const g = withTitles(freshGame(), ["title.a"]);
    const fx = activeEffects(g, cfg.titles, cfg.society.professions);
    expect(fx).toHaveLength(1);
    expect(damageFactor(fx, "wolf")).toBe(1.05);
    // 認定後は職業の効果も乗る
    const fx2 = activeEffects(withProfession(g, "smith"), cfg.titles, cfg.society.professions);
    expect(fx2).toHaveLength(2);
    expect(gainModifier(fx2, "work", "smithing")).toBeCloseTo(1.1);
  });
});
