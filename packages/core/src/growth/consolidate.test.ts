import { describe, expect, it } from "vitest";
import { consolidateSleep, sleepQuality, type SleepConfig } from "./consolidate.js";
import { newGame } from "../state/newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";

const sleep: SleepConfig = {
  nightlyCapPerSkill: 8.0,
  nightlyCapTotal: 999,
  carryoverRatio: 0.5,
  innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
  dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
  qualityMin: 0.6,
  qualityMax: 1.2,
  potentialDecayPerPoint: 0.01,
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
  sleep,
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
};

const newGameCfg = {
  skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
  initialPotential: 100,
  initialStatValue: 10,
};

function withPending(partial: Record<string, number>): GameState {
  const g = newGame("t6", "定着", newGameCfg);
  for (const [id, p] of Object.entries(partial)) {
    const s = g.player.skills[id];
    if (s) s.pending = p as number;
  }
  return g;
}

describe("sleepQuality", () => {
  it("宿ランク × 夕食の2要因", () => {
    expect(sleepQuality("normal", true, sleep)).toBeCloseTo(1.1);
    expect(sleepQuality("cheap", false, sleep)).toBeCloseTo(0.68);
    expect(sleepQuality("good", true, sleep)).toBeCloseTo(1.2); // 1.15*1.1=1.265 → 上限
  });

  it("qualityMin/Max でクランプ", () => {
    const extreme = {
      ...sleep,
      innFactors: { cheap: 0.1, normal: 1.0, good: 5.0 },
    };
    expect(sleepQuality("cheap", false, extreme)).toBe(0.6);
    expect(sleepQuality("good", true, extreme)).toBe(1.2);
  });
});

describe("定着", () => {
  it("睡眠の質ごとに定着量が変わる", () => {
    const g = withPending({ swordplay: 10 });
    const { state: a } = consolidateSleep(g, "cheap", false, sleep); // q=.68, cap=5.44
    const { state: b } = consolidateSleep(g, "good", true, sleep); // q=1.2, cap=9.6
    expect(a.player.skills.swordplay!.value).toBeCloseTo(5.44, 2);
    expect(b.player.skills.swordplay!.value).toBeCloseTo(9.6, 2);
    expect(b.player.skills.swordplay!.value).toBeGreaterThan(a.player.skills.swordplay!.value);
  });

  it("上限超過分は carryoverRatio が持ち越し、残りは消失", () => {
    const g = withPending({ swordplay: 20 });
    const { state } = consolidateSleep(g, "normal", false, sleep); // q=.85, cap=6.8
    const s = state.player.skills.swordplay!;
    expect(s.value).toBeCloseTo(6.8);
    // (20 − 6.8) × 0.5 = 6.6 持ち越し、残り 6.6 は消失
    expect(s.pending).toBeCloseTo(6.6);
  });

  it("pending が上限以下なら全量定着して pending は 0", () => {
    const g = withPending({ swordplay: 3 });
    const { state } = consolidateSleep(g, "normal", false, sleep);
    expect(state.player.skills.swordplay!.value).toBeCloseTo(3);
    expect(state.player.skills.swordplay!.pending).toBe(0);
  });

  it("peak と素質が更新される", () => {
    const g = withPending({ swordplay: 5 });
    const { state } = consolidateSleep(g, "good", true, sleep); // cap 9.6 → 全量
    const s = state.player.skills.swordplay!;
    expect(s.value).toBeCloseTo(5);
    expect(s.peak).toBeCloseTo(5);
    // 素質: 100 × (1−0.01)^5
    expect(s.potential).toBeCloseTo(100 * Math.pow(0.99, 5));
  });

  it("合計上限：全スキルの定着合計が nightlyCapTotal を超えると比例配分", () => {
    const tight: SleepConfig = { ...sleep, nightlyCapPerSkill: 10, nightlyCapTotal: 6 };
    const g = withPending({ swordplay: 10, smithing: 10, evasion: 10 });
    // q=0.85 → スキル上限8.5、合計上限5.1。需要30に対し5.1を按分
    const { state } = consolidateSleep(g, "normal", false, tight);
    const applied =
      state.player.skills.swordplay!.value +
      state.player.skills.smithing!.value +
      state.player.skills.evasion!.value;
    expect(applied).toBeCloseTo(6 * 0.85, 5);
    // 均等按分（各 1.7）
    expect(state.player.skills.swordplay!.value).toBeCloseTo(1.7);
  });

  it("peak は下がらない（再定着で value < peak でも保持）", () => {
    const g = withPending({ swordplay: 5 });
    const { state: s1 } = consolidateSleep(g, "good", true, sleep);
    expect(s1.player.skills.swordplay!.peak).toBeCloseTo(5);
  });
});

describe("起床ログ", () => {
  it("伸びの小さい順に並び、予想外の1行の枠が最後", () => {
    const g = withPending({ swordplay: 6, smithing: 2, evasion: 4 });
    const { report } = consolidateSleep(g, "good", true, sleep); // cap 9.6 → 全量
    const deltas = report.lines.map((l) => l.delta);
    expect(deltas).toEqual([...deltas].sort((a, b) => a - b));
    expect(report.lines.map((l) => l.id)).toEqual(["smithing", "evasion", "swordplay"]);
    expect(report.surprises).toEqual([]);
    expect(report.quality).toBeCloseTo(1.2);
  });

  it("step の sleep で wakeReport イベントが出る（inn/dinner 指定）", () => {
    const g = withPending({ swordplay: 2 });
    const { events } = step(g, { type: "sleep", inn: "good", dinner: true }, cfg);
    const wake = events.find((e) => e.type === "wakeReport");
    expect(wake).toBeDefined();
    expect((wake as { report: { quality: number } }).report.quality).toBeCloseTo(1.2);
  });

  it("デフォルトは normal / 夕食なし", () => {
    const g = withPending({ swordplay: 2 });
    const { events } = step(g, { type: "sleep" } satisfies Command, cfg);
    const wake = events.find((e) => e.type === "wakeReport") as {
      report: { quality: number; inn: string; dinner: boolean };
    };
    expect(wake.report.inn).toBe("normal");
    expect(wake.report.dinner).toBe(false);
    expect(wake.report.quality).toBeCloseTo(0.85);
  });
});
