import { describe, expect, it } from "vitest";
import { appraisalGame, type AppraisalConfig } from "./appraisal.js";

const cfg: AppraisalConfig = {
  width: 6,
  height: 5,
  oreCount: 6,
  rockCount: 3,
  oreQuality: 18,
  hintRadiusBase: 1,
  hintRadiusPerSkill: 0.05,
  missPenaltyFactor: 0.5,
  criticalFlag: "真贋看破",
  failFlag: "見誤り",
};

describe("appraisal（鑑定 = 盤面推理エンジンの皮）", () => {
  it("同じシードなら並びが一致する（決定的）", () => {
    const g = appraisalGame(cfg);
    const a = g.init({ skill: 10, seed: "s1" });
    const b = g.init({ skill: 10, seed: "s1" });
    expect(a.cells).toEqual(b.cells);
    const c = g.init({ skill: 10, seed: "s2" });
    expect(c.cells).not.toEqual(a.cells);
  });

  it("autoplay（全真品を見極める入力列）で完走し真贋看破になる", () => {
    const g = appraisalGame(cfg);
    const ctx = { skill: 10, seed: "s1" };
    let s = g.init(ctx);
    for (const input of g.autoplay(ctx)) s = g.tick(s, input);
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.found).toBe(r.foundTotal);
    expect(r.fakes).toBe(0);
    expect(r.quality).toBe(100);
    expect(r.flags).toContain("真贋看破");
  });

  it("無入力なら品質0", () => {
    const g = appraisalGame(cfg);
    const s = g.init({ skill: 0, seed: "s1" });
    const r = g.result(s);
    expect(r.found).toBe(0);
    expect(r.quality).toBe(0);
    expect(r.flags).toEqual([]);
  });

  it("贋作を掴むと鑑定終了・品質は係数分落ちて見誤りフラグ", () => {
    const g = appraisalGame(cfg);
    let s = g.init({ skill: 0, seed: "s1" });
    // 真品を1つ見極めてから贋作を掴む
    const ore = s.cells.findIndex((c) => c.kind === "ore");
    const rock = s.cells.findIndex((c) => c.kind === "rock");
    s = g.tick(s, { x: ore % s.width, y: Math.floor(ore / s.width) });
    s = g.tick(s, { x: rock % s.width, y: Math.floor(rock / s.width) });
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.fakes).toBe(1);
    expect(r.found).toBe(1);
    // 1/6 = 16.7 → ×0.5 で 8.4（四捨五入で 8.3 になることもあるので幅で見る）
    expect(r.quality).toBeGreaterThan(0);
    expect(r.quality).toBeLessThan(10);
    expect(r.quality).toBeCloseTo((100 / 6) * 0.5, 0);
    expect(r.flags).toContain("見誤り");
    expect(r.flags).not.toContain("真贋看破");
  });

  it("スキルでヒント半径が広がる（並びは変わらない）", () => {
    const g = appraisalGame(cfg);
    const s0 = g.init({ skill: 0, seed: "s1" });
    const s1 = g.init({ skill: 50, seed: "s1" });
    expect(s1.hintRadius).toBeGreaterThan(s0.hintRadius);
    expect(s1.cells).toEqual(s0.cells);
  });
});
