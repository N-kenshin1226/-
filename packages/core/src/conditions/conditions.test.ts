import { describe, expect, it } from "vitest";
import { evaluate, type Cond } from "./index.js";
import { findContradictions, isContradiction } from "./check.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { TimeConfig } from "../time/index.js";

const time: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const cfg: StepConfig = {
  time,
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
  skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
  initialPotential: 100,
  initialStatValue: 10,
};

function state() {
  const g = newGame("c1", "条件", newGameCfg);
  g.player.skills.swordplay!.value = 30;
  g.player.stats.strength = 15;
  g.counters["action.train"] = 12;
  g.counters["kill.species.wolf"] = 100;
  g.flags["met.merchant"] = true;
  g.actionLog.push(
    { day: 0, kind: "train", target: "swordplay" },
    { day: 0, kind: "train", target: "swordplay" },
    { day: 0, kind: "train", target: "smithing" },
    { day: 0, kind: "wait" },
  );
  return g;
}

const ev = (c: Cond, g = state()) => evaluate(c, g, time);

describe("evaluate: 各演算", () => {
  it("counter: gte/lte/eq", () => {
    expect(ev({ counter: "kill.species.wolf", gte: 100 })).toBe(true);
    expect(ev({ counter: "kill.species.wolf", gte: 101 })).toBe(false);
    expect(ev({ counter: "kill.species.wolf", lte: 100 })).toBe(true);
    expect(ev({ counter: "kill.species.wolf", eq: 100 })).toBe(true);
    expect(ev({ counter: "missing", gte: 1 })).toBe(false);
  });

  it("flag: 既定は true、eq:false も可", () => {
    expect(ev({ flag: "met.merchant" })).toBe(true);
    expect(ev({ flag: "met.king" })).toBe(false);
    expect(ev({ flag: "met.king", eq: false })).toBe(true);
  });

  it("skill / stat: 現在値の比較", () => {
    expect(ev({ skill: "swordplay", gte: 30 })).toBe(true);
    expect(ev({ skill: "swordplay", gte: 31 })).toBe(false);
    expect(ev({ skill: "unknown", gte: 1 })).toBe(false);
    expect(ev({ stat: "strength", gte: 15 })).toBe(true);
    expect(ev({ stat: "strength", lte: 14 })).toBe(false);
  });

  it("time: describe の項目で比較（day 0 = 朝・year 0・age 15）", () => {
    expect(ev({ time: { day: { gte: 0 } } })).toBe(true);
    expect(ev({ time: { age: { gte: 15 } } })).toBe(true);
    expect(ev({ time: { year: { eq: 0 } } })).toBe(true);
    expect(ev({ time: { weekday: 0 } })).toBe(true);
    expect(ev({ time: { weekday: [1, 2, 3] } })).toBe(false);
    expect(ev({ time: { moon: "new" } })).toBe(true); // day 0 は新月
    expect(ev({ time: { moon: "full" } })).toBe(false);
    expect(ev({ time: { timeOfDay: "morning" } })).toBe(true);
    expect(ev({ time: { timeOfDay: "night" } })).toBe(false);
  });

  it("and / or / not", () => {
    const both: Cond = {
      and: [
        { skill: "swordplay", gte: 10 },
        { counter: "kill.species.wolf", gte: 100 },
      ],
    };
    expect(ev(both)).toBe(true);
    expect(
      ev({
        and: [
          { skill: "swordplay", gte: 10 },
          { skill: "swordplay", gte: 50 },
        ],
      }),
    ).toBe(false);
    expect(ev({ or: [{ skill: "swordplay", gte: 50 }, { flag: "met.merchant" }] })).toBe(true);
    expect(ev({ or: [{ skill: "swordplay", gte: 50 }, { flag: "met.king" }] })).toBe(false);
    expect(ev({ not: { flag: "met.king" } })).toBe(true);
    expect(ev({ not: { flag: "met.merchant" } })).toBe(false);
  });

  it("within: 直近N日の行動回数", () => {
    // day 0 に train×3 (swordplay×2, smithing×1)
    expect(ev({ within: { days: 1, kind: "train", atLeast: 3 } })).toBe(true);
    expect(ev({ within: { days: 1, kind: "train", atLeast: 4 } })).toBe(false);
    expect(ev({ within: { days: 1, kind: "train", target: "swordplay", atLeast: 2 } })).toBe(true);
    expect(ev({ within: { days: 1, kind: "wait", atLeast: 1 } })).toBe(true);
    // 直近1日=当日のみ。day を進めると対象外になる
    const g = state();
    g.time = { day: 3, action: 0 };
    expect(evaluate({ within: { days: 1, kind: "train", atLeast: 1 } }, g, time)).toBe(false);
    expect(evaluate({ within: { days: 4, kind: "train", atLeast: 3 } }, g, time)).toBe(true);
  });

  it("work: 台帳未実装のため常に false", () => {
    expect(ev({ work: {} })).toBe(false);
    expect(ev({ work: { count: { atLeast: 1 } } })).toBe(false);
  });

  it("npcGone: 町から去った住人の数（X-31。宿主町は env.town）", () => {
    const g = state();
    g.flags["npc.gone.npc.t3.smith"] = true;
    g.flags["npc.gone.npc.t3.innkeeper"] = true;
    g.flags["npc.gone.npc.t5.mentor"] = true;
    g.flags["npc.gone.marta"] = true; // 正史世界の住人 —— 町を内包しない
    g.flags["npc.married.npc.t3.priest"] = true; // 退場でない印は数えない
    // 既定 min=1、町は env.town（評価中の場所の宿主町）
    expect(evaluate({ npcGone: {} }, g, time, { town: "t3" })).toBe(true);
    expect(evaluate({ npcGone: {} }, g, time, { town: "t9" })).toBe(false);
    // 明示 town と min
    expect(evaluate({ npcGone: { town: "t3", min: 2 } }, g, time)).toBe(true);
    expect(evaluate({ npcGone: { town: "t3", min: 3 } }, g, time)).toBe(false);
    expect(evaluate({ npcGone: { town: "t5" } }, g, time)).toBe(true);
    // town も env.town も無い → 成立しない
    expect(evaluate({ npcGone: {} }, g, time)).toBe(false);
  });

  it("money: 所持金の比較（X-9。累計売上は counter の money.earned を使う）", () => {
    const g = state();
    g.player.money = 500;
    expect(ev({ money: { gte: 500 } }, g)).toBe(true);
    expect(ev({ money: { gte: 501 } }, g)).toBe(false);
    expect(ev({ money: { lte: 500 } }, g)).toBe(true);
    expect(ev({ money: { eq: 500 } }, g)).toBe(true);
    // 矛盾検査でも counter と同じく範囲が拾える
    expect(
      findContradictions([
        { id: "a", condition: { and: [{ money: { gte: 100 } }, { money: { lte: 50 } }] } },
      ]),
    ).toEqual(["a"]);
  });
});

describe("isContradiction", () => {
  it("同じ対象に交わらない範囲 → 矛盾", () => {
    expect(
      isContradiction({
        and: [
          { counter: "x", gte: 10 },
          { counter: "x", lte: 5 },
        ],
      }),
    ).toBe(true);
    expect(
      isContradiction({
        and: [
          { skill: "a", gte: 10 },
          { skill: "a", eq: 5 },
        ],
      }),
    ).toBe(true);
  });

  it("交わる範囲・別の対象・or の一部矛盾は許す", () => {
    expect(
      isContradiction({
        and: [
          { counter: "x", gte: 5 },
          { counter: "x", lte: 10 },
        ],
      }),
    ).toBe(false);
    expect(
      isContradiction({
        and: [
          { counter: "x", gte: 10 },
          { counter: "y", lte: 5 },
        ],
      }),
    ).toBe(false);
    // or は「全部の枝が矛盾」のときだけ矛盾
    expect(
      isContradiction({
        or: [
          {
            and: [
              { counter: "x", gte: 10 },
              { counter: "x", lte: 5 },
            ],
          },
          { counter: "y", gte: 1 },
        ],
      }),
    ).toBe(false);
    expect(
      isContradiction({
        or: [
          {
            and: [
              { counter: "x", gte: 10 },
              { counter: "x", lte: 5 },
            ],
          },
          {
            and: [
              { skill: "a", gte: 10 },
              { skill: "a", lte: 1 },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("findContradictions で一覧できる", () => {
    const ids = findContradictions([
      { id: "ok", condition: { counter: "x", gte: 1 } },
      {
        id: "bad",
        condition: {
          and: [
            { stat: "strength", gte: 9 },
            { stat: "strength", lte: 5 },
          ],
        },
      },
    ]);
    expect(ids).toEqual(["bad"]);
  });
});

describe("称号の購読（step 統合）", () => {
  const titles = [
    {
      id: "title.ten_wolves",
      rank: "B" as const,
      condition: { counter: "kill.species.wolf", gte: 100 } as Cond,
    },
    {
      id: "title.sword_30",
      rank: "A" as const,
      condition: { skill: "swordplay", gte: 30 } as Cond,
    },
  ];

  it("条件を満たすと titleGained が出て state.titles に入る", () => {
    const g = state();
    const { state: g1, events } = step(g, { type: "wait" }, { ...cfg, titles });
    expect(g1.titles).toContain("title.ten_wolves");
    expect(g1.titles).toContain("title.sword_30");
    const gained = events.filter((e) => e.type === "titleGained").map((e) => e.id);
    expect(gained).toEqual(["title.ten_wolves", "title.sword_30"]);
    expect(g1.counters["title.total"]).toBe(2);
  });

  it("同じ称号は二重に獲得しない", () => {
    const g = state();
    const { state: g1 } = step(g, { type: "wait" }, { ...cfg, titles });
    const { events: e2 } = step(g1, { type: "wait" }, { ...cfg, titles });
    expect(e2.filter((e) => e.type === "titleGained")).toHaveLength(0);
    expect(g1.counters["title.total"]).toBe(2);
  });
});
