import { describe, expect, it } from "vitest";
import { newGame } from "./newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import { deserialize, serialize } from "../save/index.js";
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
      lastUsedDay: 0,
    });
    expect(g.player.stats.strength).toBe(10);
    expect(g.player.fatigue).toBe(0);
    expect(g.version).toBe(1);
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

  it("version 0 のダミーデータが移行関数で version 1 になる", () => {
    const g = newGame("seed-8", "移行", newGameCfg);
    const v0 = {
      version: 0,
      seed: g.seed,
      rng: g.rng,
      player: g.player,
    };
    const restored = deserialize(JSON.stringify(v0));
    expect(restored.version).toBe(1);
    expect(restored.seed).toBe(g.seed);
    expect(restored.counters).toEqual({});
    expect(restored.time).toEqual({ day: 0, action: 0 });
  });

  it("未知のバージョンは拒否する", () => {
    expect(() => deserialize(JSON.stringify({ version: 99 }))).toThrow();
  });
});
