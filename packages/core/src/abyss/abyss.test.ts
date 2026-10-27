import { describe, expect, it } from "vitest";
import type { EnemyDef } from "../combat/index.js";
import type { ActionEvent } from "../events/index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import {
  abyssRunSeed,
  endRun,
  floorEnemy,
  floorFactor,
  floorPool,
  killFloor,
  scaleEnemy,
  spendLight,
  startRun,
  type AbyssConfig,
} from "./index.js";

const abyss: AbyssConfig = {
  baseFactor: 1.0,
  growthPerFloor: 0.4,
  agilityPerFloor: 0.5,
  maxTurns: 5,
  poolBase: 16,
  poolGrowthPerFloor: 14,
};

const mk = (
  id: string,
  hp: number,
  challenge: number,
  agility: number,
  power: number,
): EnemyDef => ({
  id,
  name: id,
  hp,
  intervalTicks: 10,
  challenge,
  agility,
  attack: { id: `${id}-atk`, name: "攻撃", power },
  moves: { big: { id: `${id}-big`, name: "大技", power: power * 2 } },
  pattern: [{ type: "attack" }, { type: "attack" }, { type: "telegraph", move: "big", ticks: 8 }],
});

// enemies.json 相当の階層：雑魚→中堅→強敵（挑戦差順）
const pool: EnemyDef[] = [
  mk("stray_dog", 10, 8, 3, 3),
  mk("wolf", 18, 15, 5, 4),
  mk("boar", 24, 22, 3, 7),
  mk("bandit", 30, 30, 4, 8),
  mk("ogre", 40, 36, 2, 10),
];

describe("深層の敵列（T-43、06 §3B）", () => {
  it("同じシードのランは同じ敵列になる（決定的）", () => {
    const seedA = abyssRunSeed("world", 0);
    const seq = (seed: string) =>
      Array.from({ length: 6 }, (_, i) => floorEnemy(seed, i + 1, pool, abyss).id);
    expect(seq(seedA)).toEqual(seq(seedA));
    // ランごとにシードが変わるので、別の潜行は別の敵列になりうる
    expect(abyssRunSeed("world", 1)).not.toBe(seedA);
  });

  it("敵は層に応じて強くなる（HP・技威力・挑戦差・敏捷）", () => {
    const f3 = scaleEnemy(pool[1]!, 3, abyss); // factor = 1.0 + 0.4*2 = 1.8
    expect(f3.hp).toBe(Math.round(18 * 1.8));
    expect(f3.challenge).toBe(Math.round(15 * 1.8));
    expect(f3.agility).toBe(Math.round(5 + 0.5 * 2));
    expect(f3.attack.power).toBe(Math.round(4 * 1.8));
    expect(f3.moves["big"]!.power).toBe(Math.round(8 * 1.8));
    // 行動パターン・id・名は素の敵のものを引き継ぐ（予兆の学習が効く）
    expect(f3.pattern).toEqual(pool[1]!.pattern);
    expect(f3.id).toBe("wolf");
    // 1層目は係数 baseFactor（この設定では素のまま）
    const f1 = scaleEnemy(pool[1]!, 1, abyss);
    expect(f1.hp).toBe(18);
  });

  it("浅い層のプールは挑戦差しきい値で絞られ、層が下るほど広がる", () => {
    // 1層目 cap=16：stray_dog(8) と wolf(15) のみ
    expect(floorPool(1, pool, abyss).map((e) => e.id)).toEqual(["stray_dog", "wolf"]);
    // 3層目 cap=44：全件
    expect(floorPool(3, pool, abyss)).toHaveLength(5);
    // しきい値で0件にならないよう全件フォールバックも効く
    const allHard = pool.map((e) => ({ ...e, challenge: 60 }));
    expect(floorPool(1, allHard, abyss)).toHaveLength(5);
  });

  it("灯りは行動ごとに減り、尽きるとランが閉じる", () => {
    let run = startRun("s", abyss);
    expect(run.light).toBe(5);
    for (let i = 0; i < 4; i++) run = spendLight(run);
    expect(run.done).toBe(false);
    run = spendLight(run);
    expect(run.done).toBe(true);
    expect(run.end).toBe("light");
    expect(run.light).toBe(0);
  });

  it("最後の灯りで倒しても層は刻まれ、逃走・離脱で閉じられる", () => {
    let run = startRun("s", abyss);
    run = killFloor(run, { enemyId: "wolf", difficulty: 15 });
    expect(run.floor).toBe(2);
    expect(run.kills).toHaveLength(1);
    const fled = endRun(run, "fled");
    expect(fled.done).toBe(true);
    expect(fled.end).toBe("fled");
  });
});

// ---- step との接続（abyss コマンド：層ごとの撃破経験・深度記録・終了形）----
// unique.test.ts と同じ構成（balance.json 相当の最小値）
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
    fatiguePerAction: { wait: 1, train: 12, work: 10, combat: 20, abyss: 24 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: {
      train: { strength: 2, endurance: 2, dexterity: 2 },
      work: { dexterity: 2, spirit: 1 },
      combat: { strength: 2, endurance: 3, agility: 2 },
      abyss: { strength: 2, endurance: 3, agility: 2 },
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
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
});

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];
const fresh = () =>
  newGame("seed", "名無し", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
const kills = (n: number, id = "wolf", d = 15) =>
  Array.from({ length: n }, () => ({ enemyId: id, difficulty: d }));

describe("abyss コマンド（T-43）", () => {
  it("層ごとの撃破に kill.species が刻まれ、潜行は1行動で深度が記録される", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "abyss",
        end: "retreat",
        kills: [
          { enemyId: "wolf", difficulty: 15 },
          { enemyId: "boar", difficulty: 31 },
          { enemyId: "wolf", difficulty: 26 },
        ],
      },
      baseCfg(),
    );
    // 撃破は種別ごとの図鑑（kill.species.*）に入る —— 深層の撃破も狩りと同じ実績
    expect(state.counters["kill.species.wolf"]).toBe(2);
    expect(state.counters["kill.species.boar"]).toBe(1);
    // 深度・潜行回数・累計層数の記録
    expect(state.counters["abyss.runs"]).toBe(1);
    expect(state.counters["abyss.floors"]).toBe(3);
    expect(state.counters["abyss.best"]).toBe(3);
    const ended = events.find((e) => e.type === "abyssEnded");
    expect(ended).toMatchObject({ end: "retreat", depth: 3, best: 3, newBest: true });
    // 潜行は層数によらず1行動
    expect(state.time.action).toBe(s0.time.action + 1);
    // 層ごとの戦闘は kind combat + variant abyss で行動ログに残る（新規性・新聞と共有）
    const log = state.actionLog.filter((e) => e.day === state.time.day);
    expect(log.some((e) => e.kind === "abyss")).toBe(true);
    expect(log.filter((e) => e.kind === "combat" && e.variant === "abyss")).toHaveLength(3);
    // 層ごとの撃破経験（剣術・回避）
    expect(events.filter((e) => e.type === "gainApplied")).toHaveLength(6);
    expect(events.filter((e) => e.type === "combatEnded" && e.won)).toHaveLength(3);
  });

  it("自己ベストは大きい深度だけが更新される", () => {
    let s = fresh();
    s = step(s, { type: "abyss", end: "retreat", kills: kills(3) }, baseCfg()).state;
    expect(s.counters["abyss.best"]).toBe(3);
    // 浅いラン：更新しない（newBest=false、best は据置）
    const shallow = step(s, { type: "abyss", end: "light", kills: kills(2) }, baseCfg());
    expect(shallow.state.counters["abyss.best"]).toBe(3);
    expect(shallow.state.counters["abyss.runs"]).toBe(2);
    expect(shallow.state.counters["abyss.floors"]).toBe(5);
    expect(shallow.events.find((e) => e.type === "abyssEnded")).toMatchObject({
      depth: 2,
      best: 3,
      newBest: false,
    });
    // 深いラン：更新する
    const deep = step(s, { type: "abyss", end: "retreat", kills: kills(5) }, baseCfg());
    expect(deep.state.counters["abyss.best"]).toBe(5);
    expect(deep.events.find((e) => e.type === "abyssEnded")).toMatchObject({
      depth: 5,
      best: 5,
      newBest: true,
    });
  });

  it("逃走で終わるラン：撃破は記録され、未決着の層は失敗経験が入る", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "abyss",
        end: "fled",
        kills: kills(1),
        loss: { enemyId: "bandit", difficulty: 42 },
      },
      baseCfg(),
    );
    expect(state.counters["abyss.best"]).toBe(1);
    expect(state.counters["kill.species.bandit"]).toBeUndefined();
    expect(events.find((e) => e.type === "abyssEnded")).toMatchObject({
      end: "fled",
      depth: 1,
      newBest: true,
    });
    // 未決着の層にも経験が入る（失敗経験。combatEnded won:false fled:true）
    expect(
      events.some((e) => e.type === "combatEnded" && e.enemyId === "bandit" && !e.won && e.fled),
    ).toBe(true);
    expect(state.counters["death.count"]).toBeUndefined();
  });

  it("死亡で終わるラン：death.count と died、未定着経験が半減する", () => {
    const s0 = fresh();
    const pendingBefore = s0.player.skills["swordplay"]!.pending;
    const { state, events } = step(
      s0,
      {
        type: "abyss",
        end: "died",
        kills: kills(2),
        loss: { enemyId: "ogre", difficulty: 50 },
      },
      baseCfg(),
    );
    expect(state.counters["death.count"]).toBe(1);
    expect(events.some((e) => e.type === "died")).toBe(true);
    expect(events.find((e) => e.type === "abyssEnded")).toMatchObject({
      end: "died",
      depth: 2,
      newBest: true,
    });
    // 教会蘇生：このランで積んだ分も含めて未定着は半減（03 §4。死亡時はラン中の経験も半減）
    const pending = state.player.skills["swordplay"]!.pending;
    const added = events
      .filter((e): e is Extract<ActionEvent, { type: "gainApplied" }> => e.type === "gainApplied")
      .filter((e) => e.skill === "swordplay")
      .reduce((s, e) => s + e.amount, 0);
    expect(pending).toBeCloseTo((pendingBefore + added) * 0.5, 5);
  });

  it("灯り切れで0層のランも記録される（深度0・best 据置）", () => {
    const s0 = fresh();
    const { state, events } = step(s0, { type: "abyss", end: "light" }, baseCfg());
    expect(state.counters["abyss.runs"]).toBe(1);
    expect(state.counters["abyss.floors"]).toBe(0);
    expect(events.find((e) => e.type === "abyssEnded")).toMatchObject({
      end: "light",
      depth: 0,
      best: 0,
      newBest: false,
    });
    expect(state.time.action).toBe(s0.time.action + 1);
  });

  it("行動が残っていないと何もしない（潜行は1行動必要）", () => {
    const s = fresh();
    const s0 = { ...s, time: { ...s.time, action: 5 } };
    const { state, events } = step(
      s0,
      { type: "abyss", end: "retreat", kills: kills(3) },
      baseCfg(),
    );
    expect(state.counters["abyss.runs"]).toBeUndefined();
    expect(events.find((e) => e.type === "abyssEnded")).toBeUndefined();
    expect(state).toEqual(s0);
  });
});

describe("floorFactor", () => {
  it("1層目は baseFactor、層ごとに線形成長する", () => {
    expect(floorFactor(1, abyss)).toBe(1.0);
    expect(floorFactor(2, abyss)).toBeCloseTo(1.4);
    expect(floorFactor(6, abyss)).toBeCloseTo(3.0);
  });
});
