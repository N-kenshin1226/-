import { describe, expect, it } from "vitest";
import { effectiveGraceDays, rustedValue, type RustConfig } from "./rust.js";
import { consolidateSleep, type SleepConfig } from "./consolidate.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";

const cfg: RustConfig = {
  graceDays: 14,
  ratePerDay: 0.1,
  floorFactor: 0.7,
  relearnFactor: 3,
  capacityThreshold: 300,
  capacityGraceMinFactor: 0.25,
  texts: { rusted: "r", relearning: "l" },
};

describe("錆", () => {
  it("猶予内では下がらない", () => {
    expect(rustedValue(50, 60, 14, 100, cfg)).toBe(50);
    expect(rustedValue(50, 60, 10, 100, cfg)).toBe(50);
  });

  it("猶予を超えると1日 ratePerDay ずつ下がる", () => {
    expect(rustedValue(50, 60, 24, 100, cfg)).toBeCloseTo(49); // 10日分
    expect(rustedValue(50, 60, 34, 100, cfg)).toBeCloseTo(48); // 20日分
  });

  it("下限は peak の floorFactor 倍", () => {
    // 60*0.7 = 42 が床
    expect(rustedValue(50, 60, 1000, 100, cfg)).toBeCloseTo(42);
    // もともと床以下の値はそれ以上下がらない
    expect(rustedValue(41, 60, 1000, 100, cfg)).toBeCloseTo(41);
  });

  it("脳の容量を超えると猶予が縮む", () => {
    // 合計600 → 猶予は 14*300/600 = 7日
    expect(effectiveGraceDays(600, cfg)).toBeCloseTo(7);
    expect(rustedValue(50, 60, 10, 600, cfg)).toBeCloseTo(49.7); // 3日分
    // 下限係数: 極端な超過でも graceDays*0.25 = 3.5 日は残る
    expect(effectiveGraceDays(100000, cfg)).toBeCloseTo(3.5);
  });
});

const sleep: SleepConfig = {
  nightlyCapPerSkill: 99,
  nightlyCapTotal: 999,
  innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
  dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
  qualityMin: 0.6,
  qualityMax: 1.2,
  potentialDecayPerPoint: 0,
  rust: {
    ...cfg,
    texts: {
      rusted: "――《{name}》が錆びついている（-{loss}）",
      relearning: "――身体が覚えている。《{name}》の再習得が速い。",
    },
  },
};

function gameWith(skill: Partial<GameState["player"]["skills"][string]>, day: number): GameState {
  const s = newGame("rust-test", "試し", {
    skillIds: ["smithing", "mining"],
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
  });
  const smithing = { ...s.player.skills["smithing"]!, ...skill };
  return {
    ...s,
    time: { ...s.time, day },
    player: { ...s.player, skills: { ...s.player.skills, smithing } },
  };
}

describe("睡眠時の錆と再習得", () => {
  it("猶予を超えて使っていないスキルが下がり、起床サプライズに載る", () => {
    const s = gameWith({ value: 50, peak: 60, lastUsedDay: 1, pending: 0 }, 20);
    const res = consolidateSleep(s, "normal", false, sleep, {
      names: { smithing: "鍛冶" },
    });
    // 猶予14日→超過5日 → 0.5 低下
    expect(res.state.player.skills["smithing"]!.value).toBeCloseTo(49.5);
    expect(res.report.surprises.some((l) => l.includes("《鍛冶》が錆びついている"))).toBe(true);
  });

  it("peak 未満の再習得は relearnFactor 倍速い", () => {
    // value 40 < peak 60、pending 5 → 定着5 + 追加分 min(残り15, 5*2)=10 → 55
    const s = gameWith({ value: 40, peak: 60, lastUsedDay: 20, pending: 5 }, 20);
    const res = consolidateSleep(s, "normal", false, sleep);
    expect(res.state.player.skills["smithing"]!.value).toBeCloseTo(55);
    // peak は更新しない（60 のまま）
    expect(res.state.player.skills["smithing"]!.peak).toBe(60);
    expect(res.report.surprises.some((l) => l.includes("身体が覚えている"))).toBe(true);
  });

  it("peak を超えた分には再習得倍率がかからない", () => {
    // value 58 < peak 60、pending 10。
    // peak までの余白2を3倍速で埋める → 消費 2/3、残り 10-2/3 は1倍 → to = 60 + 28/3
    const s = gameWith({ value: 58, peak: 60, lastUsedDay: 20, pending: 10 }, 20);
    const res = consolidateSleep(s, "normal", false, sleep);
    expect(res.state.player.skills["smithing"]!.value).toBeCloseTo(60 + 28 / 3, 5);
    expect(res.state.player.skills["smithing"]!.peak).toBeCloseTo(60 + 28 / 3, 5);
  });

  it("rust 設定が無い旧来の定着と同じ（互換）", () => {
    const { rust: _drop, ...noRust } = sleep;
    const s = gameWith({ value: 50, peak: 60, lastUsedDay: 1, pending: 0 }, 20);
    const res = consolidateSleep(s, "normal", false, noRust);
    expect(res.state.player.skills["smithing"]!.value).toBe(50);
    expect(res.report.surprises).toEqual([]);
  });
});
