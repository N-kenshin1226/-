import { describe, expect, it } from "vitest";
import { evaluate } from "../conditions/index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { ActionEvent } from "../events/index.js";
import type { GameState } from "../state/types.js";
import { describe as describeTime, type TimeConfig } from "../time/index.js";
import type { DiscoveryDef } from "../discoveries/index.js";
import { weatherOf, weatherPriceFactor, weatherToday, type WeatherConfig } from "./index.js";

/**
 * 天候（X-13、docs/03 §2・§5）のテスト。
 * ・同じ世界・同じ日なら同じ天候（seed+day の決定的な導出値）
 * ・天候を引いても世界を進める乱数列（state.rng）は消費しない
 * ・季節で分布が変わり、雪は冬にだけ出る（重み0の季節には出ない）
 * ・条件DSLの {weather} が効く（天候表の無い世界では成立しない）
 * ・天候つきの発見は、その天候の日にだけ見つかる
 * ・注文の報酬に天候の日替わり係数が乗る（balance.weather.orderPrice）
 * ・起床レポートに今日の空（種類＋風景の行）が載る
 */

const TIME: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 4,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

/** 本番（weather.json）と同じ設計の天候表：雪は冬だけ、夏は晴れが多い */
const WEATHER: WeatherConfig = {
  kinds: [
    { id: "clear", name: "晴れ", seasonWeights: [40, 45, 35, 30], lines: ["晴れの行"] },
    { id: "cloud", name: "曇り", seasonWeights: [30, 25, 35, 30], lines: ["曇りの行"] },
    { id: "rain", name: "雨", seasonWeights: [30, 30, 30, 10], lines: ["雨の行"] },
    { id: "snow", name: "雪", seasonWeights: [0, 0, 0, 30], lines: ["雪の行"] },
  ],
  orderPrice: {
    rain: { mining: 0.8, fishing: 1.2 },
    snow: { "*": 0.9 },
  },
};

/** 常に同じ天候が出る表（{weather} 条件・発見のテスト用） */
const always = (id: string): WeatherConfig => ({
  kinds: [{ id, name: id, seasonWeights: [1, 1, 1, 1], lines: [`${id}の行`] }],
});

const cfgBase: StepConfig = {
  time: TIME,
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
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [],
};

const SKILL_IDS = [
  "swordplay",
  "evasion",
  "observation",
  "smithing",
  "mining",
  "eloquence",
  "fishing",
  "performance",
  "appraisal",
];

const startWorld = (seed: string): GameState =>
  newGame(seed, "名無し", {
    skillIds: SKILL_IDS,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 50,
  });

const moneyPaid = (evs: ActionEvent[]): number | undefined =>
  evs.find((e): e is Extract<ActionEvent, { type: "moneyPaid" }> => e.type === "moneyPaid")?.amount;

describe("天候（X-13、docs/03 §2・§5）", () => {
  it("同じ世界・同じ日は同じ天候と同じ風景の行（seed+day の決定的な導出値）", () => {
    const a = weatherOf("w1", 10, WEATHER, TIME);
    const b = weatherOf("w1", 10, WEATHER, TIME);
    expect(a).toEqual(b);
    expect(a.kind.id).toBe(b.kind.id);
    expect(a.line).toBe(b.line);
    // 別の日・別の世界では空が変わりうる（全日同一ではないことも確かめる）
    const days = new Set(
      Array.from({ length: 40 }, (_, d) => weatherOf("w1", d, WEATHER, TIME).kind.id),
    );
    expect(days.size).toBeGreaterThan(1);
    const worlds = new Set(
      Array.from({ length: 16 }, (_, i) => weatherOf(`w${i}`, 3, WEATHER, TIME).kind.id),
    );
    expect(worlds.size).toBeGreaterThan(1);
  });

  it("天候を引いても state.rng は消費しない（step 前後で乱数列が同じ）", () => {
    const s = startWorld("w1");
    const rngBefore = s.rng;
    weatherToday(s, WEATHER, TIME);
    weatherPriceFactor(s, WEATHER, TIME, "mining");
    evaluate({ weather: "rain" }, s, TIME, { weather: WEATHER });
    expect(s.rng).toBe(rngBefore);
    // step の乱数列も天候の有無でずれない（独立した乱数列）
    const withWeather = step(s, { type: "wait" }, { ...cfgBase, weather: WEATHER }).state;
    const without = step(s, { type: "wait" }, cfgBase).state;
    expect(withWeather.rng).toEqual(without.rng);
  });

  it("季節で分布が変わる：雪は冬だけに出て、夏は冬より晴れが多い", () => {
    // 各季節の日付（daysPerSeason=4：季節 s の日は 4s..4s+3）
    const bySeason = (season: number) => {
      const counts = new Map<string, number>();
      for (let w = 0; w < 40; w++) {
        for (let d = 0; d < TIME.daysPerSeason; d++) {
          const day = season * TIME.daysPerSeason + d;
          const id = weatherOf(`s${w}`, day, WEATHER, TIME).kind.id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      return counts;
    };
    for (let season = 0; season < TIME.seasonsPerYear; season++) {
      const counts = bySeason(season);
      if (season === 3) {
        // 冬は雪が出る（seasonWeights[3]=30）
        expect(counts.get("snow") ?? 0).toBeGreaterThan(0);
      } else {
        // 雪は冬だけ（seasonWeights が 0 の季節には出ない）
        expect(counts.get("snow") ?? 0).toBe(0);
      }
    }
    // 分布が季節で変わること：夏（添字1、晴れ45/100）の晴れ率は
    // 冬（添字3、晴れ30/100）より高い
    const summer = bySeason(1);
    const winter = bySeason(3);
    const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const clearSummer = (summer.get("clear") ?? 0) / total(summer);
    const clearWinter = (winter.get("clear") ?? 0) / total(winter);
    expect(clearSummer).toBeGreaterThan(clearWinter);
  });

  it("条件DSLの {weather}：今日の天候idの集合一致。天候表が無ければ成立しない", () => {
    const s = startWorld("w1");
    const env = { weather: always("rain") };
    expect(evaluate({ weather: "rain" }, s, TIME, env)).toBe(true);
    expect(evaluate({ weather: "snow" }, s, TIME, env)).toBe(false);
    // 配列は集合一致（どれかに合えば真）
    expect(evaluate({ weather: ["clear", "rain"] }, s, TIME, env)).toBe(true);
    // 天候表の無い世界（env 省略）では {weather} 条件は成立しない
    expect(evaluate({ weather: "rain" }, s, TIME)).toBe(false);
    expect(evaluate({ weather: "rain" }, s, TIME, {})).toBe(false);
    // and/or/not の内側でも効く
    expect(
      evaluate({ and: [{ weather: "rain" }, { not: { weather: "snow" } }] }, s, TIME, env),
    ).toBe(true);
  });

  it("天候つきの発見：雨の日にだけ見つかり、他の空では見つからない", () => {
    const rainWell: DiscoveryDef = {
      id: "rain_well",
      name: "雨宿りの井戸",
      foundText: "――雨の井戸を見つけた。",
      hint: "雨の日にだけ見える井戸があるという",
      condition: {
        and: [{ weather: "rain" }, { within: { days: 1, kind: "wait", atLeast: 1 } }],
      },
      setFlags: ["seen.rain_well"],
    };
    const cfg = { ...cfgBase, weather: always("rain"), discoveries: [rainWell] };
    // 雨の世界では足を止める（wait）と見つかる
    let s = startWorld("w1");
    const r = step(s, { type: "wait" }, cfg);
    expect(r.events.some((e) => e.type === "discovery" && e.id === "rain_well")).toBe(true);
    expect(r.state.flags["found.rain_well"]).toBe(true);
    // 雨ではない世界では同じ行動でも見つからない
    const dry = { ...cfgBase, weather: always("clear"), discoveries: [rainWell] };
    s = startWorld("w1");
    const r2 = step(s, { type: "wait" }, dry);
    expect(r2.events.some((e) => e.type === "discovery")).toBe(false);
    expect(r2.state.flags["found.rain_well"]).not.toBe(true);
    // 天候表の無い世界では天候条件は成立しない
    const noTable = { ...cfgBase, discoveries: [rainWell] };
    const r3 = step(startWorld("w1"), { type: "wait" }, noTable);
    expect(r3.state.flags["found.rain_well"]).not.toBe(true);
  });

  it("実際の天候表でも「その天候の日」にだけ発見が起きる", () => {
    const rainWell: DiscoveryDef = {
      id: "rain_well",
      name: "雨宿りの井戸",
      foundText: "――雨の井戸を見つけた。",
      hint: "雨の日にだけ見える井戸があるという",
      condition: {
        and: [{ weather: "rain" }, { within: { days: 1, kind: "wait", atLeast: 1 } }],
      },
      setFlags: [],
    };
    const cfg = { ...cfgBase, weather: WEATHER, discoveries: [rainWell] };
    // シード w1 で雨の日と雨でない日を見つける
    let rainDay = -1;
    let dryDay = -1;
    for (let d = 0; d < 40 && (rainDay < 0 || dryDay < 0); d++) {
      const id = weatherOf("w1", d, WEATHER, TIME).kind.id;
      if (id === "rain" && rainDay < 0) rainDay = d;
      if (id !== "rain" && dryDay < 0) dryDay = d;
    }
    expect(rainDay).toBeGreaterThanOrEqual(0);
    expect(dryDay).toBeGreaterThanOrEqual(0);
    const toDay = (s: GameState, day: number): GameState => {
      let x = s;
      while (x.time.day < day) x = step(x, { type: "rest" }, cfg).state;
      return x;
    };
    // 雨の日に待つ → 見つかる
    let s = toDay(startWorld("w1"), rainDay);
    let r = step(s, { type: "wait" }, cfg);
    expect(r.events.some((e) => e.type === "discovery" && e.id === "rain_well")).toBe(true);
    // 雨でない日に待つ → 見つからない
    s = toDay(startWorld("w1"), dryDay);
    r = step(s, { type: "wait" }, cfg);
    expect(r.state.flags["found.rain_well"]).not.toBe(true);
    // 雨の日を過ぎても同じ日の行動履歴が残らなければ出ない
    s = toDay(startWorld("w1"), rainDay + 1);
    if (weatherOf("w1", rainDay + 1, WEATHER, TIME).kind.id !== "rain") {
      r = step(s, { type: "wait" }, cfg);
      expect(r.state.flags["found.rain_well"]).not.toBe(true);
    }
  });

  it("注文の報酬に天候の日替わり係数が乗る（雨の採掘は8掛け、設定の無い系統は1）", () => {
    const s = startWorld("w1");
    // 常に雨の世界では balance.weather.orderPrice.rain が効く
    const rainy = always("rain");
    rainy.orderPrice = WEATHER.orderPrice;
    expect(weatherPriceFactor(s, rainy, TIME, "mining")).toBe(0.8);
    expect(weatherPriceFactor(s, rainy, TIME, "fishing")).toBe(1.2);
    expect(weatherPriceFactor(s, rainy, TIME, "smithing")).toBe(1);
    // 雪の "*" 既定値：未指定の系統にも乗る
    const snowy = always("snow");
    snowy.orderPrice = WEATHER.orderPrice;
    expect(weatherPriceFactor(s, snowy, TIME, "smithing")).toBe(0.9);
    // 天候表・係数表が無ければ 1（影響なし）
    expect(weatherPriceFactor(s, undefined, TIME, "mining")).toBe(1);
    expect(weatherPriceFactor(s, always("rain"), TIME, "mining")).toBe(1);
    // step の支払いにも同じ係数が乗る
    const cmd = { type: "work", kind: "mining", quality: 10, difficulty: 10, rewardMoney: 100 };
    const paidRain = moneyPaid(step(s, cmd as never, { ...cfgBase, weather: rainy }).events);
    const paidNone = moneyPaid(step(s, cmd as never, cfgBase).events);
    expect(paidRain).toBe(80);
    expect(paidNone).toBe(100);
  });

  it("起床レポートに今日の空（種類・表示名・風景の行）が載る", () => {
    const cfg = { ...cfgBase, weather: WEATHER };
    const s = startWorld("w1");
    const r = step(s, { type: "rest" }, cfg);
    const report = r.events.find(
      (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
    )?.report;
    expect(report?.weather).toBeDefined();
    const w = weatherOf(r.state.seed, r.state.time.day, WEATHER, TIME);
    expect(report?.weather?.id).toBe(w.kind.id);
    expect(report?.weather?.name).toBe(w.kind.name);
    expect(report?.weather?.line).toBe(w.line);
    // 天候表の無い世界では載らない
    const r2 = step(s, { type: "rest" }, cfgBase);
    const report2 = r2.events.find(
      (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
    )?.report;
    expect(report2?.weather).toBeUndefined();
  });

  it("季節の求め方は暦と同じ（seasonWeights の添字は describe の season）", () => {
    // 冬（季節3）の日だけ雪になりうる表で、暦の季節と抽選が一致することを確かめる
    for (let d = 0; d < TIME.daysPerSeason * TIME.seasonsPerYear; d++) {
      const season = describeTime({ day: d, action: 0 }, TIME).season;
      const w = weatherOf("w-season", d, WEATHER, TIME);
      if (w.kind.id === "snow") expect(season).toBe(3);
    }
  });
});
