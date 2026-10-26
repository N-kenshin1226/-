import { describe, expect, it } from "vitest";
import { performanceGame, type PerformanceConfig } from "./performance.js";

const cfg: PerformanceConfig = {
  beats: 8,
  beatIntervalMs: 550,
  windowBaseMs: 75,
  windowPerSkillMs: 1.6,
  qualityBase: 20,
  qualityScale: 80,
  criticalFlag: "名演",
  failBelowScore: 0.5,
  failFlag: "演奏失敗",
  unlocks: { seeMeterAt: 20, seePhraseAt: 40 },
};

function playAll(g: ReturnType<typeof performanceGame>, reactionMs: number) {
  let s = g.init({ skill: 0, seed: "1" });
  for (let i = 0; i < s.beats.length; i++) {
    s = g.tick(s, { at: (i + 1) * cfg.beatIntervalMs + reactionMs });
  }
  return g.result(s);
}

describe("performance（演奏 = タイミングエンジンの皮）", () => {
  it("autoplay（上手い人の入力列）で全拍命中し名演になる", () => {
    const g = performanceGame(cfg);
    const ctx = { skill: 30, seed: "s1" };
    let s = g.init(ctx);
    for (const input of g.autoplay(ctx)) s = g.tick(s, input);
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.hits).toBe(r.total);
    expect(r.quality).toBe(100);
    expect(r.flags).toContain("名演");
  });

  it("無入力なら失敗フラグと低品質", () => {
    const g = performanceGame(cfg);
    const s = g.init({ skill: 0, seed: "1" });
    const r = g.result(s);
    expect(r.hits).toBe(0);
    expect(r.quality).toBe(20);
    expect(r.flags).toContain("演奏失敗");
  });

  it("全部外れれば失敗フラグ", () => {
    const r = playAll(performanceGame(cfg), 400);
    expect(r.hits).toBe(0);
    expect(r.flags).toContain("演奏失敗");
    expect(r.flags).not.toContain("名演");
  });

  it("半分乗れば中間の品質（閾値ちょうどは失敗にならない）", () => {
    const g = performanceGame(cfg);
    let s = g.init({ skill: 0, seed: "1" });
    for (let i = 0; i < s.beats.length; i++) {
      s = g.tick(s, {
        at: (i + 1) * cfg.beatIntervalMs + (i < 4 ? 0 : 400),
      });
    }
    const r = g.result(s);
    expect(r.hits).toBe(4);
    expect(r.quality).toBeCloseTo(20 + 0.5 * 80, 1);
    expect(r.flags).not.toContain("名演");
    expect(r.flags).not.toContain("演奏失敗");
  });

  it("同じシードと入力で結果が決定的", () => {
    const g = performanceGame(cfg);
    const run = () => {
      const ctx = { skill: 20, seed: "same" };
      let s = g.init(ctx);
      for (const input of g.autoplay(ctx)) s = g.tick(s, input);
      return g.result(s);
    };
    expect(run()).toEqual(run());
  });

  it("スキルで窓が広がる（判定はエンジン側、皮はそのまま）", () => {
    const g = performanceGame(cfg);
    const w0 = g.init({ skill: 0, seed: "1" }).halfWidth;
    const w1 = g.init({ skill: 50, seed: "1" }).halfWidth;
    expect(w1).toBeGreaterThan(w0);
  });
});
