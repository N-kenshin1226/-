import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import {
  crisisTouchpointForCombat,
  crisisTouchpointForWork,
  crisisTouchpointOf,
  crisisTouchpointOffers,
  crisisTouchpointVessel,
  crisisTouchpointWeight,
  type CrisisConfig,
  type CrisisTypeDef,
} from "./index.js";

/**
 * 危機の接点（docs/08 §5、W-02）のテスト。
 * 「生き方の種類」を選ぶのではなく、実際にしてきたこと（行動履歴・スキル・実績）への
 * 親和で選ばれること、既存の遊び（仕事の注文・狩り）に乗せて出ること、
 * 達成だけが備えへの寄与になり、受けない・無視する側には何も起きないことを確かめる
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

/**
 * 試験用の危機の型：段階3つ（各1季節）、接点は生活の様々な系統に散らす。
 * - tp.forge / tp.fish / tp.play / tp.read：仕事の注文（鍛冶・釣り・演奏・鑑定）
 * - tp.wolf：狩りの接点（狼）
 * - tp.late：深刻段階から出る接点（台帳＝持ち物への親和を持つ）
 * - tp.req：提示条件つき（市民の打診を受けた者にだけ出る）
 */
const TP_TYPE: CrisisTypeDef = {
  id: "crisis.test_tp",
  name: "試しの接点",
  weight: 1,
  factions: [{ id: "faction.a", name: "甲の勢力", speed: { min: 1, max: 2 } }],
  stages: [
    { id: "omen", name: "兆し", seasons: 1 },
    { id: "spread", name: "拡大", seasons: 1 },
    { id: "deep", name: "深刻", seasons: 1 },
  ],
  finales: [{ id: "finale.f1", name: "場面", atBoundary: 9, fields: ["might"], required: 99999 }],
  touchpoints: [
    {
      id: "tp.forge",
      kind: "order",
      field: "craft",
      affinity: [
        {
          cond: { within: { days: 14, kind: "work", target: "smithing", atLeast: 1 } },
          weight: 4,
        },
        { cond: { skill: "smithing", gte: 8 }, weight: 2 },
      ],
      offer: { name: "武具納入", kind: "smithing", targetQuality: 40, rewardMoney: 50 },
    },
    {
      id: "tp.fish",
      kind: "supply",
      field: "wealth",
      affinity: [
        {
          cond: { within: { days: 14, kind: "work", target: "fishing", atLeast: 1 } },
          weight: 4,
        },
      ],
      offer: { name: "食糧納入", kind: "fishing", targetQuality: 30, rewardMoney: 30 },
    },
    {
      id: "tp.play",
      kind: "order",
      field: "bond",
      affinity: [
        {
          cond: { within: { days: 14, kind: "work", target: "performance", atLeast: 1 } },
          weight: 4,
        },
      ],
      offer: { name: "士気の演奏", kind: "performance", targetQuality: 35, rewardMoney: 40 },
    },
    {
      id: "tp.wolf",
      kind: "defense",
      field: "might",
      ref: "wolf",
      affinity: [{ cond: { within: { days: 14, kind: "combat", atLeast: 1 } }, weight: 4 }],
    },
    {
      id: "tp.late",
      kind: "study",
      field: "knowledge",
      fromStage: 2,
      affinity: [
        // 台帳（持ち物）への親和：鑑定の仕事を納めた者ほど出やすい
        { cond: { work: { kind: "appraisal", count: { atLeast: 1 } } }, weight: 4 },
      ],
      offer: { name: "古い記録の写本", kind: "appraisal", targetQuality: 40, rewardMoney: 40 },
    },
    {
      id: "tp.req",
      kind: "arbitration",
      field: "bond",
      require: { counter: "society.offer.citizen", gte: 1 },
      offer: { name: "避難民の仲裁", kind: "eloquence", targetQuality: 40, rewardMoney: 40 },
    },
  ],
};

/** 接点を1つだけ持つ危機（step 統合試験を決定的にするため） */
const TP_SOLO_TYPE: CrisisTypeDef = {
  ...TP_TYPE,
  id: "crisis.test_tp_solo",
  name: "ひとつの接点",
  touchpoints: [
    {
      id: "tp.solo",
      kind: "order",
      field: "craft",
      offer: { name: "武具納入", kind: "smithing", targetQuality: 40, rewardMoney: 50 },
    },
    {
      id: "tp.solo_wolf",
      kind: "defense",
      field: "might",
      ref: "wolf",
    },
  ],
};

/** 接点の寄与だけで決着が決まる危機（寄与 → 場面の成否） */
const TP_FINALE_TYPE: CrisisTypeDef = {
  ...TP_SOLO_TYPE,
  id: "crisis.test_tp_finale",
  name: "接点の決着",
  // 勢力は備えを積まない（speed 0）ので、場面の成否は主人公の寄与だけで決まる
  factions: [{ id: "faction.a", name: "甲", speed: { min: 0, max: 0 } }],
  finales: [{ id: "finale.f1", name: "場面", atBoundary: 1, fields: ["might"], required: 10 }],
};

const tpConfig = (
  types: readonly CrisisTypeDef[],
  touchpoints?: CrisisConfig["touchpoints"],
): CrisisConfig => ({
  types,
  strongFields: 2,
  weakFieldFactor: 0.3,
  touchpoints,
});

const TP_TOUCH = {
  weightBase: 0.5,
  offersPerStage: [1, 2, 4],
  contribution: { work: 2, combat: 4 },
};

/** step 統合試験用：接点が2つとも必ず提示されるよう日上限を2にする（抽選に左右されない） */
const TP_TOUCH_ALL = { ...TP_TOUCH, offersPerStage: [2, 2, 2] };

const cfgBase: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 4, // 季節を短くして変わり目を速く試す（4日＝1季節）
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 20,
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

const cfg: StepConfig = { ...cfgBase, crisis: tpConfig([TP_TYPE], TP_TOUCH) };
const soloCfg: StepConfig = { ...cfgBase, crisis: tpConfig([TP_SOLO_TYPE], TP_TOUCH_ALL) };
const finaleCfg: StepConfig = { ...cfgBase, crisis: tpConfig([TP_FINALE_TYPE], TP_TOUCH_ALL) };

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
};

/** 危機つきの新しい生 */
const startWorld = (seed: string, stepCfg: StepConfig = cfg): GameState =>
  newGame(seed, "名無し", { ...newGameCfg, crisis: stepCfg.crisis });

/** n 日ぶん眠る */
const sleepDays = (state: GameState, days: number, stepCfg: StepConfig = cfg): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, stepCfg).state;
  return s;
};

/** 季節の変わり目を n 回越える */
const passBoundaries = (state: GameState, n: number, stepCfg: StepConfig = cfg): GameState =>
  sleepDays(state, stepCfg.time.daysPerSeason * n, stepCfg);

/** 行動履歴を積む（「実際にしてきたこと」の材料。仕事・戦い） */
const doWork = (state: GameState, kind: string, stepCfg: StepConfig = cfg): GameState =>
  step(state, { type: "work", kind, quality: 50 }, stepCfg).state;
const doCombat = (state: GameState, stepCfg: StepConfig = cfg): GameState =>
  step(state, { type: "combat", enemyId: "slime", difficulty: 5, won: true }, stepCfg).state;

const tpDef = (id: string) => TP_TYPE.touchpoints!.find((t) => t.id === id)!;

describe("接点の乗せ先と提示（crisisTouchpointOffers）", () => {
  it("offer を持つ接点は仕事の注文に、ref だけの接点は狩りに乗る", () => {
    expect(crisisTouchpointVessel(tpDef("tp.forge"))).toBe("work");
    expect(crisisTouchpointVessel(tpDef("tp.wolf"))).toBe("combat");
    // 注文の品は接点の id を id に持つ（達成は work コマンドの order にその id を渡す）
    const offers = crisisTouchpointOffers(startWorld("w-tp-a"), cfg.crisis!, cfg.time);
    for (const o of offers) {
      if (o.vessel === "work") expect(o.order?.id).toBe(o.def.id);
      if (o.vessel === "combat") expect(o.enemyId).toBe(o.def.ref);
    }
  });

  it("同じ世界・同じ日には同じ接点が出る（世界シード×日付で決定的）", () => {
    const g1 = startWorld("w-tp-det");
    const g2 = startWorld("w-tp-det");
    const a = crisisTouchpointOffers(g1, cfg.crisis!, cfg.time).map((o) => o.def.id);
    const b = crisisTouchpointOffers(g2, cfg.crisis!, cfg.time).map((o) => o.def.id);
    expect(a).toEqual(b);
  });

  it("1日に混ざる数は段階で決まる（offersPerStage。段階が進むほど多い）", () => {
    let g = startWorld("w-tp-cap");
    // 段階0（兆し）：1件まで
    expect(crisisTouchpointOffers(g, cfg.crisis!, cfg.time).length).toBeLessThanOrEqual(1);
    // 段階1（拡大）：2件まで
    g = passBoundaries(g, 1);
    expect(g.crisis!.stageIndex).toBe(1);
    expect(crisisTouchpointOffers(g, cfg.crisis!, cfg.time).length).toBeLessThanOrEqual(2);
    // 段階2（深刻）：4件まで（候補は tp.req 以外の5件）
    g = passBoundaries(g, 1);
    expect(g.crisis!.stageIndex).toBe(2);
    const offers = crisisTouchpointOffers(g, cfg.crisis!, cfg.time);
    expect(offers.length).toBe(4);
    expect(offers.every((o) => o.def.id !== "tp.req")).toBe(true);
  });

  it("段階が浅いうちは fromStage の接点は出ない", () => {
    const g = startWorld("w-tp-stage");
    expect(crisisTouchpointWeight(g, tpDef("tp.late"), cfg.crisis!, cfg.time)).toBe(0);
    // 深刻（段階2）まで進むと候補になる
    const g2 = passBoundaries(passBoundaries(g, 1), 1);
    expect(crisisTouchpointWeight(g2, tpDef("tp.late"), cfg.crisis!, cfg.time)).toBeGreaterThan(0);
  });

  it("提示条件（require）を満たさない接点は出ない", () => {
    let g = startWorld("w-tp-req");
    expect(crisisTouchpointWeight(g, tpDef("tp.req"), cfg.crisis!, cfg.time)).toBe(0);
    // 関係の実績（市民の打診を受けたカウンタ）が立つと候補になる
    g = { ...g, counters: { ...g.counters, "society.offer.citizen": 1 } };
    expect(crisisTouchpointWeight(g, tpDef("tp.req"), cfg.crisis!, cfg.time)).toBeGreaterThan(0);
  });

  it("接点の設定が無ければ何も出ない・危機が無ければ何も出ない", () => {
    const noTp = { ...cfgBase, crisis: tpConfig([TP_TYPE]) };
    const g = startWorld("w-tp-none", noTp);
    expect(crisisTouchpointOffers(g, noTp.crisis, noTp.time)).toEqual([]);
    const gNull = newGame("w-tp-null", "名無し", newGameCfg); // 危機なし
    expect(crisisTouchpointOffers(gNull, cfg.crisis!, cfg.time)).toEqual([]);
  });
});

describe("「実際にしてきたこと」への親和（crisisTouchpointWeight）", () => {
  it("何もしていなくても基底の重みで候補になる（どの生き方にも接点がある）", () => {
    const g = startWorld("w-tp-base");
    for (const def of TP_TYPE.touchpoints!) {
      if (def.id === "tp.late" || def.id === "tp.req") continue; // 段階・条件で出ない
      expect(crisisTouchpointWeight(g, def, cfg.crisis!, cfg.time)).toBeCloseTo(
        TP_TOUCH.weightBase,
      );
    }
  });

  it("鍛冶仕事をしてきた者には鍛冶の接点が重くなる（主流の暮らし）", () => {
    let g = startWorld("w-tp-smith");
    const before = crisisTouchpointWeight(g, tpDef("tp.forge"), cfg.crisis!, cfg.time);
    g = doWork(g, "smithing");
    const after = crisisTouchpointWeight(g, tpDef("tp.forge"), cfg.crisis!, cfg.time);
    // within の親和（+4）だけ重くなる（skill は gte 8 未満のまま）
    expect(after - before).toBeCloseTo(4);
    // 釣りの接点の重みは変わらない
    expect(crisisTouchpointWeight(g, tpDef("tp.fish"), cfg.crisis!, cfg.time)).toBeCloseTo(
      TP_TOUCH.weightBase,
    );
  });

  it("釣りと演奏で暮らす者には釣り・演奏の接点が重くなる（変わった生き方でも接点がある）", () => {
    let g = startWorld("w-tp-odd");
    g = doWork(g, "fishing");
    g = doWork(g, "performance");
    expect(crisisTouchpointWeight(g, tpDef("tp.fish"), cfg.crisis!, cfg.time)).toBeCloseTo(4.5);
    expect(crisisTouchpointWeight(g, tpDef("tp.play"), cfg.crisis!, cfg.time)).toBeCloseTo(4.5);
    // 主流の鍛冶の接点は基底のまま
    expect(crisisTouchpointWeight(g, tpDef("tp.forge"), cfg.crisis!, cfg.time)).toBeCloseTo(
      TP_TOUCH.weightBase,
    );
  });

  it("仕事と狩りを両方する者には仕事と狩り両方の接点が重くなる（混ざった暮らし）", () => {
    let g = startWorld("w-tp-mixed");
    g = doWork(g, "smithing");
    g = doCombat(g);
    expect(crisisTouchpointWeight(g, tpDef("tp.forge"), cfg.crisis!, cfg.time)).toBeCloseTo(4.5);
    expect(crisisTouchpointWeight(g, tpDef("tp.wolf"), cfg.crisis!, cfg.time)).toBeCloseTo(4.5);
  });

  it("スキル・実績（カウンタ）・台帳（持ち物）も親和になる", () => {
    let g = startWorld("w-tp-aff");
    // スキル値：鍛冶が 8 以上 → 親和 +2
    g = {
      ...g,
      player: {
        ...g.player,
        skills: {
          ...g.player.skills,
          smithing: { ...g.player.skills["smithing"]!, value: 9 },
        },
      },
    };
    expect(crisisTouchpointWeight(g, tpDef("tp.forge"), cfg.crisis!, cfg.time)).toBeCloseTo(2.5);
    // 台帳：鑑定の仕事を納めた者（深刻段階まで進めると tp.late に乗る）
    let g2 = startWorld("w-tp-ledger");
    g2 = doWork(g2, "appraisal");
    g2 = passBoundaries(g2, 2);
    expect(g2.crisis!.stageIndex).toBe(2);
    expect(crisisTouchpointWeight(g2, tpDef("tp.late"), cfg.crisis!, cfg.time)).toBeCloseTo(4.5);
  });
});

describe("接点の達成（step 統合）", () => {
  it("接点の注文をこなすと、世界の備えに寄与し crisisTouchpoint が刻まれる", () => {
    const g = startWorld("w-tp-do", soloCfg);
    // 今日の接点の注文（solo は必ず提示される）
    const offers = crisisTouchpointOffers(g, soloCfg.crisis, soloCfg.time);
    const order = offers.find((o) => o.vessel === "work")!.order!;
    expect(order.id).toBe("tp.solo");
    const res = step(
      g,
      {
        type: "work",
        kind: order.kind,
        quality: 50,
        difficulty: order.targetQuality,
        order: order.id,
        rewardMoney: order.rewardMoney,
      },
      soloCfg,
    );
    // 寄与は技（craft）に contribution.work だけ積まれる
    expect(res.state.crisis!.hero.craft).toBeCloseTo(TP_TOUCH.contribution.work);
    const ev = res.events.find((e) => e.type === "crisisTouchpoint");
    expect(ev).toBeDefined();
    expect(ev && "id" in ev && ev.id).toBe("tp.solo");
    expect(ev && "field" in ev && ev.field).toBe("craft");
    // 関わりの深さはカウンタに刻まれる（条件DSL・称号から読める）
    expect(res.state.counters["crisis.tp.done"]).toBe(1);
    expect(res.state.counters["crisis.tp.tp.solo"]).toBe(1);
    // 台帳には接点の id が注文として残る（表示側で品名に解決する）
    expect(res.state.ledger.at(-1)?.order).toBe("tp.solo");
  });

  it("接点の相手に勝つと備えに寄与する。逃げ・負けでは何も起きない", () => {
    const g = startWorld("w-tp-fight", soloCfg);
    // 勝ち：might に contribution.combat
    const win = step(
      g,
      { type: "combat", enemyId: "wolf", difficulty: 5, won: true, touchpoint: "tp.solo_wolf" },
      soloCfg,
    );
    expect(win.state.crisis!.hero.might).toBeCloseTo(TP_TOUCH.contribution.combat);
    expect(win.events.some((e) => e.type === "crisisTouchpoint")).toBe(true);
    // 負け：寄与なし・刻印なし
    const lose = step(
      g,
      { type: "combat", enemyId: "wolf", difficulty: 5, won: false, touchpoint: "tp.solo_wolf" },
      soloCfg,
    );
    expect(lose.state.crisis!.hero.might).toBe(0);
    expect(lose.events.some((e) => e.type === "crisisTouchpoint")).toBe(false);
    // 逃げも同じく何も起きない
    const flee = step(
      g,
      {
        type: "combat",
        enemyId: "wolf",
        difficulty: 5,
        won: false,
        fled: true,
        touchpoint: "tp.solo_wolf",
      },
      soloCfg,
    );
    expect(flee.state.crisis!.hero.might).toBe(0);
  });

  it("提示を受けない・無視する側には何も起きない（接点を断っても不利益なし）", () => {
    const g = startWorld("w-tp-skip", soloCfg);
    const before = JSON.stringify({
      hero: g.crisis!.hero,
      counters: g.counters,
      actionLog: g.actionLog,
    });
    // 接点ではない普通の仕事・普通の狩りをするだけ
    let s = step(g, { type: "work", kind: "smithing", quality: 50 }, soloCfg).state;
    const r2 = step(s, { type: "combat", enemyId: "slime", difficulty: 5, won: true }, soloCfg);
    s = r2.state;
    expect(s.crisis!.hero).toEqual(g.crisis!.hero);
    expect(s.counters["crisis.tp.done"]).toBeUndefined();
    expect(r2.events.some((e) => e.type === "crisisTouchpoint")).toBe(false);
    // 接点とは関係のない行動の刻印だけが残る
    expect(JSON.stringify({ hero: s.crisis!.hero, counters: s.counters, actionLog: [] })).not.toBe(
      before,
    );
  });

  it("接点の注文でも系統が違えば達成にならない（別系統の品を納めても寄与しない）", () => {
    const g = startWorld("w-tp-kind", soloCfg);
    const res = step(
      g,
      {
        type: "work",
        kind: "fishing", // tp.solo の注文は smithing
        quality: 50,
        order: "tp.solo",
        rewardMoney: 50,
      },
      soloCfg,
    );
    expect(res.state.crisis!.hero.craft).toBe(0);
    expect(res.events.some((e) => e.type === "crisisTouchpoint")).toBe(false);
  });

  it("接点の相手でも、提示された接点でなければ達成にならない", () => {
    const g = startWorld("w-tp-foe", soloCfg);
    // 接点の id が違う（今日の提示ではない接点）
    const res = step(
      g,
      { type: "combat", enemyId: "wolf", difficulty: 5, won: true, touchpoint: "tp.solo" },
      soloCfg,
    );
    expect(res.state.crisis!.hero.might).toBe(0);
    expect(res.events.some((e) => e.type === "crisisTouchpoint")).toBe(false);
    // 印のない普通の狩り（touchpoint なし）も寄与しない
    const plain = step(g, { type: "combat", enemyId: "wolf", difficulty: 5, won: true }, soloCfg);
    expect(plain.state.crisis!.hero.might).toBe(0);
  });

  it("同じ接点は同じ日に二度果たせない（繰り返さないための予算）", () => {
    const g = startWorld("w-tp-once", soloCfg);
    const doTp = (s: GameState) =>
      step(
        s,
        { type: "work", kind: "smithing", quality: 50, order: "tp.solo", rewardMoney: 50 },
        soloCfg,
      );
    const r1 = doTp(g);
    expect(r1.state.crisis!.hero.craft).toBeCloseTo(TP_TOUCH.contribution.work);
    // 同じ日にもう一度：提示から外れているので寄与しない
    const r2 = doTp(r1.state);
    expect(r2.state.crisis!.hero.craft).toBeCloseTo(TP_TOUCH.contribution.work);
    expect(r2.events.some((e) => e.type === "crisisTouchpoint")).toBe(false);
    // 翌日には再び候補に戻る
    const g2 = sleepDays(r2.state, 1, soloCfg);
    expect(
      crisisTouchpointWeight(
        g2,
        TP_SOLO_TYPE.touchpoints!.find((t) => t.id === "tp.solo")!,
        soloCfg.crisis!,
        soloCfg.time,
      ),
    ).toBeGreaterThan(0);
  });

  it("接点の寄与は決着の場面の成否に加わる（関わると変わる）", () => {
    // 勢力の備え 0、場面の必要備え 10。寄与なしでは必ず失敗する
    let g0 = startWorld("w-tp-fin0", finaleCfg);
    g0 = passBoundaries(g0, 1, finaleCfg);
    expect(g0.crisis!.finales[0]!.success).toBe(false);
    // 接点の相手を3回（4×3=12 ≥ 10。日を分けて果たす）
    let g1 = startWorld("w-tp-fin1", finaleCfg);
    for (let d = 0; d < 3; d++) {
      g1 = step(
        g1,
        {
          type: "combat",
          enemyId: "wolf",
          difficulty: 5,
          won: true,
          touchpoint: "tp.solo_wolf",
        },
        finaleCfg,
      ).state;
      g1 = sleepDays(g1, 1, finaleCfg);
    }
    expect(g1.crisis!.hero.might).toBeCloseTo(TP_TOUCH.contribution.combat * 3);
    g1 = passBoundaries(g1, 1, finaleCfg);
    expect(g1.crisis!.finales[0]!.success).toBe(true);
    expect(g1.crisis!.outcome).toBe("resolved");
  });
});

describe("接点の参照ヘルパー", () => {
  it("crisisTouchpointOf は現在の危機の型から接点を引く（表示名の解決用）", () => {
    const g = startWorld("w-tp-of");
    expect(crisisTouchpointOf(g, cfg.crisis, "tp.forge")?.offer?.name).toBe("武具納入");
    expect(crisisTouchpointOf(g, cfg.crisis, "tp.missing")).toBeNull();
    expect(crisisTouchpointOf(g, undefined, "tp.forge")).toBeNull();
  });

  it("crisisTouchpointForWork / ForCombat は今日の提示と系統・相手を確かめる", () => {
    const g = startWorld("w-tp-check", soloCfg);
    // 提示に無い注文・違う系統・違う相手は null
    expect(
      crisisTouchpointForWork(g, soloCfg.crisis, soloCfg.time, "ord.x", "smithing"),
    ).toBeNull();
    expect(
      crisisTouchpointForWork(g, soloCfg.crisis, soloCfg.time, "tp.solo", "fishing"),
    ).toBeNull();
    expect(
      crisisTouchpointForCombat(g, soloCfg.crisis, soloCfg.time, "tp.solo_wolf", "slime"),
    ).toBeNull();
    // 今日の提示どおりなら接点を返す
    expect(
      crisisTouchpointForWork(g, soloCfg.crisis, soloCfg.time, "tp.solo", "smithing")?.id,
    ).toBe("tp.solo");
    expect(
      crisisTouchpointForCombat(g, soloCfg.crisis, soloCfg.time, "tp.solo_wolf", "wolf")?.id,
    ).toBe("tp.solo_wolf");
  });
});
