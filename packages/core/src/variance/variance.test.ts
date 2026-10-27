import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import { createRng } from "../rng/index.js";
import { rollIndividual, type EnemyDef, type IndividualConfig } from "../combat/index.js";
import {
  customerMoodFactor,
  gainSpread,
  gainVarianceFactor,
  insightOf,
  marketFactor,
  materialFactor,
  npcAway,
  rollCondition,
  skillDamp,
  workTwist,
  type VarianceConfig,
} from "./index.js";

/**
 * 揺らぎ（R-01、docs/devin_tasks/R-01_randomness.md）のテスト。
 * - 決定性：同じシード・同じ入力は必ず同じ結果
 * - 分布：別のシードでは値が散る（同じ行動で同じ結果にならない）
 * - 公平：係数の期待値は 1 前後（主人公だけが得をしない）
 * - 安定：技量が高いほど分散が小さい
 */

const GAIN = {
  spread: 0.2,
  skillDampK: 1.5,
  insightChance: 0.1,
  insightFactor: 1.4,
};
const WORK = {
  critChance: 0.08,
  failChance: 0.08,
  skillDampK: 1.0,
  critFactor: 1.6,
  failFactor: 0.5,
  critFlag: "会心作",
  failFlag: "失敗作",
  materialSpread: 0.12,
  moodGoodChance: 0.08,
  moodBadChance: 0.08,
  moodGoodFactor: 1.3,
  moodBadFactor: 0.75,
};
const MARKET = { dailySpread: 0.15, seasonalAmp: 0.25 };
const NPC = { awayChance: 0.06 };
const CONDITION = { goodChance: 0.18, poorChance: 0.15, goodFactor: 1.15, poorFactor: 0.85 };

const VARIANCE: VarianceConfig = {
  gain: GAIN,
  work: WORK,
  market: MARKET,
  npc: NPC,
  condition: CONDITION,
};

const INDIVIDUAL: IndividualConfig = {
  strongChance: 0.12,
  timidChance: 0.12,
  strongHpFactor: 1.25,
  strongPowerFactor: 1.2,
  strongChallengeBonus: 4,
  strongAgilityBonus: 1,
  timidPowerFactor: 0.7,
  timidIntervalFactor: 1.35,
  timidChallengeBonus: -3,
  hpJitter: 0.1,
  powerJitter: 0.1,
  agilityJitter: 2,
};

const WOLF: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 20,
  intervalTicks: 14,
  challenge: 12,
  agility: 10,
  attack: { id: "bite", name: "噛みつき", power: 6 },
  moves: { fang: { id: "fang", name: "狼の牙", power: 14 } },
  pattern: [{ type: "attack" }, { type: "telegraph", move: "fang", ticks: 10 }],
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe("R-01 揺らぎ：経験", () => {
  it("同じシードでは同じ係数、別のシードでは分布になる", () => {
    const seeds = Array.from({ length: 60 }, (_, i) => `s${i}`);
    const fs = seeds.map((s) => gainVarianceFactor(createRng(`${s}:gv:1:0:0`), 0, GAIN));
    // 決定性
    for (const s of seeds) {
      expect(gainVarianceFactor(createRng(`${s}:gv:1:0:0`), 0, GAIN)).toBe(
        gainVarianceFactor(createRng(`${s}:gv:1:0:0`), 0, GAIN),
      );
    }
    // 範囲：1 ± spread
    for (const f of fs) {
      expect(f).toBeGreaterThan(1 - GAIN.spread);
      expect(f).toBeLessThan(1 + GAIN.spread);
    }
    // 分布が広がっている（同じ結果ではない）
    expect(new Set(fs).size).toBeGreaterThan(30);
    // 公平：期待値は1（方向を持たないノイズ）
    expect(mean(fs)).toBeGreaterThan(0.98);
    expect(mean(fs)).toBeLessThan(1.02);
  });

  it("技量が高いほど安定する（分散が小さい）", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `skill${i}`);
    const low = seeds.map((s) => gainVarianceFactor(createRng(s), 0, GAIN));
    const high = seeds.map((s) => gainVarianceFactor(createRng(s), 80, GAIN));
    const max = seeds.map((s) => gainVarianceFactor(createRng(s), 100, GAIN));
    expect(stdev(low)).toBeGreaterThan(stdev(high) * 2);
    // 技量100では半幅0 —— 揺らがない
    for (const f of max) expect(f).toBe(1);
    // 半幅は (1-skill/100)^k に比例する
    expect(gainSpread(0, GAIN)).toBeCloseTo(GAIN.spread);
    expect(gainSpread(100, GAIN)).toBe(0);
    expect(skillDamp(50, 1)).toBeCloseTo(0.5);
  });

  it("冴えの日は日×シードで決まり、一定の割合で起きる", () => {
    for (let d = 0; d < 10; d++) {
      expect(insightOf("w-ins", d, GAIN)).toEqual(insightOf("w-ins", d, GAIN));
    }
    const days = Array.from({ length: 400 }, (_, i) => i);
    const hits = days.filter((d) => insightOf("w-ins2", d, GAIN).active).length;
    expect(hits).toBeGreaterThan(10); // 0日ではない
    expect(hits).toBeLessThan(120); // 毎日ではない（確率0.1）
  });
});

describe("R-01 揺らぎ：仕事", () => {
  it("思わぬ出来栄え：低技量では会心・失敗作が出て、高技量では安定する", () => {
    const seeds = Array.from({ length: 400 }, (_, i) => `tw${i}`);
    const low = seeds.map((s) => workTwist(s, 1, "order.a", 0, WORK));
    const high = seeds.map((s) => workTwist(s, 1, "order.a", 90, WORK));
    const crits = low.filter((t) => t.flag === WORK.critFlag).length;
    const fails = low.filter((t) => t.flag === WORK.failFlag).length;
    const highTwists = high.filter((t) => t.flag !== undefined).length;
    expect(crits).toBeGreaterThan(10);
    expect(fails).toBeGreaterThan(10);
    expect(highTwists).toBeLessThan(crits + fails);
    // 決定性
    expect(workTwist("same", 1, "o", 30, WORK)).toEqual(workTwist("same", 1, "o", 30, WORK));
    // 出た旗の係数が正しい
    for (const t of low) {
      if (t.flag === WORK.critFlag) expect(t.factor).toBe(WORK.critFactor);
      if (t.flag === WORK.failFlag) expect(t.factor).toBe(WORK.failFactor);
    }
  });

  it("素材の質は日×種目で決まり、期待値1の範囲に収まる", () => {
    expect(materialFactor("w", 3, "smithing", WORK)).toBe(materialFactor("w", 3, "smithing", WORK));
    const fs = Array.from({ length: 60 }, (_, d) => materialFactor("w", d, "smithing", WORK));
    for (const f of fs) {
      expect(f).toBeGreaterThan(1 - WORK.materialSpread);
      expect(f).toBeLessThan(1 + WORK.materialSpread);
    }
    expect(new Set(fs).size).toBeGreaterThan(10);
    expect(mean(fs)).toBeGreaterThan(0.98);
    expect(mean(fs)).toBeLessThan(1.02);
    // 別の種目は別の素材（同じ日でも係数が違うことがある）
    const kinds = ["smithing", "mining", "fishing"].map((k) => materialFactor("w", 3, k, WORK));
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("客の機嫌は注文ごとに決まり、基本は普通でまれに増減する", () => {
    expect(customerMoodFactor("w", 2, "o1", WORK)).toBe(customerMoodFactor("w", 2, "o1", WORK));
    const fs = Array.from({ length: 400 }, (_, d) => customerMoodFactor("w", d, "o1", WORK));
    const goods = fs.filter((f) => f === WORK.moodGoodFactor).length;
    const bads = fs.filter((f) => f === WORK.moodBadFactor).length;
    const normals = fs.filter((f) => f === 1).length;
    expect(normals).toBeGreaterThan(goods + bads);
    expect(goods).toBeGreaterThan(5);
    expect(bads).toBeGreaterThan(5);
  });
});

describe("R-01 揺らぎ：市場と人と体調", () => {
  it("市場は日×種目で動き、季節波が重なる", () => {
    const f = (d: number, season = 0) => marketFactor("w", d, "smithing", season, 4, MARKET);
    expect(f(3)).toBe(f(3));
    const days = Array.from({ length: 40 }, (_, d) => f(d));
    expect(new Set(days).size).toBeGreaterThan(10);
    // 季節波：旬の位相は種目の世界シードで決まるので季節で係数が変わる
    const seasons = Array.from({ length: 4 }, (_, s) => f(0, s));
    expect(new Set(seasons).size).toBeGreaterThan(1);
    // 別の種目は別の相場
    expect(marketFactor("w", 0, "mining", 0, 4, MARKET)).not.toBe(f(0));
  });

  it("NPCは日ごとに街にいる日・いない日がある", () => {
    expect(npcAway("w", 5, "npc.a", NPC)).toBe(npcAway("w", 5, "npc.a", NPC));
    const days = Array.from({ length: 400 }, (_, d) => d);
    const away = days.filter((d) => npcAway("w", d, "npc.a", NPC)).length;
    expect(away).toBeGreaterThan(5);
    expect(away).toBeLessThan(100); // 確率0.06
    // 別の人物は別の抽選（同じ日でもいる・いないが違い得る）
    const a = npcAway("w", 5, "npc.a", NPC);
    const bs = Array.from({ length: 20 }, (_, i) => npcAway("w", 5, `npc.b${i}`, NPC));
    expect(bs).toContain(a); // 同じ結果が出得る列
  });

  it("体調は日×シードで決まり、睡眠の質と疲労で傾く", () => {
    // 重みの傾き：疲れて質の悪い日ほど不調に、よく寝た日ほど好調に寄る
    const badBias = Array.from(
      { length: 300 },
      (_, d) => rollCondition("w", d, 0.6, 90, CONDITION).kind,
    ).filter((k) => k === "poor").length;
    const goodBias = Array.from(
      { length: 300 },
      (_, d) => rollCondition("w", d, 1.2, 0, CONDITION).kind,
    ).filter((k) => k === "good").length;
    expect(badBias).toBeGreaterThan(goodBias);
    // 同じ日・同じ条件では同じ結果（抽選そのものは日で固定）
    expect(rollCondition("w", 7, 1.0, 20, CONDITION)).toEqual(
      rollCondition("w", 7, 1.0, 20, CONDITION),
    );
  });
});

describe("R-01 揺らぎ：敵の個体差", () => {
  it("強い個体・臆病な個体・普通の個体が決定的に分かれる", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `enc${i}`);
    const rolls = seeds.map((s) => rollIndividual(WOLF, createRng(s), INDIVIDUAL));
    const strongs = rolls.filter((r) => r.trait === "strong");
    const timids = rolls.filter((r) => r.trait === "timid");
    const normals = rolls.filter((r) => r.trait === "normal");
    expect(strongs.length).toBeGreaterThan(5);
    expect(timids.length).toBeGreaterThan(5);
    expect(normals.length).toBeGreaterThan(strongs.length + timids.length);
    // 決定性：同じ鍵なら同じ個体
    const a = rollIndividual(WOLF, createRng("same-enc"), INDIVIDUAL);
    const b = rollIndividual(WOLF, createRng("same-enc"), INDIVIDUAL);
    expect(a).toEqual(b);
    // 強い個体はHP・威力・挑戦差が上がる。行動パターンはそのまま
    for (const r of strongs) {
      expect(r.def.hp).toBeGreaterThan(WOLF.hp);
      expect(r.def.attack.power).toBeGreaterThan(WOLF.attack.power);
      expect(r.def.challenge).toBe(WOLF.challenge + INDIVIDUAL.strongChallengeBonus);
      expect(r.def.pattern).toEqual(WOLF.pattern);
    }
    // 臆病な個体は威力が下がり・間隔が伸び・挑戦差が下がる
    for (const r of timids) {
      expect(r.def.attack.power).toBeLessThan(WOLF.attack.power);
      expect(r.def.intervalTicks).toBeGreaterThan(WOLF.intervalTicks);
      expect(r.def.challenge).toBe(WOLF.challenge + INDIVIDUAL.timidChallengeBonus);
    }
    // 普通の個体は小さなジッターのみ（桁が変わるような変化はない）
    for (const r of normals) {
      expect(r.def.hp).toBeGreaterThan(WOLF.hp * 0.8);
      expect(r.def.hp).toBeLessThan(WOLF.hp * 1.2);
      expect(r.def.challenge).toBe(WOLF.challenge);
    }
  });
});

/* ── step 統合：GameState を通した流れ ── */

const SKILL_IDS = ["swordplay", "evasion", "smithing", "mining", "eloquence"];

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

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 50,
};

const startWorld = (seed: string): GameState => newGame(seed, "名無し", newGameCfg);
const cfg = (): StepConfig => ({ ...cfgBase, variance: VARIANCE });

describe("R-01 揺らぎ：step 統合", () => {
  it("訓練：同じシードでは同じ経験、別のシードでは散る（揺らぎなしでは同じ）", () => {
    const train = (s: GameState, c: StepConfig) =>
      s.player.skills["swordplay"] !== undefined
        ? step(s, { type: "train", skill: "swordplay", difficulty: 10 }, c).state.player.skills[
            "swordplay"
          ]!.pending
        : 0;
    const seeds = Array.from({ length: 30 }, (_, i) => `w-g${i}`);
    const flat = seeds.map((s) => train(startWorld(s), cfgBase));
    expect(new Set(flat).size).toBe(1); // 揺らぎなしでは同一
    const varied = seeds.map((s) => train(startWorld(s), cfg()));
    expect(new Set(varied).size).toBeGreaterThan(10); // 揺らぎで散る
    // 決定性：同じ世界・同じ行動列は同じ結果
    const w = startWorld("det-seed");
    const c = cfg();
    expect(train(w, c)).toBe(train(w, c));
  });

  it("仕事：品質が素材の質で揺らぎ、報酬に市場と客の機嫌が乗る", () => {
    const work = (s: GameState, c: StepConfig) =>
      step(s, { type: "work", kind: "smithing", quality: 50, difficulty: 50, rewardMoney: 100 }, c);
    const seeds = Array.from({ length: 30 }, (_, i) => `w-w${i}`);
    // 品質は素材の質（日×種目）で揺らぐ → 台帳の品質が種ごとに違う
    const qualities = seeds.map((s) => {
      const r = work(startWorld(s), cfg());
      const rec = r.events.find((e) => e.type === "workRecorded");
      return rec?.type === "workRecorded" ? rec.work.quality : -1;
    });
    expect(new Set(qualities).size).toBeGreaterThan(5);
    // 報酬も市場・機嫌で揺らぐ
    const pays = seeds.map((s) => {
      const r = work(startWorld(s), cfg());
      const p = r.events.find((e) => e.type === "moneyPaid");
      return p?.type === "moneyPaid" ? p.amount : -1;
    });
    expect(new Set(pays).size).toBeGreaterThan(3);
    // 決定性
    const w = startWorld("det-work");
    expect(work(w, cfg()).state.ledger[0]?.quality).toBe(work(w, cfg()).state.ledger[0]?.quality);
  });

  it("仕事：失敗作/会心作の旗が作品に付く", () => {
    const alwaysFail: StepConfig = {
      ...cfg(),
      variance: { ...VARIANCE, work: { ...WORK, failChance: 1.0, critChance: 0 } },
    };
    const r = step(
      startWorld("w-fail"),
      { type: "work", kind: "smithing", quality: 50, difficulty: 50 },
      alwaysFail,
    );
    const rec = r.events.find((e) => e.type === "workRecorded");
    expect(rec?.type === "workRecorded" && rec.work.flags.includes("失敗作")).toBe(true);
    expect(rec?.type === "workRecorded" && rec.work.quality).toBeLessThan(50);
    const alwaysCrit: StepConfig = {
      ...cfg(),
      variance: { ...VARIANCE, work: { ...WORK, failChance: 0, critChance: 1.0 } },
    };
    const r2 = step(
      startWorld("w-crit"),
      { type: "work", kind: "smithing", quality: 50, difficulty: 50 },
      alwaysCrit,
    );
    const rec2 = r2.events.find((e) => e.type === "workRecorded");
    expect(rec2?.type === "workRecorded" && rec2.work.flags.includes("会心作")).toBe(true);
    expect(rec2?.type === "workRecorded" && rec2.work.quality).toBeGreaterThan(50);
  });

  it("睡眠：体調と冴えが起床ログの行になる", () => {
    const texts = {
      insight: "INSIGHT",
      conditionGood: "GOOD",
      conditionPoor: "POOR",
    };
    const allGood: StepConfig = {
      ...cfg(),
      variance: {
        ...VARIANCE,
        texts,
        condition: { ...CONDITION, goodChance: 1.0, poorChance: 0 },
        gain: { ...GAIN, insightChance: 1.0 },
      },
    };
    const r = step(startWorld("w-cond"), { type: "sleep", inn: "good", dinner: true }, allGood);
    const report = r.events.find((e) => e.type === "wakeReport");
    expect(report?.type).toBe("wakeReport");
    if (report?.type === "wakeReport") {
      expect(report.report.surprises).toContain("GOOD");
      expect(report.report.surprises).toContain("INSIGHT");
    }
    const allPoor: StepConfig = {
      ...cfg(),
      variance: {
        ...VARIANCE,
        texts,
        condition: { ...CONDITION, goodChance: 0, poorChance: 10 },
        gain: { ...GAIN, insightChance: 0 },
      },
    };
    const r2 = step(startWorld("w-cond2"), { type: "sleep", inn: "cheap", dinner: false }, allPoor);
    const report2 = r2.events.find((e) => e.type === "wakeReport");
    if (report2?.type === "wakeReport") {
      expect(report2.report.surprises).toContain("POOR");
      expect(report2.report.surprises).not.toContain("GOOD");
    }
  });

  it("師匠：今日いない日は弟子入りも稽古も叶わない", () => {
    const mentorsCfg = {
      mentors: [{ id: "m1", npc: "npc.x", skill: "smithing", fee: 0 }],
      potentialMax: 100,
    };
    const awayCfg: StepConfig = {
      ...cfg(),
      mentors: mentorsCfg,
      variance: { ...VARIANCE, npc: { awayChance: 1.0 } },
    };
    // 弟子入り：いない日は mentorAway イベントだけ返る
    const r = step(startWorld("w-m"), { type: "apprentice", id: "m1" }, awayCfg);
    expect(r.events.some((e) => e.type === "mentorAway" && e.id === "m1")).toBe(true);
    expect(r.events.some((e) => e.type === "mentorApprenticed")).toBe(false);
    // いる日は普通に弟子入りできる
    const homeCfg: StepConfig = {
      ...cfg(),
      mentors: mentorsCfg,
      variance: { ...VARIANCE, npc: { awayChance: 0 } },
    };
    const r2 = step(startWorld("w-m"), { type: "apprentice", id: "m1" }, homeCfg);
    expect(r2.events.some((e) => e.type === "mentorApprenticed" && e.id === "m1")).toBe(true);
    // 弟子入り後の稽古も、いない日は叶わない（行動も消費しない）
    const r3 = step(r2.state, { type: "trainWithMentor", difficulty: 10 }, awayCfg);
    expect(r3.events.some((e) => e.type === "mentorAway" && e.id === "m1")).toBe(true);
    expect(r3.events.some((e) => e.type === "mentorTrained")).toBe(false);
    expect(r3.state.time.day).toBe(r2.state.time.day);
  });

  it("揺らぎは state.rng を消費しない（睡眠経路の乱数状態が変わらない）", () => {
    // state.rng を進める経路（睡眠は追い風の抽選で消費する）で比較する ——
    // 揺らぎを付けても rng の残量が同じなら、揺らぎは独立した列から引かれている
    const a = step(startWorld("w-r2"), { type: "rest" }, cfg());
    const b = step(startWorld("w-r2"), { type: "rest" }, cfgBase);
    expect(a.state.rng).toEqual(b.state.rng);
  });

  it("揺らぎは決定的（同じシード・同じ行動列は同じ結果）", () => {
    const c = cfg();
    const run = (s: GameState) => {
      const r1 = step(s, { type: "wait" }, c);
      return step(r1.state, { type: "train", skill: "swordplay", difficulty: 10 }, c);
    };
    const a = run(startWorld("w-order"));
    const b = run(startWorld("w-order"));
    expect(a.events.find((e) => e.type === "gainApplied")).toEqual(
      b.events.find((e) => e.type === "gainApplied"),
    );
    // 行動が1つ増えれば（行動序数が違えば）別の抽選になる
    const direct = step(
      startWorld("w-order"),
      { type: "train", skill: "swordplay", difficulty: 10 },
      c,
    );
    // 等しいとは限らないが、両方とも決定的（同じ呼び出しを繰り返せば同じ）
    expect(direct.events.find((e) => e.type === "gainApplied")).toEqual(
      step(
        startWorld("w-order"),
        { type: "train", skill: "swordplay", difficulty: 10 },
        c,
      ).events.find((e) => e.type === "gainApplied"),
    );
  });
});
