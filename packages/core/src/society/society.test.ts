import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import { suggestGoals } from "./index.js";

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const base = (): StepConfig => ({
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
    base: { train: 1.0, work: 1.0 },
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
  society: {
    standings: [
      { id: "drifter", name: "流れ者", order: 0 },
      {
        id: "citizen",
        name: "市民",
        order: 1,
        condition: { counter: "days.slept", gte: 3 },
      },
    ],
    professions: [
      {
        id: "smith",
        name: "鍛冶師",
        condition: { work: { kind: "smithing", tierGte: 2 } },
      },
    ],
    lifeGoals: [
      {
        id: "goal.work",
        name: "最初の作品を作る",
        condition: { counter: "action.work", gte: 1 },
        reward: { pendingBySkill: { smithing: 4 } },
      },
      {
        id: "goal.far",
        name: "遠い目標",
        condition: { counter: "days.slept", gte: 99 },
        reward: {},
      },
    ],
    goalRewardFactor: 1.5,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
});

const run = (state: GameState, cmd: Command, cfg = base()) => step(state, cmd, cfg);

describe("立場の打診と認定", () => {
  it("条件を満たすと打診が来て、受けると立場が更新される", () => {
    const cfg = base();
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    expect(s.society.standing).toBe("drifter");

    // 3日眠ると市民の条件を満たす → 打診イベントが出る
    let sawOffer = false;
    for (let i = 0; i < 3; i++) {
      const r = step(s, { type: "sleep", inn: "normal", dinner: false }, cfg);
      sawOffer = sawOffer || r.events.some((e) => e.type === "offerReceived" && e.id === "citizen");
      s = r.state;
    }
    expect(sawOffer).toBe(true);
    expect(s.society.pendingOffers).toContain("citizen");

    // 受諾で立場が更新される（同じ打診は二度来ない）
    const r = run(s, { type: "acceptOffer", id: "citizen" }, cfg);
    expect(r.state.society.standing).toBe("citizen");
    expect(r.state.society.pendingOffers).not.toContain("citizen");
    expect(r.events.some((e) => e.type === "offerAccepted" && e.id === "citizen")).toBe(true);
  });

  it("打診中でないオファーを受けようとしても何も起きない", () => {
    const cfg = base();
    const s = newGame("s", "t", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const r = run(s, { type: "acceptOffer", id: "citizen" }, cfg);
    expect(r.state.society.standing).toBe("drifter");
    expect(r.events).toHaveLength(0);
  });

  it("職業は条件を満たすと打診され、受諾で profession が入る", () => {
    const cfg = base();
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    // 台帳のティアを2以上にする（quality がティア帯に入る）
    const r = run(s, { type: "work", kind: "smithing", quality: 50, order: "o" }, cfg);
    s = r.state;
    if (!s.society.pendingOffers.includes("smith")) {
      // ティアが未達なら品質を上げて再挑戦（tier は quality 帯で決まる）
      const r2 = run(s, { type: "work", kind: "smithing", quality: 80, order: "o" }, cfg);
      s = r2.state;
    }
    expect(s.society.pendingOffers).toContain("smith");
    const r3 = run(s, { type: "acceptOffer", id: "smith" }, cfg);
    expect(r3.state.society.profession).toBe("smith");
  });
});

describe("人生目標", () => {
  it("宣言した目標を達成すると報酬 pending が入る（係数倍）", () => {
    const cfg = base();
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    let r = run(s, { type: "declareGoal", id: "goal.work" }, cfg);
    s = r.state;
    expect(s.society.goal).toBe("goal.work");
    expect(r.events.some((e) => e.type === "goalDeclared")).toBe(true);

    const before = s.player.skills.smithing!.pending;
    r = run(s, { type: "work", kind: "smithing", quality: 10 }, cfg);
    s = r.state;
    // 仕事で条件を満たした → goalAchieved ＋ smithing.pending += 4 × 1.5
    expect(r.events.some((e) => e.type === "goalAchieved" && e.id === "goal.work")).toBe(true);
    expect(s.society.achievedGoals).toContain("goal.work");
    expect(s.society.goal).toBeNull();
    const gain = r.events.find((e) => e.type === "gainApplied");
    const baseGain = gain?.type === "gainApplied" ? gain.amount : 0;
    // 初作品なので tierUp ボーナスも入る
    expect(s.player.skills.smithing!.pending).toBeCloseTo(
      before + baseGain + cfg.ledger.tierUpBonusPending + 4 * 1.5,
      6,
    );
  });

  it("宣言していない目標は達成されない", () => {
    const cfg = base();
    const s = newGame("s", "t", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const r = run(s, { type: "work", kind: "smithing", quality: 10 }, cfg);
    expect(r.events.some((e) => e.type === "goalAchieved")).toBe(false);
    expect(r.state.society.achievedGoals).toHaveLength(0);
  });

  it("手が届きそうな目標を近い順に提案する", () => {
    const cfg = base();
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    const near = suggestGoals(s, cfg.society, 3);
    // goal.work（0/1→0%）より goal.far（0/99）の方が近い扱いにはならない
    expect(near.map((g) => g.id)).toContain("goal.work");
    // 達成済み・宣言中は提案から外れる
    s = { ...s, society: { ...s.society, achievedGoals: ["goal.work"] } };
    const after = suggestGoals(s, cfg.society, 3);
    expect(after.map((g) => g.id)).not.toContain("goal.work");
  });

  it("差し替え：宣言済みの目標を取り下げられる", () => {
    const cfg = base();
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    s = run(s, { type: "declareGoal", id: "goal.work" }, cfg).state;
    s = run(s, { type: "abandonGoal" }, cfg).state;
    expect(s.society.goal).toBeNull();
    // 別の目標を宣言できる
    s = run(s, { type: "declareGoal", id: "goal.far" }, cfg).state;
    expect(s.society.goal).toBe("goal.far");
  });

  it("打診の受諾は society.offer.<id> カウンタを進め、立場系の目標が達成できる", () => {
    const cfg = base();
    cfg.society = {
      ...cfg.society,
      lifeGoals: [
        ...cfg.society.lifeGoals,
        {
          id: "goal.citizen",
          name: "市民になる",
          condition: { counter: "society.offer.citizen", gte: 1 },
          reward: { pendingBySkill: { eloquence: 4 } },
        },
      ],
    };
    let s = newGame("s", "t", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
    s = run(s, { type: "declareGoal", id: "goal.citizen" }, cfg).state;

    // 3日眠る → 市民の打診が来るが、受諾するまでは目標は未達成
    for (let i = 0; i < 3; i++) {
      s = step(s, { type: "sleep", inn: "normal", dinner: false }, cfg).state;
    }
    expect(s.society.pendingOffers).toContain("citizen");
    expect(s.counters["society.offer.citizen"] ?? 0).toBe(0);
    expect(s.society.achievedGoals).toHaveLength(0);

    // 受諾するとカウンタが進み、同じステップで宣言目標が達成される
    const r = run(s, { type: "acceptOffer", id: "citizen" }, cfg);
    expect(r.state.counters["society.offer.citizen"]).toBe(1);
    expect(r.events.some((e) => e.type === "goalAchieved" && e.id === "goal.citizen")).toBe(true);
    expect(r.state.society.achievedGoals).toContain("goal.citizen");
    // eloquence の pending に 4 × goalRewardFactor が入る
    expect(r.state.player.skills.eloquence!.pending).toBeCloseTo(4 * 1.5, 6);
  });
});
