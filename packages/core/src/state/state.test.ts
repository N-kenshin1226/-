import { describe, expect, it } from "vitest";
import { newGame } from "./newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import { deserialize, SAVE_VERSION, serialize } from "../save/index.js";
import type { GameState } from "./types.js";

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

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
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe("newGame", () => {
  it("全スキル・基礎能力が初期値で作られる", () => {
    const g = newGame("seed-1", "テスト", newGameCfg);
    expect(Object.keys(g.player.skills)).toEqual(SKILL_IDS);
    expect(g.player.skills.swordplay).toEqual({
      value: 0,
      peak: 0,
      pending: 0,
      potential: 100,
      potentialCap: 100,
      lastUsedDay: 0,
    });
    expect(g.player.stats.strength).toBe(10);
    expect(g.player.fatigue).toBe(0);
    expect(g.version).toBe(SAVE_VERSION);
  });

  it("出自を渡すと素質が 80〜130 に散り、potentialCap が初期値になる", () => {
    const mk = () =>
      newGame("seed-origin", "出自", {
        ...newGameCfg,
        origin: {
          id: "origin.smith_child",
          potentialBase: 90,
          affinity: { swordplay: 30 },
        },
        potentialInitMin: 80,
        potentialInitMax: 130,
      });
    const g = mk();
    expect(g.player.origin).toBe("origin.smith_child");
    for (const s of Object.values(g.player.skills)) {
      expect(s.potential).toBeGreaterThanOrEqual(80);
      expect(s.potential).toBeLessThanOrEqual(130);
      expect(s.potentialCap).toBe(s.potential);
    }
    // 同じシードでは同じ素質分布（決定論）
    expect(JSON.stringify(mk().player.skills)).toBe(JSON.stringify(g.player.skills));
    // 出自が違えば分布も変わりうる（少なくとも affinity で差が出る）
    const h = newGame("seed-origin", "出自", {
      ...newGameCfg,
      origin: { id: "origin.hunter_child", potentialBase: 95, affinity: {} },
      potentialInitMin: 80,
      potentialInitMax: 130,
    });
    expect(h.player.origin).toBe("origin.hunter_child");
  });
});

describe("step", () => {
  it("入力の state を変更しない（凍結オブジェクトでも動く）", () => {
    const g = deepFreeze(newGame("seed-2", "不変", newGameCfg));
    const snapshot = JSON.stringify(g);
    const { state } = step(g, { type: "wait" }, cfg);
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(state).not.toBe(g);
    expect(state.time.action).toBe(1);
  });

  it("同じ初期状態とコマンド列から同じ最終状態が得られる", () => {
    const commands: Command[] = [
      { type: "wait" },
      { type: "wait" },
      { type: "sleep" },
      { type: "wait" },
    ];
    const run = () =>
      commands.reduce((acc, c) => step(acc, c, cfg).state, newGame("seed-3", "決定", newGameCfg));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("wait は行動を消費し、上限で進まなくなる", () => {
    let g: GameState = newGame("seed-4", "待機", newGameCfg);
    for (let i = 0; i < 6; i++) g = step(g, { type: "wait" }, cfg).state;
    expect(g.time).toEqual({ day: 0, action: 5 });
    expect(g.counters["action.wait"]).toBe(6); // イベント自体は発行される
  });

  it("sleep で翌日になり、カウンタが積まれる", () => {
    const g = newGame("seed-5", "眠り", newGameCfg);
    const r = step(g, { type: "sleep" }, cfg);
    expect(r.state.time).toEqual({ day: 1, action: 0 });
    expect(r.state.counters["days.slept"]).toBe(1);
    expect(r.events[0]?.type).toBe("slept");
  });

  it("actionLog は上限で古い順に丸められる", () => {
    let g = newGame("seed-6", "ログ", newGameCfg);
    for (let i = 0; i < 8; i++) {
      g = step(g, { type: "wait" }, cfg).state;
      g = step(g, { type: "sleep" }, cfg).state;
    }
    expect(g.actionLog.length).toBe(5); // actionLogMax
    expect(g.actionLog.at(-1)?.kind).toBe("wait");
    expect(g.actionLog[0]?.day).toBeGreaterThan(0);
  });
});

describe("save", () => {
  it("serialize → deserialize で完全に往復する", () => {
    let g = newGame("seed-7", "往復", newGameCfg);
    g = step(g, { type: "wait" }, cfg).state;
    const restored = deserialize(serialize(g));
    expect(restored).toEqual(g);
  });

  it("version 0 のダミーデータが移行関数で最新 version になる", () => {
    const g = newGame("seed-8", "移行", newGameCfg);
    const v0 = {
      version: 0,
      seed: g.seed,
      rng: g.rng,
      player: g.player,
    };
    const restored = deserialize(JSON.stringify(v0));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.seed).toBe(g.seed);
    expect(restored.counters).toEqual({});
    expect(restored.time).toEqual({ day: 0, action: 0 });
    expect(restored.today).toEqual({ winds: [], loads: 0 });
  });

  it("version 1 のセーブ（today 無し）は version 2 に移行される", () => {
    const g = newGame("seed-9", "移行2", newGameCfg);
    const v1 = { ...JSON.parse(serialize(g)), version: 1 } as Record<string, unknown>;
    delete v1["today"];
    const restored = deserialize(JSON.stringify(v1));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.today).toEqual({ winds: [], loads: 0 });
    expect(restored.player.load.strength).toBe(0);
    expect(restored.player.overwork).toEqual({ streakDays: 0, active: false });
  });

  it("version 9 のセーブは出自・potentialCap を補って version 10 へ移行される", () => {
    const g = newGame("seed-10", "移行3", newGameCfg);
    const v9 = JSON.parse(serialize(g)) as Record<string, unknown>;
    v9["version"] = 9;
    const p = v9["player"] as Record<string, unknown>;
    delete p["origin"];
    for (const s of Object.values(p["skills"] as Record<string, Record<string, unknown>>)) {
      delete s["potentialCap"];
    }
    const restored = deserialize(JSON.stringify(v9));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.player.origin).toBe("origin.wanderer");
    for (const s of Object.values(restored.player.skills)) {
      expect(s.potentialCap).toBe(100);
    }
  });

  it("未知のバージョンは拒否する", () => {
    expect(() => deserialize(JSON.stringify({ version: 99 }))).toThrow();
  });
});

describe("所持金（T-20：仕事の報酬と宿代）", () => {
  it("仕事をすると報酬が入る（rewardMoney 指定なし→市場価値）", () => {
    const g = newGame("m1", "t", { ...newGameCfg, initialMoney: 10 });
    const r = step(g, { type: "work", kind: "smithing", quality: 50 }, cfg);
    expect(r.state.player.money).toBeGreaterThan(10);
    expect(
      r.events.some((e) => e.type === "moneyPaid" && e.amount === r.state.player.money - 10),
    ).toBe(true);
  });

  it("注文の rewardMoney があればそれが入る", () => {
    const g = newGame("m2", "t", { ...newGameCfg, initialMoney: 0 });
    const r = step(g, { type: "work", kind: "smithing", quality: 50, rewardMoney: 40 }, cfg);
    expect(r.state.player.money).toBe(40);
  });

  it("宿は innCost を払う（rest・自宅は無料）", () => {
    const g = newGame("m3", "t", { ...newGameCfg, initialMoney: 20 });
    const costCfg: StepConfig = {
      ...cfg,
      sleep: { ...cfg.sleep, innCost: { cheap: 8, normal: 15, good: 30 } },
    };
    const r = step(g, { type: "sleep", inn: "normal", dinner: false }, costCfg);
    expect(r.state.player.money).toBe(5);
    // 所持金を超える宿代は 0 で止まる（CLI 側で選べないようにする）
    const r2 = step(r.state, { type: "sleep", inn: "good", dinner: false }, costCfg);
    expect(r2.state.player.money).toBe(0);
    // rest は無料
    const r3 = step(r2.state, { type: "rest" }, costCfg);
    expect(r3.state.player.money).toBe(0);
  });
});
