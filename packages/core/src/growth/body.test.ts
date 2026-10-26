import { describe, expect, it } from "vitest";
import { applyActionLoad, consolidateBody, updateOverwork, type BodyConfig } from "./body.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";

const body: BodyConfig = {
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
  body,
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  titles: [],
};

const newGameCfg = {
  skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
  initialPotential: 100,
  initialStatValue: 10,
};

function train(g: GameState, skill = "smithing"): GameState {
  return step(g, { type: "train", skill, difficulty: 20 }, cfg).state;
}

describe("疲労", () => {
  it("行動ごとに溜まり、種別ごとの値を使う", () => {
    let g = newGame("b1", "疲労", newGameCfg);
    g = train(g);
    expect(g.player.fatigue).toBe(6);
    g = step(g, { type: "wait" }, cfg).state;
    expect(g.player.fatigue).toBe(7);
    // 未定義の種別はデフォルト値
    const w = applyActionLoad(g, "unknown-kind", body);
    expect(w.player.fatigue).toBe(9);
  });

  it("睡眠の質に比例して回復する", () => {
    const g = newGame("b2", "回復", newGameCfg);
    g.player.fatigue = 80;
    const normal = step(g, { type: "sleep", inn: "normal", dinner: false }, cfg).state;
    // q=0.85 → 回復 51
    expect(normal.player.fatigue).toBeCloseTo(80 - 60 * 0.85);
    const good = step(g, { type: "sleep", inn: "good", dinner: true }, cfg).state;
    // q=1.2 → 回復 72
    expect(good.player.fatigue).toBeCloseTo(80 - 60 * 1.2);
    expect(good.player.fatigue).toBeLessThan(normal.player.fatigue);
  });

  it("疲労が F（経験式の疲労係数）に反映される", () => {
    const fresh = newGame("b3", "疲労F", newGameCfg);
    const tired = JSON.parse(JSON.stringify(fresh)) as GameState;
    tired.player.fatigue = 100;
    const a = step(fresh, { type: "train", skill: "smithing", difficulty: 20 }, cfg).state;
    const b = step(tired, { type: "train", skill: "smithing", difficulty: 20 }, cfg).state;
    // fatigue 100 → F = 1 − 1×0.8 = 0.2
    expect(b.player.skills.smithing!.pending).toBeCloseTo(
      a.player.skills.smithing!.pending * 0.2,
      5,
    );
  });
});

describe("基礎能力（負荷 → 定着）", () => {
  it("行動で負荷が溜まり、睡眠で基礎能力に定着する", () => {
    let g = newGame("b4", "負荷", newGameCfg);
    g = train(g); // str+2 end+2 dex+1
    expect(g.player.load.strength).toBe(2);
    expect(g.player.load.dexterity).toBe(1);
    expect(g.today.loads).toBe(5);

    g = step(g, { type: "sleep", inn: "normal", dinner: true }, cfg).state;
    // q=1.1 → str: 10 + 2×0.05×1.1
    expect(g.player.stats.strength).toBeCloseTo(10 + 2 * 0.05 * 1.1);
    expect(g.player.stats.endurance).toBeCloseTo(10 + 2 * 0.05 * 1.1);
    expect(g.player.stats.dexterity).toBeCloseTo(10 + 1 * 0.05 * 1.1);
    // 負荷プールは翌日に持ち越さない
    expect(g.player.load.strength).toBe(0);
    expect(g.today.loads).toBe(0);
  });

  it("定着行が stat として起床ログに混ざる", () => {
    let g = newGame("b5", "行", newGameCfg);
    g.player.skills.swordplay!.pending = 1;
    g = train(g);
    const { events } = step(g, { type: "sleep", inn: "normal", dinner: false }, cfg);
    const wake = events.find((e) => e.type === "wakeReport");
    expect(wake?.type).toBe("wakeReport");
    if (wake?.type !== "wakeReport") return;
    const kinds = wake.report.lines.map((l) => l.kind);
    expect(kinds).toContain("stat");
    expect(kinds).toContain("skill");
    const deltas = wake.report.lines.map((l) => l.delta);
    expect(deltas).toEqual([...deltas].sort((a, b) => a - b));
  });
});

describe("オーバーワーク", () => {
  function overloadedDay(g: GameState): GameState {
    g.today.loads = 20; // > 15 で過負荷の日
    g.actionLog.push({ day: g.time.day, kind: "train", target: "smithing" });
    return step(g, { type: "sleep" }, cfg).state;
  }

  it("過負荷が3日続くと発生し、定着量が半減する", () => {
    let g = newGame("b6", "過負荷", newGameCfg);
    g = overloadedDay(g);
    g = overloadedDay(g);
    expect(g.player.overwork).toEqual({ streakDays: 2, active: false });

    g.player.skills.swordplay!.pending = 10;
    g = overloadedDay(g);
    expect(g.player.overwork).toEqual({ streakDays: 3, active: true });
    // 発生した晩は既に半減：q=0.85 → 上限6.8×0.5=3.4
    expect(g.player.skills.swordplay!.value).toBeCloseTo(3.4);
  });

  it("アクティブ中の定着量が ×0.5、休養日で解除", () => {
    let g = newGame("b7", "解除", newGameCfg);
    g = overloadedDay(g);
    g = overloadedDay(g);
    g = overloadedDay(g);
    expect(g.player.overwork.active).toBe(true);

    // 行動0回で眠る → 休養日で解除
    g = step(g, { type: "rest" }, cfg).state;
    expect(g.player.overwork).toEqual({ streakDays: 0, active: false });
  });

  it("行動があった日の sleep は休養日にならない", () => {
    let g = newGame("b8", "非休養", newGameCfg);
    g = overloadedDay(g);
    g = overloadedDay(g);
    g = overloadedDay(g);
    g = train(g); // 行動してから寝る → 休養日ではない
    g = step(g, { type: "sleep" }, cfg).state;
    expect(g.player.overwork.active).toBe(true);
  });
});

describe("rest コマンド", () => {
  it("行動0回なら休養日：素質が回復し起床ログに記録される", () => {
    const g = newGame("b9", "休養", newGameCfg);
    g.player.skills.swordplay!.potential = 90;
    const { state, events } = step(g, { type: "rest" }, cfg);
    expect(state.time.day).toBe(1); // 睡眠と同じく翌日になる
    expect(state.player.skills.swordplay!.potential).toBe(93); // +3
    const wake = events.find((e) => e.type === "wakeReport");
    expect(wake?.type).toBe("wakeReport");
    if (wake?.type === "wakeReport") {
      expect(wake.report.restDay).toBe(true);
      expect(wake.report.quality).toBeCloseTo(0.9); // restQuality
    }
  });

  it("素質の回復は上限 potentialMax で頭打ち", () => {
    const g = newGame("b10", "上限", newGameCfg);
    g.player.skills.swordplay!.potential = 99;
    const { state } = step(g, { type: "rest" }, cfg);
    expect(state.player.skills.swordplay!.potential).toBe(100);
  });

  it("行動後の rest は休養日にならない（ただ眠るだけ）", () => {
    let g = newGame("b11", "無意味", newGameCfg);
    g.player.skills.swordplay!.potential = 90;
    g = train(g);
    const { state, events } = step(g, { type: "rest" }, cfg);
    expect(state.player.skills.swordplay!.potential).toBe(90); // 回復しない
    const wake = events.find((e) => e.type === "wakeReport");
    if (wake?.type === "wakeReport") expect(wake.report.restDay).toBe(false);
  });
});

describe("updateOverwork / consolidateBody 単体", () => {
  it("閾値ちょうどは過負荷ではない（超過のみ）", () => {
    const g = newGame("b12", "境界", newGameCfg);
    g.today.loads = 15;
    g.actionLog.push({ day: 0, kind: "train" });
    const r = updateOverwork(g, body, false);
    expect(r.overwork.streakDays).toBe(0);
  });

  it("オーバーワーク中は基礎能力の定着も半減", () => {
    const g = newGame("b13", "半減", newGameCfg);
    g.player.load.strength = 10;
    const r = consolidateBody(g, 1.0, body, { restDay: false, capFactor: 0.5 });
    expect(r.state.player.stats.strength).toBeCloseTo(10 + 10 * 0.05 * 0.5);
  });
});
