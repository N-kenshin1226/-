import { describe, expect, it } from "vitest";
import { fishingGame, type FishingConfig } from "./fishing.js";

const cfg: FishingConfig = {
  beats: 3,
  beatIntervalMs: 1400,
  windowBaseMs: 90,
  windowPerSkillMs: 2.5,
  qualityBase: 10,
  qualityScale: 90,
  catchMinHits: 1,
  criticalFlag: "大物",
  escapeFlag: "逃がした",
};

describe("fishing（釣り = タイミングエンジンの皮）", () => {
  it("autoplay（上手い人の入力列）で釣り上げ、全アタリなら大物になる", () => {
    const g = fishingGame(cfg);
    const ctx = { skill: 30, seed: "s1" };
    let s = g.init(ctx);
    for (const input of g.autoplay(ctx)) s = g.tick(s, input);
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.caught).toBe(true);
    expect(r.hits).toBe(r.total);
    expect(r.quality).toBe(100);
    expect(r.flags).toContain("大物");
  });

  it("無入力なら逃がす（品質0・失敗フラグ）", () => {
    const g = fishingGame(cfg);
    const s = g.init({ skill: 0, seed: "1" });
    const r = g.result(s);
    expect(r.caught).toBe(false);
    expect(r.quality).toBe(0);
    expect(r.flags).toContain("逃がした");
    expect(r.flags).not.toContain("大物");
  });

  it("一部だけ掛ければ釣れるが大物ではない", () => {
    const g = fishingGame(cfg);
    let s = g.init({ skill: 0, seed: "1" });
    // 1回目だけアタリを取る（残りは大きく外す）
    s = g.tick(s, { at: cfg.beatIntervalMs });
    s = g.tick(s, { at: cfg.beatIntervalMs * 2 + 800 });
    s = g.tick(s, { at: cfg.beatIntervalMs * 3 + 800 });
    const r = g.result(s);
    expect(r.hits).toBe(1);
    expect(r.caught).toBe(true);
    expect(r.quality).toBeCloseTo(10 + (1 / 3) * 90, 1);
    expect(r.flags).not.toContain("大物");
    expect(r.flags).not.toContain("逃がした");
  });

  it("同じシードと入力で結果が決定的", () => {
    const g = fishingGame(cfg);
    const run = () => {
      const ctx = { skill: 10, seed: "same" };
      let s = g.init(ctx);
      for (const input of g.autoplay(ctx)) s = g.tick(s, input);
      return g.result(s);
    };
    expect(run()).toEqual(run());
  });

  it("スキルで窓が広がる（判定はエンジン側、皮はそのまま）", () => {
    const g = fishingGame(cfg);
    const w0 = g.init({ skill: 0, seed: "1" }).halfWidth;
    const w1 = g.init({ skill: 40, seed: "1" }).halfWidth;
    expect(w1).toBeGreaterThan(w0);
  });
});
