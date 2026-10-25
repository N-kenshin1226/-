import { describe, expect, it } from "vitest";
import {
  challenge,
  computeGain,
  diminishing,
  fatigueFactor,
  novelty,
  recentRepeats,
  type GainConfig,
} from "./gain.js";
import { createRng } from "../rng/index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";

// balance.json の gain 節と同じ値
const gain: GainConfig = {
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
  gain,
  sleep: {
    nightlyCapPerSkill: 8.0,
    carryoverRatio: 0.5,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
    qualityMin: 0.6,
    qualityMax: 1.2,
    potentialDecayPerPoint: 0.01,
  },
};

const newGameCfg = {
  skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
  initialPotential: 100,
  initialStatValue: 10,
};

describe("challenge(Δ): 逆U字", () => {
  const pts = gain.challengePoints;

  it("制御点の値", () => {
    expect(challenge(-20, pts)).toBeCloseTo(0.05);
    expect(challenge(0, pts)).toBeCloseTo(1.0);
    expect(challenge(10, pts)).toBeCloseTo(1.6);
    expect(challenge(30, pts)).toBe(0);
  });

  it("格下すぎ（Δ < −20）は 0.05、格上すぎ（Δ > +30）は 0", () => {
    expect(challenge(-100, pts)).toBeCloseTo(0.05);
    expect(challenge(-20.0001, pts)).toBeCloseTo(0.05);
    expect(challenge(31, pts)).toBe(0);
    expect(challenge(1000, pts)).toBe(0);
  });

  it("制御点間は線形補間", () => {
    expect(challenge(-10, pts)).toBeCloseTo(0.525); // 0.05 と 1.0 の中点
    expect(challenge(5, pts)).toBeCloseTo(1.3); // 1.0 と 1.6 の中点
    expect(challenge(20, pts)).toBeCloseTo(0.8); // 1.6 と 0 の中点
  });

  it("訓練は上限 challengeTrainCap", () => {
    expect(challenge(10, pts, 0.6)).toBe(0.6);
    expect(challenge(-10, pts, 0.6)).toBeCloseTo(0.525); // 上限未満はそのまま
  });
});

describe("各項の範囲（プロパティテスト 1万件）", () => {
  it("すべての項が 0〜上限に収まる", () => {
    const rng = createRng("gain-prop");
    for (let i = 0; i < 10_000; i++) {
      const r = computeGain(
        {
          kind: "train",
          skill: rng.next() * 120,
          delta: rng.next() * 120 - 60,
          repeats: rng.int(0, 20),
          potential: rng.next() * 200,
          fatigue: rng.next() * 100,
          wind: rng.next() * 2,
          modifiers: rng.next() * 5,
          failed: rng.chance(0.3),
          isTraining: rng.chance(0.5),
        },
        gain,
      );
      const t = r.terms;
      expect(t.challenge).toBeGreaterThanOrEqual(0);
      expect(t.challenge).toBeLessThanOrEqual(1.6);
      expect(t.novelty).toBeGreaterThan(0);
      expect(t.novelty).toBeLessThanOrEqual(1);
      expect(t.fatigue).toBeGreaterThanOrEqual(0.2); // 1 − 0.8
      expect(t.fatigue).toBeLessThanOrEqual(1);
      expect(t.modifiers).toBeLessThanOrEqual(gain.modifierCap);
      expect(t.diminishing).toBeGreaterThanOrEqual(0);
      expect(t.diminishing).toBeLessThanOrEqual(1);
      expect(r.amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("単調性・逓減", () => {
  it("同じ行動の反復で novelty は単調に減る", () => {
    let prev = Infinity;
    for (let rep = 0; rep < 20; rep++) {
      const n = novelty(rep, gain.noveltyK);
      expect(n).toBeLessThan(prev);
      prev = n;
    }
  });

  it("反復で実際の gain も単調に減る", () => {
    let prev = Infinity;
    for (let rep = 0; rep < 10; rep++) {
      const { amount } = computeGain(
        {
          kind: "train",
          skill: 10,
          delta: 10,
          repeats: rep,
          potential: 100,
          fatigue: 0,
        },
        gain,
      );
      expect(amount).toBeLessThan(prev);
      prev = amount;
    }
  });

  it("高値帯（skill 90+）で gain が十分小さい", () => {
    const { amount } = computeGain(
      {
        kind: "train",
        skill: 95,
        delta: 10,
        repeats: 0,
        potential: 100,
        fatigue: 0,
      },
      gain,
    );
    expect(amount).toBeLessThan(0.1);
    expect(diminishing(109.9, gain)).toBeCloseTo(0, 3);
    expect(diminishing(110, gain)).toBe(0);
    expect(diminishing(120, gain)).toBe(0);
  });

  it("失敗は成功の failMultiplier 倍", () => {
    const base = { kind: "train", skill: 10, delta: 10, repeats: 0, potential: 100, fatigue: 0 };
    const ok = computeGain(base, gain).amount;
    const ng = computeGain({ ...base, failed: true }, gain).amount;
    expect(ng).toBeCloseTo(ok * gain.failMultiplier);
  });

  it("fatigueFactor の端点", () => {
    expect(fatigueFactor(0, 0.8)).toBe(1);
    expect(fatigueFactor(100, 0.8)).toBeCloseTo(0.2);
    expect(fatigueFactor(50, 0.8)).toBeCloseTo(0.8);
  });
});

describe("recentRepeats", () => {
  it("直近 window 件の中で kind×target が一致するものだけ数える", () => {
    const log = [
      { kind: "train", target: "swordplay" },
      { kind: "train", target: "smithing" },
      { kind: "wait" },
      { kind: "train", target: "swordplay" },
      { kind: "train", target: "swordplay" },
    ];
    expect(recentRepeats(log, "train", "swordplay", 10)).toBe(3);
    expect(recentRepeats(log, "train", "swordplay", 2)).toBe(2);
    expect(recentRepeats(log, "train", "smithing", 10)).toBe(1);
    expect(recentRepeats(log, "wait", undefined, 10)).toBe(1);
  });
});

describe("train コマンド（step 統合）", () => {
  it("pending に gain が加算され、行動ログに記録される", () => {
    const g0 = newGame("t5", "剣", newGameCfg);
    const { state: g1, events } = step(
      g0,
      { type: "train", skill: "swordplay", difficulty: 15 },
      cfg,
    );
    const s = g1.player.skills.swordplay;
    expect(s).toBeDefined();
    expect(s!.pending).toBeGreaterThan(0);
    expect(s!.value).toBe(0); // 定着は睡眠（T-06）
    expect(g1.time.action).toBe(1);
    expect(g1.actionLog).toEqual([{ day: 0, kind: "train", target: "swordplay" }]);
    const gainEv = events.find((e) => e.type === "gainApplied");
    expect(gainEv).toBeDefined();
    expect((gainEv as { amount: number }).amount).toBeCloseTo(s!.pending);
  });

  it("未知のスキルはエラー", () => {
    const g = newGame("t5b", "不明", newGameCfg);
    expect(() => step(g, { type: "train", skill: "nope", difficulty: 5 }, cfg)).toThrow();
  });

  it("同じ訓練の連打で pending の増分が減る", () => {
    let g = newGame("t5c", "反復", newGameCfg);
    const amounts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { state, events } = step(g, { type: "train", skill: "swordplay", difficulty: 10 }, cfg);
      const ev = events.find((e) => e.type === "gainApplied") as { amount: number };
      amounts.push(ev.amount);
      g = state;
    }
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]!).toBeLessThan(amounts[i - 1]!);
    }
  });
});
