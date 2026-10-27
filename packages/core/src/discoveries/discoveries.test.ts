import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { ActionEvent } from "../events/index.js";
import type { GameState } from "../state/types.js";
import { describe as describeTime } from "../time/index.js";
import { rankOf } from "../notify/index.js";
import {
  checkDiscoveries,
  dailyDiscoveryHint,
  discoveryHintText,
  discoveryParams,
  resolveDiscoveryCondition,
  unfoundDiscoveries,
  type DiscoveryDef,
} from "./index.js";

/**
 * 隠し要素（X-11、docs/03 §5）のテスト。
 * ・条件を満たすと found.<id>＋setFlags が立ち discovery イベント＋B通知が出る
 * ・found.<id> 済みは二度と発火しない（冪等）
 * ・ヒントは未発見の間だけ日替わり噂ローテーションに混ざる
 * ・time（月齢・時刻・曜日）・within（行動/場所近似）の条件が効く
 * ・seeded の時刻パラメータは世界シードから決定的に引かれる
 */

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

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 50,
};

const startWorld = (seed: string): GameState => newGame(seed, "名無し", newGameCfg);

const sleepDays = (state: GameState, days: number, c: StepConfig): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, c).state;
  return s;
};

/** 指定した曜日（0..6）まで休んで進める */
const sleepToWeekday = (s: GameState, weekday: number, c: StepConfig): GameState => {
  const d = (weekday - (s.time.day % 7) + 7) % 7;
  return sleepDays(s, d, c);
};

const nightStone: DiscoveryDef = {
  id: "night_stone",
  name: "夜光る石",
  foundText: "――夜に淡く光る石を見つけた。",
  hint: "夜にだけ光る石があるという",
  condition: { time: { timeOfDay: "night" } },
  setFlags: ["seen.night_stone"],
};

const moonSpring: DiscoveryDef = {
  id: "moon_spring",
  name: "月の泉",
  foundText: "――満月の光の下に小さな泉を見つけた。",
  hint: "満月の夜だけ姿を見せる泉があるという",
  condition: { time: { moon: "full", timeOfDay: "night" } },
  setFlags: [],
};

const forgePath: DiscoveryDef = {
  id: "forge_path",
  name: "炉への道",
  foundText: "――焼け跡への道を見つけた。",
  hint: "{weekday}にだけ見える道があるという",
  condition: { within: { days: 1, kind: "combat", target: "bandit", atLeast: 1 } },
  setFlags: [],
  seeded: { weekday: true },
};

const cfg = (defs: DiscoveryDef[], over: Partial<StepConfig> = {}): StepConfig => ({
  ...cfgBase,
  discoveries: defs,
  ...over,
});

const discoveryEvents = (evs: ActionEvent[]) => evs.filter((e) => e.type === "discovery");

describe("隠し要素（X-11、docs/03 §5）", () => {
  it("条件を満たすと found.<id> と setFlags が立ち、discovery イベントとB通知が出る", () => {
    const c = cfg([nightStone]);
    let s = startWorld("w1");
    let evs: ActionEvent[] = [];
    // 4回目の行動で時刻が夜（timeOfDay 添字4）になる
    for (let i = 0; i < 4; i++) {
      const r = step(s, { type: "wait" }, c);
      s = r.state;
      evs = r.events;
    }
    expect(s.flags["found.night_stone"]).toBe(true);
    expect(s.flags["seen.night_stone"]).toBe(true);
    const found = discoveryEvents(evs);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: "discovery", id: "night_stone" });
    // 通知Bランク（docs/03 §6：街の小さな発見はBで、折りたたみ側）
    expect(rankOf(found[0]!, c.titles)).toBe("B");
    // 購読者が発見を記録する（条件DSLからも読める刻印）
    expect(s.counters["discovery.total"]).toBe(1);
    expect(s.counters["discovery.found.night_stone"]).toBe(1);
  });

  it("found.<id> が立った発見は二度と発火しない（冪等）", () => {
    const c = cfg([nightStone]);
    let s = startWorld("w1");
    for (let i = 0; i < 4; i++) s = step(s, { type: "wait" }, c).state;
    expect(s.flags["found.night_stone"]).toBe(true);
    // 翌日また夜に条件を満たしても再発火しない
    s = step(s, { type: "rest" }, c).state;
    let evs: ActionEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const r = step(s, { type: "wait" }, c);
      s = r.state;
      evs = r.events;
    }
    expect(discoveryEvents(evs)).toHaveLength(0);
    expect(s.flags["found.night_stone"]).toBe(true);
    expect(s.counters["discovery.total"]).toBe(1);
  });

  it("ヒントは未発見の間だけ日替わり噂に混ざり、発見後は出ない", () => {
    const c = cfg([nightStone]);
    let s = startWorld("w1");
    const def = dailyDiscoveryHint(s, c.discoveries!);
    expect(def?.id).toBe("night_stone");
    const text = discoveryHintText(def!, s.seed, c.time, {});
    expect(text).toBe(nightStone.hint);
    // 発見 → 以後ヒントは出ない
    for (let i = 0; i < 4; i++) s = step(s, { type: "wait" }, c).state;
    s = step(s, { type: "rest" }, c).state;
    expect(dailyDiscoveryHint(s, c.discoveries!)).toBeNull();
    expect(unfoundDiscoveries(s, c.discoveries!)).toEqual([]);
  });

  it("未発見が複数あると日替わりで順番に回る（全員が噂に載る）", () => {
    const c = cfg([moonSpring, nightStone, forgePath]);
    const s = startWorld("w1");
    const ids = [0, 1, 2].map((d) => dailyDiscoveryHint(sleepDays(s, d, c), c.discoveries!)?.id);
    expect(ids).toEqual(["moon_spring", "night_stone", "forge_path"]);
    // 4日目は先頭に戻る（ローテーション）
    expect(dailyDiscoveryHint(sleepDays(s, 3, c), c.discoveries!)?.id).toBe("moon_spring");
  });

  it("月齢条件（time.moon）と時刻（timeOfDay）で発見が起きる", () => {
    const c = cfg([moonSpring]);
    let s = startWorld("w1");
    // 月周期28・窓1日 → day 14 は満月（day 0 は新月側なので夜でも出ない）
    expect(describeTime(s.time, c.time).moon).toBe("new");
    for (let i = 0; i < 4; i++) s = step(s, { type: "wait" }, c).state;
    expect(s.flags["found.moon_spring"]).not.toBe(true);
    // 満月の日へ
    s = sleepDays(s, 14 - s.time.day, c);
    expect(describeTime(s.time, c.time).moon).toBe("full");
    // 昼まで（2回：添字2=noon）ではまだ出ず、夜（4回目）で出る
    for (let i = 0; i < 2; i++) s = step(s, { type: "wait" }, c).state;
    expect(s.flags["found.moon_spring"]).not.toBe(true);
    let evs: ActionEvent[] = [];
    for (let i = 0; i < 2; i++) {
      const r = step(s, { type: "wait" }, c);
      s = r.state;
      evs = r.events;
    }
    expect(s.flags["found.moon_spring"]).toBe(true);
    expect(discoveryEvents(evs).map((e) => e.id)).toContain("moon_spring");
  });

  it("within の kind/target で場所・行動を近似する（敵が違えば出ない、曜日が違えば出ない）", () => {
    const c = cfg([forgePath]);
    const seed = "w1";
    let s = startWorld(seed);
    const w = discoveryParams(forgePath, s.seed, c.time).weekday!;
    s = sleepToWeekday(s, w, c);
    // 別の敵（旧街道ではない相手）では出ない
    let r = step(s, { type: "combat", enemyId: "wolf", difficulty: 5, won: true }, c);
    expect(r.state.flags["found.forge_path"]).not.toBe(true);
    // 同じ曜日に指定の相手と戦うと出る
    r = step(r.state, { type: "combat", enemyId: "bandit", difficulty: 5, won: true }, c);
    expect(r.state.flags["found.forge_path"]).toBe(true);
    expect(discoveryEvents(r.events)).toHaveLength(1);

    // 別の曜日では同じ戦闘でも出ない
    s = sleepToWeekday(startWorld(seed), (w + 1) % 7, c);
    r = step(s, { type: "combat", enemyId: "bandit", difficulty: 5, won: true }, c);
    expect(r.state.flags["found.forge_path"]).not.toBe(true);
  });

  it("seeded の時刻パラメータは世界シードで決定的・別世界では変わりうる", () => {
    const a = discoveryParams(forgePath, "seed-a", cfgBase.time);
    expect(discoveryParams(forgePath, "seed-a", cfgBase.time)).toEqual(a);
    const seen = new Set(
      Array.from(
        { length: 16 },
        (_, i) => discoveryParams(forgePath, `s${i}`, cfgBase.time).weekday,
      ),
    );
    // 同じ世界では同じ値、世界を変えると別の曜日が出うる（周回変化）
    expect(seen.size).toBeGreaterThan(1);
    for (const w of seen) expect(w).toBeGreaterThanOrEqual(0);
    for (const w of seen) expect(w).toBeLessThan(7);
    // 実効条件は定義の condition ＋ 引いた曜日の and
    const cond = resolveDiscoveryCondition(forgePath, "seed-a", cfgBase.time);
    expect(cond).toEqual({
      and: [forgePath.condition, { time: { weekday: a.weekday } }],
    });
  });

  it("ヒントの {weekday} などは抽選値の表示名に置き換わる", () => {
    const s = startWorld("w1");
    const names = ["日", "月", "火", "水", "木", "金", "土"];
    const text = discoveryHintText(forgePath, s.seed, cfgBase.time, {
      weekday: (i) => `${names[i]}曜日`,
    });
    const w = discoveryParams(forgePath, s.seed, cfgBase.time).weekday!;
    expect(text).toBe(`${names[w]}曜日にだけ見える道があるという`);
    expect(text).not.toContain("{");
  });

  it("found.<id> は同じステップの称号条件に効く（頂点・称号判定より前に立つ）", () => {
    const c = cfg([nightStone], {
      titles: [{ id: "t.finder", rank: "B", condition: { flag: "found.night_stone" } }],
    });
    let s = startWorld("w1");
    let evs: ActionEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const r = step(s, { type: "wait" }, c);
      s = r.state;
      evs = r.events;
    }
    expect(s.flags["found.night_stone"]).toBe(true);
    expect(evs.some((e) => e.type === "titleGained" && e.id === "t.finder")).toBe(true);
  });

  it("checkDiscoveries は入力状態を変えず、発見順は定義順", () => {
    const s = startWorld("w1");
    const s0 = JSON.stringify(s);
    const defs = [
      { ...nightStone, id: "d2" },
      { ...nightStone, id: "d1" },
    ];
    const res = checkDiscoveries(s, defs, cfgBase.time);
    expect(JSON.stringify(s)).toBe(s0);
    // 朝（添字0）では条件を満たさないので見つからない
    expect(res.found).toEqual([]);
    // 夜なら定義順に両方見つかる
    let s2 = s;
    for (let i = 0; i < 4; i++) s2 = step(s2, { type: "wait" }, cfgBase).state;
    const res2 = checkDiscoveries(s2, defs, cfgBase.time);
    expect(res2.found.map((d) => d.id)).toEqual(["d2", "d1"]);
  });
});
