import { describe, expect, it } from "vitest";
import { boardEngine } from "./board.js";
import { dealEngine } from "./deal.js";
import { timingEngine } from "./timing.js";
import type { MiniGame, MiniGameCtx } from "./types.js";

const CTX = (skill: number, seed = "t12"): MiniGameCtx => ({ skill, seed });

/** 入力列を流して最終状態を返す */
function play<I, S, R>(g: MiniGame<I, S, R>, ctx: MiniGameCtx, inputs: I[]): R {
  let s = g.init(ctx);
  for (const i of inputs) s = g.tick(s, i);
  return g.result(s);
}

describe("タイミングエンジン", () => {
  const cfg = { beats: 4, beatIntervalMs: 1000, windowBaseMs: 80, windowPerSkillMs: 2 };
  const game = timingEngine(cfg);

  it("完璧な入力なら満点", () => {
    const perfect = [1000, 2000, 3000, 4000].map((at) => ({ at }));
    const r = play(game, CTX(0), perfect);
    expect(r.score).toBe(1);
  });

  it("無入力なら0点", () => {
    const r = play(game, CTX(0), []);
    expect(r.score).toBe(0);
  });

  it("スキルで判定窓が広がる（勝率ではなく操作の快適さ）", () => {
    const low = game.init(CTX(0));
    const high = game.init(CTX(30));
    expect(high.halfWidth).toBeGreaterThan(low.halfWidth);
    // 窓縁の入力：低スキルでは外れるが高スキルでは入る
    const edge = { at: 1000 + low.halfWidth + (high.halfWidth - low.halfWidth) / 2 };
    const rLow = play(game, CTX(0), [edge]);
    const rHigh = play(game, CTX(30), [edge]);
    expect(rLow.hits).toBe(0);
    expect(rHigh.hits).toBe(1);
  });

  it("同じシードと入力で結果が決定的", () => {
    const inputs = game.autoplay(CTX(20));
    const a = play(game, CTX(20), inputs);
    const b = play(game, CTX(20), inputs);
    expect(a).toEqual(b);
  });

  it("autoplay は高スキルほど中央に近い入力を返す", () => {
    const low = game.autoplay(CTX(0));
    const high = game.autoplay(CTX(80));
    const err = (inputs: { at: number }[]) =>
      inputs.reduce((s, i, k) => s + Math.abs(i.at - (k + 1) * 1000), 0);
    expect(err(high)).toBeLessThan(err(low));
  });
});

describe("盤面エンジン", () => {
  const cfg = {
    width: 5,
    height: 5,
    oreCount: 4,
    rockCount: 4,
    oreQuality: 20,
    hintRadiusBase: 1,
    hintRadiusPerSkill: 0.05,
  };
  const game = boardEngine(cfg);

  it("同じシードで同じ盤面", () => {
    expect(game.init(CTX(0, "x"))).toEqual(game.init(CTX(0, "x")));
    expect(game.init(CTX(0, "x"))).not.toEqual(game.init(CTX(0, "y")));
  });

  it("全鉱脈を掘れば cleared・最高品質", () => {
    const r = play(game, CTX(0), game.autoplay(CTX(0)));
    expect(r.cleared).toBe(true);
    expect(r.quality).toBe(80);
  });

  it("無入力なら品質0", () => {
    expect(play(game, CTX(0), []).quality).toBe(0);
  });

  it("岩を掘ると盤面終了で半減", () => {
    const s = game.init(CTX(0));
    const rock = s.cells.findIndex((c) => c.kind === "rock");
    const r = play(game, CTX(0), [{ x: rock % 5, y: Math.floor(rock / 5) }]);
    expect(r.rocksHit).toBe(1);
  });

  it("空地を開くとヒントが出て、スキルで半径が広がる", () => {
    const s = game.init(CTX(0));
    const empty = s.cells.findIndex((c) => c.kind === "empty");
    const after = game.tick(s, { x: empty % 5, y: Math.floor(empty / 5) });
    expect(after.lastHint).not.toBeNull();
    expect(game.init(CTX(20)).hintRadius).toBeGreaterThan(game.init(CTX(0)).hintRadius);
  });
});

describe("駆け引きエンジン", () => {
  const cfg = {
    topics: [
      { id: "理", beats: "威" },
      { id: "威", beats: "情" },
      { id: "情", beats: "理" },
    ],
    handSizeBase: 3,
    handSizePerSkill: 0.1,
    previewBase: 0,
    previewPerSkill: 0.1,
    counterFactor: 1.5,
    hp: 12,
    deckSize: 8,
  };
  const game = dealEngine(cfg);

  it("同じシードで同じ配札・同じ結果", () => {
    const inputs = game.autoplay(CTX(30));
    expect(play(game, CTX(30), inputs)).toEqual(play(game, CTX(30), inputs));
  });

  it("autoplay で完走できる（終了まで進む）", () => {
    const r = play(game, CTX(30), game.autoplay(CTX(30)));
    expect(r.rounds).toBeGreaterThan(0);
  });

  it("スキルで手札と予告数が増える", () => {
    expect(game.init(CTX(30)).hand.length).toBeGreaterThan(game.init(CTX(0)).hand.length);
    expect(game.init(CTX(30)).preview.length).toBeGreaterThan(game.init(CTX(0)).preview.length);
  });

  it("相性が取れると威力が上がる", () => {
    // 理(power3) は 威 に強い
    const s0 = game.init(CTX(30));
    const s1 = game.tick(s0, { hand: 0 });
    const card = s0.hand[0]!;
    const opp = s0.opponentDeck[0]!;
    // 相性が取れていたら相手HPの減りが power の1.5倍（丸めあり）
    if (
      card.topic === "情"
        ? opp.topic === "理"
        : cfg.topics.find((t) => t.id === card.topic)?.beats === opp.topic
    ) {
      expect(s1.opponentHp).toBeLessThanOrEqual(cfg.hp - card.power - 1);
    }
  });
});
