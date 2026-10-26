import { describe, expect, it } from "vitest";
import { simpleJudgmentQuality, smithingGame, type SmithingConfig } from "./smithing.js";

const cfg: SmithingConfig = {
  beats: 5,
  beatIntervalMs: 900,
  windowBaseMs: 70,
  windowPerSkillMs: 2.0,
  qualityBase: 20,
  qualityScale: 80,
  criticalFlag: "会心",
  failBelowScore: 0.4,
  failFlag: "失敗作",
  unlocks: { seeTemperatureAt: 20, seeOrderHintsAt: 40 },
};

function playAll(g: ReturnType<typeof smithingGame>, reactionMs: number) {
  let s = g.init({ skill: 0, seed: "1" });
  for (let i = 0; i < s.beats.length; i++) {
    s = g.tick(s, { at: (i + 1) * cfg.beatIntervalMs + reactionMs });
  }
  return g.result(s);
}

describe("smithing（鍛冶 = タイミングエンジンの皮）", () => {
  it("全部入れば会心フラグと品質上限", () => {
    const r = playAll(smithingGame(cfg), 0);
    expect(r.hits).toBe(5);
    expect(r.quality).toBe(100);
    expect(r.flags).toContain("会心");
  });

  it("全部外れれば失敗作フラグと低品質", () => {
    const r = playAll(smithingGame(cfg), 500);
    expect(r.hits).toBe(0);
    expect(r.quality).toBe(20);
    expect(r.flags).toContain("失敗作");
  });

  it("一部だけ入れば中間の品質", () => {
    const g = smithingGame(cfg);
    let s = g.init({ skill: 0, seed: "1" });
    // 2打だけ命中
    s = g.tick(s, { at: cfg.beatIntervalMs + 10 });
    s = g.tick(s, { at: cfg.beatIntervalMs * 2 + 10 });
    s = g.tick(s, { at: cfg.beatIntervalMs * 3 + 500 });
    s = g.tick(s, { at: cfg.beatIntervalMs * 4 + 500 });
    s = g.tick(s, { at: cfg.beatIntervalMs * 5 + 500 });
    const r = g.result(s);
    expect(r.quality).toBeCloseTo(20 + 0.4 * 80, 1);
    expect(r.flags).not.toContain("会心");
    expect(r.flags).not.toContain("失敗作");
  });

  it("スキルで窓が広がる（判定はエンジン側、皮はそのまま）", () => {
    const g = smithingGame(cfg);
    let s = g.init({ skill: 0, seed: "1" });
    const w0 = s.halfWidth;
    s = g.init({ skill: 50, seed: "1" });
    expect(s.halfWidth).toBeGreaterThan(w0);
  });
});

describe("simpleJudgmentQuality（簡易判定 = 直近の中央値×0.8）", () => {
  it("実績が無いときはスキル由来の見込み値", () => {
    expect(simpleJudgmentQuality([], 60)).toBe(40); // (20+30)*0.8
  });
  it("奇数件は中央値×0.8", () => {
    expect(simpleJudgmentQuality([40, 60, 80], 0)).toBe(48); // 60*0.8
  });
  it("偶数件は中央2件の平均×0.8", () => {
    expect(simpleJudgmentQuality([40, 60, 80, 100], 0)).toBe(56); // 70*0.8
  });
});
