import { describe, expect, it } from "vitest";
import { succeedLife, type HeirConfig } from "../heir/index.js";
import { newGame } from "../state/newGame.js";
import { deserialize, serialize, SAVE_VERSION } from "../save/index.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import {
  addHeroContribution,
  crisisAreaClosed,
  crisisEnemyChallengeBonus,
  crisisEnemyMods,
  crisisFeatureActive,
  crisisNpcAbsent,
  crisisPreparedness,
  crisisPriceFactor,
  drawCrisis,
  type CrisisConfig,
  type CrisisTypeDef,
} from "./index.js";

/**
 * 世界の危機（docs/08、W-01）のテスト。
 * 季節を短くした専用の時間・危機設定で、世界が自分で動くこと（主人公の行動に
 * 依存しない進行・決着）を確かめる
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

/** 試験用の危機の型：段階3つ（各1季節）、決着の場面は3番目の変わり目 */
const TEST_TYPE: CrisisTypeDef = {
  id: "crisis.test_mist",
  name: "試しの霧",
  weight: 3,
  factions: [
    {
      id: "faction.a",
      name: "甲の勢力",
      speed: { min: 2, max: 4 },
      // 全分野が得意（試験を決定的にするため。備え＝等速で積まれる）
      strongFields: 5,
    },
    { id: "faction.b", name: "乙の勢力", speed: { min: 1, max: 2 } },
  ],
  stages: [
    { id: "omen", name: "兆し", seasons: 1 },
    {
      id: "spread",
      name: "拡大",
      seasons: 1,
      effects: {
        closeAreas: ["highway"],
        price: [{ factor: 1.5 }],
        enemy: [{ area: "forest", hpFactor: 2, powerFactor: 1.5, challengeBonus: 5 }],
      },
    },
    {
      id: "deep",
      name: "深刻",
      seasons: 1,
      effects: {
        npc: [{ id: "npc.sado", kind: "leave" }],
        features: ["feat.test"],
        price: [{ kind: "smithing", factor: 2 }],
      },
    },
  ],
  finales: [
    // required 6：甲（等速2〜4）の力の備えだけで3変わり目には必ず届く（2×3=6）
    { id: "finale.one", name: "場面一", atBoundary: 3, fields: ["might"], required: 6 },
  ],
  variables: [{ key: "source", options: ["a", "b", "c"] }],
};

/** 決着が必ず失敗する重い危機（滅びの試験用） */
const HEAVY_TYPE: CrisisTypeDef = {
  id: "crisis.test_heavy",
  name: "重い危機",
  weight: 1,
  heavy: true,
  factions: [{ id: "faction.a", name: "甲", speed: { min: 1, max: 2 } }],
  stages: [{ id: "omen", name: "兆し", seasons: 1 }],
  finales: [
    { id: "finale.f1", name: "第一の場面", atBoundary: 1, fields: ["might"], required: 99999 },
    {
      id: "finale.f2",
      name: "第二の場面",
      atBoundary: 2,
      fields: ["knowledge"],
      required: 99999,
    },
  ],
};

/** 決着が必ず失敗するが重くない危機（苦戦の末に決着する試験用） */
const LIGHT_FAIL_TYPE: CrisisTypeDef = {
  ...HEAVY_TYPE,
  id: "crisis.test_light",
  name: "軽い危機",
  heavy: false,
};

/** 必ず決着する危機（required: 0 で最初の場面が必ず成功。残りの場面は来ない） */
const SURE_WIN_TYPE: CrisisTypeDef = {
  ...HEAVY_TYPE,
  id: "crisis.test_sure",
  name: "弱い危機",
  heavy: false,
  finales: [
    { id: "finale.f1", name: "第一の場面", atBoundary: 1, fields: ["might"], required: 0 },
    {
      id: "finale.f2",
      name: "第二の場面",
      atBoundary: 2,
      fields: ["knowledge"],
      required: 0,
    },
  ],
};

const crisisCfg = (types: readonly CrisisTypeDef[]): CrisisConfig => ({
  types,
  strongFields: 2,
  weakFieldFactor: 0.3,
});

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
  actionLogMax: 5,
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

const cfg: StepConfig = { ...cfgBase, crisis: crisisCfg([TEST_TYPE]) };

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
};

/** n 日ぶん眠る（sleep は季節の変わり目にだけ危機を進める） */
function sleepDays(state: GameState, days: number, stepCfg: StepConfig = cfg): GameState {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, stepCfg).state;
  return s;
}

/** 境界を n 回越える（daysPerSeason × n 日） */
function passBoundaries(state: GameState, n: number, stepCfg: StepConfig = cfg): GameState {
  return sleepDays(state, stepCfg.time.daysPerSeason * n, stepCfg);
}

describe("drawCrisis（危機の抽選）", () => {
  it("同じ世界シードからは同じ危機が抽選される（型・勢力・場面・変数すべて）", () => {
    const a = drawCrisis("w-seed", crisisCfg([TEST_TYPE, HEAVY_TYPE]));
    const b = drawCrisis("w-seed", crisisCfg([TEST_TYPE, HEAVY_TYPE]));
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a!.outcome).toBe("ongoing");
    expect(a!.stageIndex).toBe(0);
    expect(a!.factions).toHaveLength(TEST_TYPE.factions.length);
    // 勢力の得意分野・速さはシード由来の変数
    for (const f of a!.factions) {
      expect(f.strongFields.length).toBeGreaterThanOrEqual(1);
      const def = TEST_TYPE.factions.find((d) => d.id === f.id)!;
      expect(f.speed).toBeGreaterThanOrEqual(def.speed.min);
      expect(f.speed).toBeLessThanOrEqual(def.speed.max);
    }
    // 変数は options の中から1つ選ばれる
    expect(["a", "b", "c"]).toContain(a!.variables["source"]);
  });

  it("別の世界シードでは別の危機になりうる", () => {
    const cfgs = crisisCfg([TEST_TYPE, HEAVY_TYPE]);
    const seen = new Set(
      [...Array(20).keys()].map((i) => {
        const c = drawCrisis(`w-seed-${i}`, cfgs)!;
        return JSON.stringify({
          t: c.typeId,
          f: c.factions.map((f) => [f.strongFields, Math.round(f.speed * 100)]),
          v: c.variables,
        });
      }),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("型が無ければ危機のない世界（null）", () => {
    expect(drawCrisis("w-seed", crisisCfg([]))).toBeNull();
  });
});

describe("newGame と危機の初期化", () => {
  it("crisis 設定を渡すと世界生成時に危機が抽選される", () => {
    const g = newGame("w-seed", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    expect(g.crisis).not.toBeNull();
    expect(g.crisis!.typeId).toBe("crisis.test_mist");
    expect(g.crisis!.log).toEqual([{ day: 0, kind: "draw", ref: "crisis.test_mist" }]);
    // 同じシードでは同じ世界（newGame 全体の決定性を壊さない）
    const h = newGame("w-seed", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    expect(JSON.stringify(h)).toBe(JSON.stringify(g));
  });

  it("crisis 設定を渡さなければ危機なし（null）", () => {
    const g = newGame("w-seed", "名無し", newGameCfg);
    expect(g.crisis).toBeNull();
  });
});

describe("季節の変わり目の進行（世界が自分で動く）", () => {
  it("季節内の睡眠では進まず、変わり目を越えると段階が進む", () => {
    let g = newGame("w-turn", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    // 季節内（3日ぶん）の睡眠では変化しない
    g = sleepDays(g, 3);
    expect(g.crisis!.stageIndex).toBe(0);
    expect(g.crisis!.seasonsInStage).toBe(0);
    expect(g.crisis!.boundaries).toBe(0);
    // 変わり目（4日目）で1季節進む
    const { state: next, events } = step(g, { type: "rest" }, cfg);
    expect(next.crisis!.boundaries).toBe(1);
    expect(next.crisis!.stageIndex).toBe(1);
    expect(next.crisis!.log.some((e) => e.kind === "stage" && e.ref === "spread")).toBe(true);
    expect(events.some((e) => e.type === "crisisStageChanged" && e.stage === "spread")).toBe(true);
  });

  it("勢力の備えが季節ごとに積まれる（得意分野ほど速い）", () => {
    let g = newGame("w-prep", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    const before = crisisPreparedness(g);
    g = passBoundaries(g, 1);
    const after = crisisPreparedness(g);
    for (const f of Object.keys(after)) {
      expect(after[f as keyof typeof after]).toBeGreaterThan(before[f as keyof typeof before]);
    }
    // faction.a は力（might）が得意（aptitude を 100 に絞った試験設定）
    const fa = g.crisis!.factions.find((f) => f.id === "faction.a")!;
    expect(fa.strongFields).toContain("might");
    expect(fa.prep.might).toBeCloseTo(fa.speed, 5);
  });

  it("段階の影響：エリア閉鎖・物価・敵の強化・NPC離散・危機限定の依頼", () => {
    let g = newGame("w-fx", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    // 段階0（兆し）では影響なし
    expect(crisisAreaClosed(g, cfg.crisis, "highway")).toBe(false);
    expect(crisisPriceFactor(g, cfg.crisis)).toBe(1);
    // 変わり目1 → 段階1（拡大）：エリア閉鎖・物価1.5倍・森の敵強化
    g = passBoundaries(g, 1);
    expect(crisisAreaClosed(g, cfg.crisis, "highway")).toBe(true);
    expect(crisisAreaClosed(g, cfg.crisis, "forest")).toBe(false);
    expect(crisisPriceFactor(g, cfg.crisis)).toBeCloseTo(1.5);
    const mods = crisisEnemyMods(g, cfg.crisis, { id: "wolf", area: "forest" });
    expect(mods.enemyHpFactor).toBeCloseTo(2);
    expect(mods.enemyPowerFactor).toBeCloseTo(1.5);
    expect(crisisEnemyChallengeBonus(g, cfg.crisis, { id: "wolf", area: "forest" })).toBe(5);
    // 別エリアの敵には掛からない
    expect(crisisEnemyMods(g, cfg.crisis, { id: "wolf", area: "highway" }).enemyHpFactor).toBe(1);
    // 変わり目2 → 段階2（深刻）：拡大の影響は解け、NPC離散と限定依頼が出る
    g = passBoundaries(g, 1);
    expect(crisisAreaClosed(g, cfg.crisis, "highway")).toBe(false);
    expect(crisisPriceFactor(g, cfg.crisis)).toBe(1); // 全体倍率は解ける
    expect(crisisPriceFactor(g, cfg.crisis, "smithing")).toBeCloseTo(2); // 系統別は残る
    expect(crisisNpcAbsent(g, "npc.sado")).toBe("leave");
    expect(crisisFeatureActive(g, cfg.crisis, "feat.test")).toBe(true);
    expect(g.crisis!.log.some((e) => e.kind === "npc.leave" && e.ref === "npc.sado")).toBe(true);
  });

  it("物価の影響は仕事の報酬に乗る（step 側）", () => {
    let g = newGame("w-pay", "名無し", { ...newGameCfg, crisis: cfg.crisis, initialMoney: 0 });
    g = passBoundaries(g, 1); // 段階1（拡大）：物価1.5倍
    const r = step(g, { type: "work", kind: "smithing", quality: 50, rewardMoney: 40 }, cfg);
    // rewardMoney 40 × 物価 1.5 = 60
    expect(r.state.player.money).toBe(60);
    const paid = r.events.find((e) => e.type === "moneyPaid");
    expect(paid && "amount" in paid && paid.amount).toBe(60);
  });
});

describe("決着の場面と終幕", () => {
  it("決着の場面は備えが閾値に届けば成功し、危機は解決する", () => {
    let g = newGame("w-finale", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    // 3番目の変わり目に場面一（required: 10。faction.a の力の備えで届くはず）
    let sawFinale = false;
    let sawEnd = false;
    for (let d = 0; d < cfg.time.daysPerSeason * 3; d++) {
      const r = step(g, { type: "rest" }, cfg);
      g = r.state;
      for (const e of r.events) {
        if (e.type === "crisisFinale") {
          sawFinale = true;
          expect(e.id).toBe("finale.one");
        }
        if (e.type === "crisisEnded") {
          sawEnd = true;
          expect(e.outcome).toBe("resolved");
        }
      }
    }
    expect(sawFinale).toBe(true);
    expect(sawEnd).toBe(true);
    expect(g.crisis!.outcome).toBe("resolved");
    expect(g.crisis!.finales[0]!.resolved).toBe(true);
    expect(g.crisis!.finales[0]!.success).toBe(true);
    expect(g.crisis!.log.some((e) => e.kind === "end.resolved")).toBe(true);
    // カウンタが刻まれる（条件DSL・称号から読める）
    expect(g.counters["crisis.finale.win"]).toBe(1);
    expect(g.counters["crisis.end.resolved"]).toBe(1);
    // 解決した危機の影響は解ける
    expect(crisisAreaClosed(g, cfg.crisis, "highway")).toBe(false);
    // 解決後はそれ以上進まない
    const g2 = passBoundaries(g, 1);
    expect(g2.crisis!.boundaries).toBe(g.crisis!.boundaries);
  });

  it("重い危機は決着の場面をすべて落とすと世界が滅びる", () => {
    const heavy = { ...cfgBase, crisis: crisisCfg([HEAVY_TYPE]) };
    let g = newGame("w-ruin", "名無し", { ...newGameCfg, crisis: heavy.crisis });
    let sawRuin = false;
    for (let d = 0; d < cfgBase.time.daysPerSeason * 2; d++) {
      const r = step(g, { type: "rest" }, heavy);
      g = r.state;
      for (const e of r.events) {
        if (e.type === "crisisEnded") {
          sawRuin = true;
          expect(e.outcome).toBe("ruin");
        }
      }
    }
    expect(sawRuin).toBe(true);
    expect(g.crisis!.outcome).toBe("ruin");
    expect(g.crisis!.finales.every((f) => f.resolved && f.success === false)).toBe(true);
    expect(g.counters["crisis.finale.loss"]).toBe(2);
    expect(g.counters["crisis.end.ruin"]).toBe(1);
    expect(g.crisis!.log.some((e) => e.kind === "end.ruin")).toBe(true);
  });

  it("重くない危機は場面をすべて落としても苦戦の末に決着する（滅びない）", () => {
    const light = { ...cfgBase, crisis: crisisCfg([LIGHT_FAIL_TYPE]) };
    let g = newGame("w-struggle", "名無し", { ...newGameCfg, crisis: light.crisis });
    g = passBoundaries(g, 2, light);
    expect(g.crisis!.outcome).toBe("resolved");
    expect(g.crisis!.finales.every((f) => f.resolved && f.success === false)).toBe(true);
  });

  it("決着の場面が成功すれば残りの場面は来ない", () => {
    const sure = { ...cfgBase, crisis: crisisCfg([SURE_WIN_TYPE]) };
    let g = newGame("w-sure", "名無し", { ...newGameCfg, crisis: sure.crisis });
    g = passBoundaries(g, 1, sure);
    expect(g.crisis!.outcome).toBe("resolved");
    expect(g.crisis!.finales[0]!.success).toBe(true);
    expect(g.crisis!.finales[1]!.resolved).toBe(false);
  });

  it("危機は主人公が何もしなくても進行・決着する（世界を主人公に背負わせない）", () => {
    // 何もしない＝寝るだけ。自律的に危機が決着することを確かめる
    let g = newGame("w-auto", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    g = passBoundaries(g, 3);
    expect(g.crisis!.outcome).toBe("resolved");
  });
});

describe("主人公の寄与（備えへの足し。クエストではない）", () => {
  it("addHeroContribution は hero の分野に積まれ、決着の判定に加わる", () => {
    let g = newGame("w-hero", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    g = addHeroContribution(g, "might", 5);
    expect(g.crisis!.hero.might).toBe(5);
    g = addHeroContribution(g, "might", 3);
    g = addHeroContribution(g, "knowledge", 2);
    expect(g.crisis!.hero.might).toBe(8);
    expect(g.crisis!.hero.knowledge).toBe(2);
    // 寄与は「世界の備え」とは別に記録される
    expect(crisisPreparedness(g).might).toBe(0);
  });

  it("寄与で届いた備えは場面を成功に変える（関わると変わる）", () => {
    const finales: CrisisTypeDef["finales"] = [
      { id: "finale.f1", name: "場面", atBoundary: 1, fields: ["might"], required: 50 },
    ];
    const type: CrisisTypeDef = { ...SURE_WIN_TYPE, id: "crisis.test_contrib", finales };
    const cc = { ...cfgBase, crisis: crisisCfg([type]) };
    // 寄与なし：勢力の備え（1季節で数点）では 50 に届かず失敗
    let g0 = newGame("w-contrib", "名無し", { ...newGameCfg, crisis: cc.crisis });
    g0 = passBoundaries(g0, 1, cc);
    expect(g0.crisis!.finales[0]!.success).toBe(false);
    // 寄与あり：主人公の寄与が足されて成功に変わる
    let g1 = newGame("w-contrib", "名無し", { ...newGameCfg, crisis: cc.crisis });
    g1 = addHeroContribution(g1, "might", 50);
    g1 = passBoundaries(g1, 1, cc);
    expect(g1.crisis!.finales[0]!.success).toBe(true);
    expect(g1.crisis!.outcome).toBe("resolved");
  });

  it("危機なし・終了後の世界への寄与は無視される", () => {
    const g0 = newGame("w-none", "名無し", newGameCfg); // crisis: null
    expect(addHeroContribution(g0, "might", 5)).toBe(g0);
    let g1 = newGame("w-done", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    g1 = passBoundaries(g1, 3);
    expect(g1.crisis!.outcome).toBe("resolved");
    expect(addHeroContribution(g1, "might", 5)).toBe(g1);
    // 0以下の寄与も無視される
    const g2 = newGame("w-zero", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    expect(addHeroContribution(g2, "might", 0)).toBe(g2);
  });
});

describe("セーブ移行（v15 → v16）", () => {
  it("v15 のセーブは crisis: null で移行され、次の季節の変わり目に抽選される", () => {
    // v15 相当のセーブ（crisis フィールドが無い）
    const g = newGame("w-migrate", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    const v15 = JSON.parse(serialize(g)) as Record<string, unknown>;
    v15["version"] = 15;
    delete v15["crisis"];
    const restored = deserialize(JSON.stringify(v15));
    expect(restored.version).toBe(SAVE_VERSION); // v16（危機）以降の移行を経て最新版へ
    expect(restored.crisis).toBeNull();

    // 次の季節の変わり目に抽選される（新しい世界と同じ危機になる）
    const { state: turned, events } = step(
      sleepDays(restored, cfg.time.daysPerSeason - 1),
      { type: "rest" },
      cfg,
    );
    expect(events.some((e) => e.type === "crisisDrawn")).toBe(true);
    expect(turned.crisis).not.toBeNull();
    const fresh = drawCrisis(restored.seed, cfg.crisis!);
    expect(turned.crisis!.typeId).toBe(fresh!.typeId);
    expect(turned.crisis!.factions).toEqual(fresh!.factions);
    expect(turned.crisis!.finales).toEqual(fresh!.finales);
    expect(turned.crisis!.variables).toEqual(fresh!.variables);
  });

  it("crisis を含むセーブは往復する", () => {
    let g = newGame("w-round", "名無し", { ...newGameCfg, crisis: cfg.crisis });
    g = passBoundaries(g, 1);
    expect(deserialize(serialize(g))).toEqual(g);
  });
});

describe("同じ世界の次代（succeedLife）", () => {
  const heirCfg: HeirConfig = { potentialFactor: 0.2, potentialMax: 20 };

  it("危機は生ではなく世界のもの：次代にも前代の進行を引き継ぐ", () => {
    let prev = newGame("w-heir", "前代", { ...newGameCfg, crisis: cfg.crisis });
    prev = passBoundaries(prev, 1);
    expect(prev.crisis!.stageIndex).toBe(1);
    const { state: next } = succeedLife(
      prev,
      "次代",
      { ...newGameCfg, crisis: cfg.crisis },
      heirCfg,
    );
    // 段階・備え・記録・結末がリセットされずそのまま継がれる
    expect(next.crisis).toEqual(prev.crisis);
    // 次代からも同じ危機が進み続ける
    const n2 = passBoundaries(next, 1);
    expect(n2.crisis!.stageIndex).toBe(2);
  });
});
