import { describe, expect, it } from "vitest";
import { pinnacleFlag, type PinnacleRouteDef } from "../pinnacle/index.js";
import { newGame } from "../state/newGame.js";
import type { CrisisFieldId, GameState } from "../state/types.js";
import { step, type StepConfig } from "../step.js";
import {
  CRISIS_HERO_FLAG,
  crisisAttemptFlag,
  crisisFinaleOffers,
  crisisFinaleRole,
  crisisInvolvement,
  crisisInvolvementStage,
  crisisJoinFlag,
  crisisOfferFlag,
  crisisRivals,
  type CrisisConfig,
  type CrisisInvolvementConfig,
  type CrisisTypeDef,
} from "./index.js";

/**
 * 関与と英雄への道（docs/08 §6、W-03）のテスト。
 * 関与は分野をまたいだ合算（行動の積み重ね＋名声・立場・関連スキル・頂点）で、
 * 段階に応じて世界が反応する：段階3 で打診、段階4 で自分で起こせる。
 * 世界は主人公を待たない —— 関わらなくても決着は来て、ライバルも英雄になりうる。
 * 頂点ルートは近道であって条件ではないこと、混ざった生き方が不利にならないこと、
 * 片手間では段階4に届かないことを確かめる
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

/** 試しの頂点ルート（2段。関与の近道項の材料。条件は評価しないので読みやすい形） */
const TEST_ROUTE: PinnacleRouteDef = {
  id: "route.test",
  name: "試しの頂",
  desc: "テスト用",
  title: "title.test",
  stages: [
    { id: "s1", name: "一段", rank: "B", notice: "――", condition: { counter: "x", gte: 0 } },
    { id: "s2", name: "頂", rank: "S", notice: "――", condition: { counter: "x", gte: 0 } },
  ],
};

/**
 * 関与の係数（試験用。balance.json とは独立に、式と閾値の振る舞いを確かめる）。
 * 閾値は 10/30/50：段階2 支えた・段階3 担った・段階4 率いた
 */
const INV: CrisisInvolvementConfig = {
  stageThresholds: [10, 30, 50],
  weights: {
    tpDone: 3,
    heroPrep: 1,
    renown: 0.5,
    standing: 4,
    skill: 0.2,
    pinnacleStage: 8,
    pinnacleTop: 15,
  },
  supporterExtraOffers: 1,
  attemptBonus: 10,
  leadSkillWeight: 0.5,
  leadRenownWeight: 0.3,
  leadFocusFactor: 0.7,
  coordinatorSpread: 2,
  roleSkills: {
    vanguard: ["swordplay", "evasion", "observation"],
    negotiator: ["eloquence", "performance"],
    artisan: ["smithing", "mining", "appraisal", "fishing"],
  },
  // 名声（自実績点）：台帳の最高品質・称号・討伐・深層ベストで組む
  renown: {
    size: 5,
    scoreMin: 0,
    scoreMax: 0,
    growthPerDay: 0,
    playerQualityWeight: 0.5,
    playerTitleWeight: 4,
    playerKillWeight: 1,
    playerAbyssWeight: 2,
  },
  pinnacles: [TEST_ROUTE],
  standings: ["drifter", "resident", "citizen", "master"],
  rivals: {
    names: ["アカツキ", "カスガ", "サツキ", "ナツメ", "ハツネ", "ミドリ"],
    epithets: ["英雄器", "剛腕", "俊足", "慧眼", "商才", "鉄心"],
    // 適性のある二つ名は6つ中3つ：4人を重複なしで引くと最低1人は英雄の器
    heroEpithets: ["英雄器", "剛腕", "俊足"],
    size: 4,
    growthPerBoundary: { min: 0.5, max: 1 },
    heroGrowthPerBoundary: { min: 20, max: 20 },
    contribution: 30,
    hastenWindow: 1,
  },
};

/**
 * 試しの危機：段階3つ（各1季節）。勢力は力・技だけを確実に積む（aptitude で
 * 得意分野を固定）。決着は2場面：境目の戦い（力・技）と大祓の儀（縁）
 */
const INV_TYPE: CrisisTypeDef = {
  id: "crisis.test_inv",
  name: "試しの霧",
  weight: 1,
  factions: [
    {
      id: "faction.a",
      name: "甲の勢力",
      speed: { min: 10, max: 10 },
      aptitude: { might: 1, craft: 1, bond: 0, wealth: 0, knowledge: 0 },
    },
  ],
  stages: [
    { id: "omen", name: "兆し", seasons: 1 },
    { id: "spread", name: "拡大", seasons: 1 },
    { id: "deep", name: "深刻", seasons: 1 },
  ],
  finales: [
    {
      id: "finale.f1",
      name: "境目の戦い",
      atBoundary: 3,
      fields: ["might", "craft"],
      required: 30,
    },
    { id: "finale.f2", name: "大祓の儀", atBoundary: 5, fields: ["bond"], required: 20 },
  ],
  touchpoints: [
    { id: "tp.wolf", kind: "defense", field: "might", ref: "wolf" },
    {
      id: "tp.forge",
      kind: "order",
      field: "craft",
      offer: { name: "武具納入", kind: "smithing", targetQuality: 40, rewardMoney: 50 },
    },
  ],
};

const invConfig = (type: CrisisTypeDef, inv = INV): CrisisConfig => ({
  types: [type],
  strongFields: 2,
  weakFieldFactor: 0.3,
  touchpoints: {
    weightBase: 0.5,
    offersPerStage: [2, 2, 2],
    contribution: { work: 2, combat: 4 },
  },
  involvement: inv,
});

const cfgBase: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 4, // 4日＝1季節（変わり目を速く試す）
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

const cfg: StepConfig = { ...cfgBase, crisis: invConfig(INV_TYPE) };

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
};

/** 危機つきの新しい生 */
const startWorld = (seed: string, stepCfg: StepConfig = cfg): GameState =>
  newGame(seed, "名無し", { ...newGameCfg, crisis: stepCfg.crisis });

const sleepDays = (state: GameState, days: number, stepCfg: StepConfig = cfg): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, stepCfg).state;
  return s;
};

/** 季節の変わり目を n 回越える */
const passBoundaries = (state: GameState, n: number, stepCfg: StepConfig = cfg): GameState =>
  sleepDays(state, stepCfg.time.daysPerSeason * n, stepCfg);

/**
 * 関与の材料を積んだ状態を作る（「実際にしてきたこと」への置き換え）。
 * 接点の達成数・世界の備え・スキル・立場・頂点フラグ・名声（台帳・称号・討伐・深層）
 */
const profile = (
  g: GameState,
  opts: {
    tp?: number;
    hero?: Partial<Record<CrisisFieldId, number>>;
    skills?: Record<string, number>;
    standing?: string;
    pinnacle?: string[];
    titles?: number;
    kills?: number;
    bestQuality?: number;
    abyssBest?: number;
    boundaries?: number;
    offered?: string[];
    joined?: string[];
  },
): GameState => ({
  ...g,
  counters: {
    ...g.counters,
    ...(opts.tp !== undefined ? { "crisis.tp.done": opts.tp } : {}),
    ...(opts.kills !== undefined ? { "kill.species.wolf": opts.kills } : {}),
    ...(opts.abyssBest !== undefined ? { "abyss.best": opts.abyssBest } : {}),
  },
  flags: {
    ...g.flags,
    ...Object.fromEntries((opts.pinnacle ?? []).map((f) => [f, true])),
    ...Object.fromEntries((opts.offered ?? []).map((id) => [crisisOfferFlag(id), true])),
    ...Object.fromEntries((opts.joined ?? []).map((id) => [crisisJoinFlag(id), true])),
  },
  titles:
    opts.titles !== undefined ? Array.from({ length: opts.titles }, (_, i) => `t${i}`) : g.titles,
  ledger:
    opts.bestQuality !== undefined
      ? [
          ...g.ledger,
          {
            id: "w.profile",
            kind: "smithing",
            maker: g.player.name,
            quality: opts.bestQuality,
            tier: 1,
            flags: [],
            day: 0,
            worldSeed: g.seed,
            marketValue: 0,
          },
        ]
      : g.ledger,
  society: opts.standing !== undefined ? { ...g.society, standing: opts.standing } : g.society,
  crisis:
    g.crisis !== null && (opts.hero !== undefined || opts.boundaries !== undefined)
      ? {
          ...g.crisis,
          ...(opts.hero !== undefined ? { hero: { ...g.crisis.hero, ...opts.hero } } : {}),
          ...(opts.boundaries !== undefined ? { boundaries: opts.boundaries } : {}),
        }
      : g.crisis,
  player: {
    ...g.player,
    skills: Object.fromEntries(
      Object.entries(g.player.skills).map(([k, v]) => [
        k,
        { ...v, value: opts.skills?.[k] ?? v.value },
      ]),
    ),
  },
});

describe("関与スコアと段階（crisisInvolvement / crisisInvolvementStage）", () => {
  it("スコア→段階：閾値未満は見届けた、以後 支えた・担った・率いた", () => {
    expect(crisisInvolvementStage(0, INV)).toBe(1);
    expect(crisisInvolvementStage(9.9, INV)).toBe(1);
    expect(crisisInvolvementStage(10, INV)).toBe(2);
    expect(crisisInvolvementStage(29.9, INV)).toBe(2);
    expect(crisisInvolvementStage(30, INV)).toBe(3);
    expect(crisisInvolvementStage(49.9, INV)).toBe(3);
    expect(crisisInvolvementStage(50, INV)).toBe(4);
  });

  it("関与は分野をまたいで合算する：混ざった生き方も極めた生き方も同じ式で届く", () => {
    const g = startWorld("w-inv-mixed");
    // あちこちの道で少しずつ関わった人：接点・備え・実力・立場・名声を散らして積む
    // 5×3 + (4+6+5)×1 + 12×0.2 + 3×4 + (20×0.5+4×4+8×1+4×2)×0.5 = 15+15+2.4+12+21 = 65.4
    const mixed = profile(g, {
      tp: 5,
      hero: { might: 4, craft: 6, bond: 5 },
      skills: { swordplay: 12 },
      standing: "master",
      bestQuality: 20,
      titles: 4,
      kills: 8,
      abyssBest: 4,
    });
    const inv = crisisInvolvement(mixed, cfg.crisis);
    expect(inv.parts.pinnacle).toBe(0);
    expect(inv.stage).toBe(4);
    // 一つの道を極めた人：同じ合計なら同じ段階に届く（分野をまたぐ合算式は同じ）
    const focused = profile(g, {
      tp: 5,
      hero: { might: 15 },
      skills: { swordplay: 12 },
      standing: "master",
      bestQuality: 20,
      titles: 4,
      kills: 8,
      abyssBest: 4,
    });
    expect(crisisInvolvement(focused, cfg.crisis).score).toBeCloseTo(inv.score);
    expect(crisisInvolvement(focused, cfg.crisis).stage).toBe(4);
  });

  it("片手間では段階4（率いた）に届かない：薄い関わりは低い段階に留まる", () => {
    const g = startWorld("w-inv-casual");
    // 街の注文や依頼に何度か応えた程度の人（「毎日は関わっていない」生き方）
    const casual = profile(g, {
      tp: 3,
      hero: { might: 2, craft: 2 },
      skills: { swordplay: 8 },
      standing: "resident",
    });
    const inv = crisisInvolvement(casual, cfg.crisis);
    // 3×3 + 4×1 + 8×0.2 + 1×4 = 9+4+1.6+4 = 18.6 → 支えた止まり
    expect(inv.score).toBeLessThan(INV.stageThresholds[2]!);
    expect(inv.stage).toBe(2);
    // 何もしていない人は見届けた（観客）のまま
    expect(crisisInvolvement(g, cfg.crisis).stage).toBe(1);
  });

  it("頂点ルートは近道：完走すると関与が大きく伸びる", () => {
    const g = startWorld("w-inv-pin");
    const plain = profile(g, { tp: 4, hero: { might: 6 } });
    const pinned = profile(plain, {
      pinnacle: [pinnacleFlag("route.test", "s1"), pinnacleFlag("route.test", "s2")],
    });
    const a = crisisInvolvement(plain, cfg.crisis);
    const b = crisisInvolvement(pinned, cfg.crisis);
    // 2段×8 + 完走15 = 31 の近道ぶん
    expect(b.parts.pinnacle).toBeCloseTo(31);
    expect(b.score - a.score).toBeCloseTo(31);
  });

  it("頂点は条件ではない：頂点なしでも積み重ねだけで段階4に届く道がある", () => {
    const g = startWorld("w-inv-nopin");
    // 頂点フラグゼロ。接点・備え・実力・立場・名声の積み重ねだけで 50 を越える
    const life = profile(g, {
      tp: 8,
      hero: { might: 10, craft: 8, bond: 6 },
      skills: { swordplay: 30 },
      standing: "citizen",
      bestQuality: 60,
      titles: 3,
      kills: 10,
      abyssBest: 6,
    });
    const inv = crisisInvolvement(life, cfg.crisis);
    // 8×3 + 24 + 30×0.2 + 2×4 + (60×0.5+3×4+10+6×2)×0.5 = 24+24+6+8+37 = 99
    expect(inv.parts.pinnacle).toBe(0);
    expect(inv.stage).toBe(4);
  });
});

describe("決着の場面での役割（crisisFinaleRole）", () => {
  it("役割は実際のスキルから決まる：武→前線、弁→会議、工→装備", () => {
    const g = startWorld("w-inv-role");
    expect(crisisFinaleRole(profile(g, { skills: { swordplay: 50 } }), cfg.crisis)).toBe(
      "vanguard",
    );
    expect(crisisFinaleRole(profile(g, { skills: { eloquence: 50 } }), cfg.crisis)).toBe(
      "negotiator",
    );
    expect(crisisFinaleRole(profile(g, { skills: { smithing: 50 } }), cfg.crisis)).toBe("artisan");
  });

  it("上位3技能が拮抗する者はまとめ役（何でも少しずつな生き方）", () => {
    const g = startWorld("w-inv-coor");
    const even = profile(g, { skills: { swordplay: 12, smithing: 11, fishing: 10 } });
    expect(crisisFinaleRole(even, cfg.crisis)).toBe("coordinator");
    // 1技能だけ突出していればまとめ役ではない
    const lopsided = profile(g, { skills: { swordplay: 40, smithing: 30, fishing: 20 } });
    expect(crisisFinaleRole(lopsided, cfg.crisis)).toBe("vanguard");
  });
});

describe("段階3：決着の場面への打診（crisisFinaleOffered）", () => {
  it("関与が段階3に届くと、step が最も早い未決着への打診を届ける", () => {
    const g = profile(startWorld("w-inv-offer"), {
      tp: 6,
      hero: { might: 10 },
      skills: { swordplay: 10 },
      standing: "resident",
    });
    // 6×3 + 10 + 10×0.2 + 4 = 34 ≥ 30 → 担った
    expect(crisisInvolvement(g, cfg.crisis).stage).toBe(3);
    const res = step(g, { type: "work", kind: "smithing", quality: 50 }, cfg);
    const ev = res.events.find((e) => e.type === "crisisFinaleOffered");
    expect(ev).toBeDefined();
    expect(ev && "id" in ev && ev.id).toBe("finale.f1"); // 最も早い未決着
    expect(res.state.flags[crisisOfferFlag("finale.f1")]).toBe(true);
    // 届いた打診は一度だけ：次の行動では再送されない
    const res2 = step(res.state, { type: "work", kind: "smithing", quality: 50 }, cfg);
    expect(res2.events.some((e) => e.type === "crisisFinaleOffered")).toBe(false);
  });

  it("関与が足りなければ打診は届かない（世界は観客に声を掛けない）", () => {
    const g = startWorld("w-inv-noffer");
    const res = step(g, { type: "work", kind: "smithing", quality: 50 }, cfg);
    expect(res.events.some((e) => e.type === "crisisFinaleOffered")).toBe(false);
    expect(res.state.flags[crisisOfferFlag("finale.f1")]).toBeUndefined();
  });
});

describe("段階3：参加と勝負所（crisisFinaleJoin / crisisFinaleAttempt）", () => {
  it("打診に応えると勝負所に臨め、結果が世界の備えに大きく効く", () => {
    const g = profile(startWorld("w-inv-join"), {
      tp: 6,
      hero: { might: 10 },
      offered: ["finale.f1"],
    });
    // 打診が届いている → 応えられる（joinable）
    const before = crisisFinaleOffers(g, cfg.crisis).find((o) => o.def.id === "finale.f1")!;
    expect(before.offered).toBe(true);
    expect(before.joinable).toBe(true);
    // 打診に応える（行動は消費しない —— 会話の一瞬）
    const j = step(g, { type: "crisisFinaleJoin", id: "finale.f1" }, cfg);
    expect(j.events.some((e) => e.type === "crisisFinaleJoined" && e.id === "finale.f1")).toBe(
      true,
    );
    expect(j.state.flags[crisisJoinFlag("finale.f1")]).toBe(true);
    expect(j.state.time.action).toBe(g.time.action);
    // 勝負所に臨む：最高の働き（score=1）で attemptBonus が場面の分野に按分される
    const a = step(j.state, { type: "crisisFinaleAttempt", id: "finale.f1", score: 1 }, cfg);
    const ev = a.events.find((e) => e.type === "crisisFinaleAttempt");
    expect(ev).toBeDefined();
    expect(ev && "amount" in ev && ev.amount).toBeCloseTo(10);
    // might+craft の2分野に均等割り（10/2=5 ずつ。既存の寄与に加算）
    expect(a.state.crisis!.hero.might).toBeCloseTo(10 + 5);
    expect(a.state.crisis!.hero.craft).toBeCloseTo(0 + 5);
    expect(a.state.flags[crisisAttemptFlag("finale.f1")]).toBe(true);
    expect(a.state.counters["crisis.attempt"]).toBe(1);
    // 1行動を消費する
    expect(a.state.time.action).toBe(g.time.action + 1);
    // 勝負所は1場面につき1回だけ：もう一度は無効（備えも増えない）
    const a2 = step(a.state, { type: "crisisFinaleAttempt", id: "finale.f1", score: 1 }, cfg);
    expect(a2.events.some((e) => e.type === "crisisFinaleAttempt")).toBe(false);
    expect(a2.state.crisis!.hero.might).toBeCloseTo(15);
  });

  it("請けていない場面・届いていない場面の勝負所には臨めない", () => {
    const g = profile(startWorld("w-inv-noatt"), {
      tp: 6,
      hero: { might: 10 },
      offered: ["finale.f1"],
    });
    // 打診は届いているが応えていない → 勝負所は無効
    const r = step(g, { type: "crisisFinaleAttempt", id: "finale.f1", score: 1 }, cfg);
    expect(r.events.some((e) => e.type === "crisisFinaleAttempt")).toBe(false);
    expect(r.state.crisis!.hero.might).toBeCloseTo(10);
    // 別の場面（打診も届いていない）も同じく無効
    const j = step(g, { type: "crisisFinaleJoin", id: "finale.f2" }, cfg);
    expect(j.events.some((e) => e.type === "crisisFinaleJoined")).toBe(false);
  });

  it("打診を断る・無視しても世界は進む。不利益は何もない", () => {
    let g = profile(startWorld("w-inv-decline"), {
      tp: 6,
      hero: { might: 10 },
      offered: ["finale.f1"],
    });
    const before = JSON.stringify({ skills: g.player.skills, money: g.player.money });
    // 応えないまま決着の時期を迎える（勢力は勝てるので世界は救われる）
    g = passBoundaries(g, 3);
    const f = g.crisis!.finales.find((x) => x.id === "finale.f1")!;
    expect(f.resolved).toBe(true);
    // 請けず・勝負所にも臨まず・英雄にもならなかったが、何も失っていない
    expect(g.counters["crisis.join"]).toBeUndefined();
    expect(g.counters["crisis.attempt"]).toBeUndefined();
    expect(g.flags[CRISIS_HERO_FLAG]).toBeUndefined();
    expect(JSON.stringify({ skills: g.player.skills, money: g.player.money })).toBe(before);
  });
});

describe("段階4：自分で起こす決着（crisisLead）", () => {
  const stage4 = (seed: string) =>
    profile(startWorld(seed), {
      tp: 8,
      hero: { might: 20, craft: 10, bond: 6 },
      skills: { swordplay: 30 },
      standing: "citizen",
      bestQuality: 60,
      kills: 10,
    });

  it("関与が段階4（率いた）の者は、未決着の場面を自分で起こせる", () => {
    const g = stage4("w-inv-lead");
    expect(crisisInvolvement(g, cfg.crisis).stage).toBe(4);
    expect(crisisFinaleOffers(g, cfg.crisis).every((o) => o.leadable)).toBe(true);
    // 主人公側の備え：might+craft の寄与 30 ＋ 実力 30×0.5 ＋ 名声×0.3 ≥ required 30
    const res = step(g, { type: "crisisLead", id: "finale.f1" }, cfg);
    const ev = res.events.find((e) => e.type === "crisisFinaleLed");
    expect(ev).toBeDefined();
    expect(ev && "success" in ev && ev.success).toBe(true);
    // 率いた決着は hero として世界の記録に残り、英雄のフラグが立つ
    expect(res.state.flags[CRISIS_HERO_FLAG]).toBe(true);
    expect(res.state.counters["crisis.lead.win"]).toBe(1);
    const f = res.state.crisis!.finales.find((x) => x.id === "finale.f1")!;
    expect(f.resolved).toBe(true);
    expect(f.success).toBe(true);
    // 決着がついたので世界は終幕（解決）へ
    expect(res.state.crisis!.outcome).toBe("resolved");
    expect(res.events.some((e) => e.type === "crisisEnded" && e.outcome === "resolved")).toBe(true);
    expect(res.state.crisis!.log.some((l) => l.kind === "finale.hero")).toBe(true);
    // 1行動を消費する
    expect(res.state.time.action).toBe(g.time.action + 1);
  });

  it("備えが足りなければ自分で起こしても届かない（英雄の不成行も記録される）", () => {
    // 関与は段階4（接点数で越える）だが、対象分野への寄与と実力が薄い
    const g = profile(startWorld("w-inv-leadfail"), {
      tp: 20, // 20×3=60 ≥ 50 → 段階4
      hero: { bond: 4 },
      skills: { swordplay: 5 },
    });
    expect(crisisInvolvement(g, cfg.crisis).stage).toBe(4);
    // f1 は might+craft 判定。bond だけ積んでも届かない（required 30）
    const res = step(g, { type: "crisisLead", id: "finale.f1" }, cfg);
    const ev = res.events.find((e) => e.type === "crisisFinaleLed");
    expect(ev && "success" in ev && ev.success).toBe(false);
    expect(res.state.flags[CRISIS_HERO_FLAG]).toBeUndefined();
    expect(res.state.counters["crisis.lead.loss"]).toBe(1);
    expect(res.state.crisis!.log.some((l) => l.kind === "finale.heroFail")).toBe(true);
  });

  it("やり方を選べる：分野を一つに絞るとその分野の備えだけで判定する", () => {
    const g = stage4("w-inv-leadfocus");
    // 力に絞る：required は 30×0.7=21、主人公側の備えは might だけ（20 + 15 + 名声）
    const res = step(g, { type: "crisisLead", id: "finale.f1", field: "might" }, cfg);
    const ev = res.events.find((e) => e.type === "crisisFinaleLed");
    expect(ev && "success" in ev && ev.success).toBe(true);
    // 場面の対象分野でない分野には絞れない
    const bad = step(g, { type: "crisisLead", id: "finale.f1", field: "bond" }, cfg);
    expect(bad.events.some((e) => e.type === "crisisFinaleLed")).toBe(false);
  });

  it("段階4でなければ自分では起こせない（担った止まりの者は起こせない）", () => {
    const g = profile(startWorld("w-inv-nolead"), {
      tp: 6,
      hero: { might: 8, craft: 4 }, // 6×3+12=30 → 担った（段階3）止まり
    });
    expect(crisisInvolvement(g, cfg.crisis).stage).toBe(3);
    const res = step(g, { type: "crisisLead", id: "finale.f1" }, cfg);
    expect(res.events.some((e) => e.type === "crisisFinaleLed")).toBe(false);
    expect(res.state.crisis!.finales.every((f) => !f.resolved)).toBe(true);
  });
});

describe("世界は主人公を待たない（自律的な決着とライバル）", () => {
  it("関与が足りなければ、決着の場面は世界の勢力（と NPC たち）が挑む", () => {
    let g = startWorld("w-inv-watch");
    // 打診は届かないまま決着の時期が来る。勢力の備えは届いている（10×3×2分野）
    g = passBoundaries(g, 3);
    const f = g.crisis!.finales.find((x) => x.id === "finale.f1")!;
    expect(f.resolved).toBe(true);
    expect(f.success).toBe(true);
    expect(g.crisis!.outcome).toBe("resolved");
    // 主人公由来の記録は残っていない（参加も起こしもしていない）
    expect(g.counters["crisis.lead.win"]).toBeUndefined();
    expect(g.flags[CRISIS_HERO_FLAG]).toBeUndefined();
  });

  it("ライバルも関与を持つ：季節が進むほど関与が伸び、英雄の器は速い", () => {
    const g = profile(startWorld("w-inv-rivals"), { boundaries: 5 });
    const rs = crisisRivals(g, cfg.crisis);
    expect(rs.length).toBe(4);
    for (const r of rs) {
      expect(r.score).toBeCloseTo(r.growth * 5);
      // 英雄適性の者（英雄器の二つ名）は関与が速く伸びて段階4に届く
      if (r.heroCandidate) expect(r.stage).toBe(4);
      else expect(r.stage).toBeLessThan(4);
    }
    // 同じ世界シードなら同じ顔ぶれ（名・二つ名・適性が一致する）
    const g2 = profile(startWorld("w-inv-rivals"), { boundaries: 5 });
    expect(crisisRivals(g2, cfg.crisis)).toEqual(rs);
  });

  it("英雄の器に届いたライバルは決着を勝ち取り、英雄として記録される", () => {
    // 段階4のライバルがいる世界で決着が成ると、先陣を切った者が英雄になる。
    // f1 は3つ目の季節の変わり目に判定される（英雄器の者は 20×3=60 ≥ 50 で段階4）
    let g = startWorld("w-inv-rhero");
    let res = step(g, { type: "rest" }, cfg);
    g = res.state;
    let heroEvents: (typeof res)["events"] = [];
    for (let i = 1; i < 12; i++) {
      res = step(g, { type: "rest" }, cfg);
      g = res.state;
      if (res.events.some((e) => e.type === "crisisRivalHero")) heroEvents = res.events;
    }
    expect(g.crisis!.boundaries).toBe(3);
    const hero = heroEvents.find((e) => e.type === "crisisRivalHero");
    expect(hero).toBeDefined();
    expect(g.counters["crisis.rival.hero"]).toBe(1);
    expect(g.crisis!.log.some((l) => l.kind === "rival.hero" && l.ref?.startsWith("rival."))).toBe(
      true,
    );
    // 英雄の記録はライバルの名で解ける（抽選順の index → 名＋二つ名）
    expect(hero && "index" in hero && Number.isInteger(hero.index)).toBe(true);
  });

  it("街を去ったライバルは決着に名乗りを上げない（X-12：英雄の記録も残らない）", () => {
    // 全ライバルに退場の印を立てた世界：英雄の適性があっても champions は空。
    // 決着そのものは勢力の備えで成る（世界は主人公を待たない —— 居ない者は担えない）
    let g = startWorld("w-inv-rgone");
    g = {
      ...g,
      flags: {
        ...g.flags,
        "npc.gone.rival.0": true,
        "npc.gone.rival.1": true,
        "npc.gone.rival.2": true,
        "npc.gone.rival.3": true,
      },
    };
    const rs = crisisRivals(profile(g, { boundaries: 5 }), cfg.crisis);
    expect(rs.every((r) => r.gone)).toBe(true);
    expect(rs.some((r) => r.stage === 4)).toBe(true); // 段階は届いていても居ない

    let s = g;
    let heroEvent = false;
    for (let i = 0; i < 12; i++) {
      const res = step(s, { type: "rest" }, cfg);
      s = res.state;
      if (res.events.some((e) => e.type === "crisisRivalHero")) heroEvent = true;
    }
    expect(heroEvent).toBe(false);
    expect(s.counters["crisis.rival.hero"]).toBeUndefined();
    expect(s.crisis!.log.some((l) => l.kind === "rival.hero")).toBe(false);
    // 決着は勢力だけで成る（f1 の備えは届くので resolved のまま）
    expect(s.crisis!.finales.find((f) => f.id === "finale.f1")?.resolved).toBe(true);
  });
});

describe("決定性（同じ世界・同じ行いは同じ結果）", () => {
  it("関与・打診・起こしの判定はシードから決定的", () => {
    const build = () =>
      profile(startWorld("w-inv-det"), {
        tp: 8,
        hero: { might: 20, craft: 10 },
        skills: { swordplay: 30 },
        standing: "citizen",
      });
    const a = build();
    const b = build();
    expect(crisisInvolvement(a, cfg.crisis)).toEqual(crisisInvolvement(b, cfg.crisis));
    expect(crisisFinaleOffers(a, cfg.crisis)).toEqual(crisisFinaleOffers(b, cfg.crisis));
    // 同じ行いは同じ結果（起こしの乱数も世界シード由来）
    const r1 = step(a, { type: "crisisLead", id: "finale.f1" }, cfg);
    const r2 = step(b, { type: "crisisLead", id: "finale.f1" }, cfg);
    expect(r1.events).toEqual(r2.events);
    expect(r1.state.crisis).toEqual(r2.state.crisis);
  });
});
