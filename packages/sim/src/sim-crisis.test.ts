import { skills } from "@trace/content";
import { createRng, newGame } from "@trace/core";
import { describe, expect, it } from "vitest";
import { crisisBots, crisisBotDomains, finaleCommand, touchpointCommand } from "./crisis-bots.js";
import { runCrisisWorld } from "./crisis-runner.js";
import { simClock, stepConfig } from "./config.js";

/**
 * 危機シム（W-05、docs/08 §8）のユニットテスト。
 * 世界シードで固定した小さい走行で、ランナーとボットの決定性・
 * 計測の意味（接点の提示・関与の段階・終幕の記録）を検査する。
 * CI ゲート本体（6+1指標の合否）は `pnpm sim:crisis` が担う
 */

const cfg = stepConfig();
const clock = simClock();
const skillIds = skills.skills.map((s) => s.id);
const MAX_DAYS = 220;

const run = (bot: (typeof crisisBots)["idle"], seed: string) =>
  runCrisisWorld(bot, seed, cfg, clock, skillIds, { maxDays: MAX_DAYS });

describe("runCrisisWorld（危機シムの世界ランナー）", () => {
  it("同じ世界シード・同じボットなら結果は完全に決定的", () => {
    const a = run(crisisBots.focused, "test:det");
    const b = run(crisisBots.focused, "test:det");
    expect(b).toEqual(a);
  });

  it("同じ世界シードではボットが違っても同じ危機の型が引かれる（世界は主人公を選ばない）", () => {
    const idle = run(crisisBots.idle, "test:world");
    const focused = run(crisisBots.focused, "test:world");
    const smith = run(crisisBots.lifestyles[0]!, "test:world");
    expect(focused.typeIndex).toBe(idle.typeIndex);
    expect(smith.typeIndex).toBe(idle.typeIndex);
    expect(idle.typeIndex).toBeGreaterThanOrEqual(0);
  });

  it("何もしないボット：世界の危機は主人公なしで終幕を迎え、接点は一件も果たさない", () => {
    const r = run(crisisBots.idle, "crisis:w0");
    expect(r.outcome).toBe("resolved");
    expect(r.endDay).not.toBeNull();
    expect(r.tpDone).toBe(0);
    expect(r.maxStage).toBe(1);
    expect(r.heroLed).toBe(false);
    // 兆しは最初の1時間以内に出ている（公開サンプルは段階0から影響を持つ）
    expect(r.signMinute).not.toBeNull();
    expect(r.signMinute!).toBeLessThanOrEqual(60);
  });

  it("何もしないボットでも重い危機の世界は滅びうる（crisis:w9 は ruin）", () => {
    const r = run(crisisBots.idle, "crisis:w9");
    expect(r.heavy).toBe(true);
    expect(r.outcome).toBe("ruin");
  });

  it("生き方別ボット：接点の提示は日常に届くが、受けなければ達成にならない", () => {
    const smith = crisisBots.lifestyles[0]!;
    const r = runCrisisWorld(smith, "crisis:w0", cfg, clock, skillIds, {
      maxDays: MAX_DAYS,
      ...(crisisBotDomains[smith.id] !== undefined ? { domain: crisisBotDomains[smith.id]! } : {}),
    });
    expect(r.offers).toBeGreaterThan(0);
    expect(r.domainOffers).toBeGreaterThan(0);
    expect(r.tpDone).toBe(0);
    expect(Object.keys(r.offersByKind).length).toBeGreaterThan(0);
  });

  it("危機集中ボット：接点を果たし、関与の段階4（率いた）に届く", () => {
    const r = run(crisisBots.focused, "crisis:w0");
    expect(r.tpDone).toBeGreaterThan(0);
    expect(r.maxStage).toBe(4);
    expect(r.stage4Day).not.toBeNull();
    expect(r.outcome).toBe("resolved");
  });

  it("頂点に向かわないボット：頂点未踏のまま段階4に届く（縛られない）", () => {
    const r = run(crisisBots.noPinnacle, "crisis:w0");
    expect(r.pinnacleTops).toBe(0);
    expect(r.maxStage).toBe(4);
    expect(r.tpDone).toBeGreaterThan(0);
  });

  it("片手間ボット：接点は届くが段階4までは届かない（英雄は勝ち取るもの）", () => {
    const r = run(crisisBots.dabble, "crisis:w0");
    expect(r.offers).toBeGreaterThan(0);
    expect(r.maxStage).toBeLessThan(4);
  });
});

describe("危機ボットのコマンド選択", () => {
  it("touchpointCommand：仕事の接点は注文（order=接点id）として、狩りの接点は相手指定で返す", () => {
    // work 接点（order あり）→ work コマンドに写す
    const workCmd = touchpointCommand({
      def: {
        id: "tp.x",
        kind: "supply",
        field: "craft",
        offer: { name: "品", kind: "smithing", targetQuality: 50, rewardMoney: 100 },
      },
      vessel: "work",
      order: { id: "tp.x", name: "品", kind: "smithing", targetQuality: 50, rewardMoney: 100 },
    });
    expect(workCmd).toEqual({
      type: "work",
      kind: "smithing",
      quality: 50,
      difficulty: 50,
      order: "tp.x",
      rewardMoney: 100,
    });
    // combat 接点（ref＝敵id）→ combat コマンドに写す
    const combatCmd = touchpointCommand({
      def: { id: "tp.y", kind: "defense", field: "might", ref: "wolf" },
      vessel: "combat",
      enemyId: "wolf",
    });
    expect(combatCmd).toEqual({
      type: "combat",
      enemyId: "wolf",
      difficulty: expect.any(Number),
      won: true,
      touchpoint: "tp.y",
    });
  });

  it("finaleCommand：打診の届いていない状態では何も返さない（世界はクエスト一覧ではない）", () => {
    const g = newGame("test:finalecmd", "t", {
      skillIds,
      initialPotential: 100,
      initialStatValue: 10,
      crisis: cfg.crisis,
    });
    const cmd = finaleCommand(g, { cfg, rng: createRng("t"), skillIds });
    expect(cmd).toBeNull();
  });
});
