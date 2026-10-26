import { describe, expect, it } from "vitest";
import { miningGame, type MiningConfig } from "./mining.js";

const cfg: MiningConfig = {
  width: 5,
  height: 4,
  oreCount: 5,
  rockCount: 2,
  oreQuality: 20,
  hintRadiusBase: 1,
  hintRadiusPerSkill: 0.04,
  criticalFlag: "会心",
  failFlag: "大崩れ",
};

describe("mining（採掘 = 盤面推理エンジンの皮）", () => {
  it("同じシードなら盤面が一致する（決定的）", () => {
    const g = miningGame(cfg);
    const a = g.init({ skill: 10, seed: "s1" });
    const b = g.init({ skill: 10, seed: "s1" });
    expect(a.cells).toEqual(b.cells);
    const c = g.init({ skill: 10, seed: "s2" });
    expect(c.cells).not.toEqual(a.cells);
  });

  it("autoplay（全鉱脈を掘る入力列）で完走し会心になる", () => {
    const g = miningGame(cfg);
    const ctx = { skill: 10, seed: "s1" };
    let s = g.init(ctx);
    for (const input of g.autoplay(ctx)) s = g.tick(s, input);
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.ores).toBe(r.oresTotal);
    expect(r.quality).toBe(100);
    expect(r.flags).toContain("会心");
  });

  it("岩を穿つと品質半減＋失敗フラグ", () => {
    const g = miningGame(cfg);
    let s = g.init({ skill: 0, seed: "s1" });
    // 鉱石を1つ掘ってから岩を開く
    const ore = s.cells.findIndex((c) => c.kind === "ore");
    const rock = s.cells.findIndex((c) => c.kind === "rock");
    s = g.tick(s, { x: ore % s.width, y: Math.floor(ore / s.width) });
    s = g.tick(s, { x: rock % s.width, y: Math.floor(rock / s.width) });
    const r = g.result(s);
    expect(s.done).toBe(true);
    expect(r.quality).toBe(10); // 1/5=20% → 半減で10
    expect(r.flags).toContain("大崩れ");
  });

  it("スキルでヒント半径が広がる（盤面は変わらない）", () => {
    const g = miningGame(cfg);
    const s0 = g.init({ skill: 0, seed: "s1" });
    const s1 = g.init({ skill: 50, seed: "s1" });
    expect(s1.hintRadius).toBeGreaterThan(s0.hintRadius);
    expect(s1.cells).toEqual(s0.cells);
  });
});
