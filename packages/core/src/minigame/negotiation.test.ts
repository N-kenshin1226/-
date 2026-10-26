import { describe, expect, it } from "vitest";
import { negotiationGame, type NegotiationConfig } from "./negotiation.js";

const cfg: NegotiationConfig = {
  topics: [
    { id: "price", name: "値段", beats: "quality" },
    { id: "deadline", name: "納期", beats: "price" },
    { id: "quality", name: "品質", beats: "deadline" },
  ],
  handSizeBase: 3,
  handSizePerSkill: 0.05,
  previewBase: 1,
  previewPerSkill: 0.03,
  counterFactor: 2,
  counterBlockFactor: 0.4,
  hp: 10,
  deckSize: 8,
  criticalFlag: "会心の口論",
  failFlag: "敗北",
};

describe("negotiation（交渉 = 駆け引きエンジンの皮）", () => {
  it("同じシードなら配札が一致する（決定的）", () => {
    const g = negotiationGame(cfg);
    const a = g.init({ skill: 10, seed: "s1" });
    const b = g.init({ skill: 10, seed: "s1" });
    expect(a.hand).toEqual(b.hand);
    expect(a.opponentDeck).toEqual(b.opponentDeck);
    expect(g.init({ skill: 10, seed: "s2" }).hand).not.toEqual(a.hand);
  });

  it("autoplay（貪欲）でゲームが終わる", () => {
    const g = negotiationGame(cfg);
    const ctx = { skill: 20, seed: "s1" };
    let s = g.init(ctx);
    for (const input of g.autoplay(ctx)) s = g.tick(s, input);
    expect(s.done).toBe(true);
    const r = g.result(s);
    expect(r.rounds).toBeGreaterThan(0);
    expect(r.quality).toBeGreaterThanOrEqual(0);
    expect(r.quality).toBeLessThanOrEqual(100);
  });

  it("予告数と手札がスキルで増える", () => {
    const g = negotiationGame(cfg);
    const s0 = g.init({ skill: 0, seed: "s1" });
    const s1 = g.init({ skill: 50, seed: "s1" });
    expect(s1.preview.length).toBeGreaterThan(s0.preview.length);
    expect(s1.hand.length).toBeGreaterThan(s0.hand.length);
  });

  it("勝敗と耐久差で品質が動く", () => {
    const g = negotiationGame(cfg);
    // 完勝するシードを探して会心を確認
    let sawCritical = false;
    for (let i = 0; i < 30; i++) {
      const ctx = { skill: 80, seed: `probe-${i}` };
      let s = g.init(ctx);
      for (const input of g.autoplay(ctx)) s = g.tick(s, input);
      const r = g.result(s);
      if (r.won && r.flags.includes("会心の口論")) sawCritical = true;
      if (!r.won) expect(r.flags).toContain("敗北");
    }
    expect(sawCritical).toBe(true);
  });
});
