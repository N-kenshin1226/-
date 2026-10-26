import { describe, expect, it } from "vitest";
import { biographyMaterial } from "./index.js";
import { newGame } from "../state/newGame.js";
import type { GameState, Work } from "../state/types.js";

const state = (): GameState =>
  newGame("t", "テスト", {
    skillIds: ["smithing", "mining", "swordplay"],
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
    origin: {
      id: "origin.villager",
      potentialBase: 100,
      affinity: {},
    },
    potentialInitMin: 0,
    potentialInitMax: 0,
  });

const work = (id: string, tier: number, quality: number): Work => ({
  id,
  kind: "smithing",
  maker: "テスト",
  quality,
  tier,
  flags: [],
  day: 1,
  worldSeed: "t",
  marketValue: 100,
});

describe("biographyMaterial（T-37 伝記の素材）", () => {
  it("初期状態：日数・行動・出自・立場が取れる", () => {
    const m = biographyMaterial(state());
    expect(m.name).toBe("テスト");
    expect(m.days).toBe(0);
    expect(m.deeds).toBe(0);
    expect(m.originId).toBe("origin.villager");
    expect(m.standingId).toBe("drifter");
    expect(m.bestWork).toBeNull();
    expect(m.titleIds).toEqual([]);
  });

  it("代表作：最高ティア→高品質の順に選ばれる", () => {
    const s = state();
    s.ledger = [work("a", 1, 90), work("b", 2, 40), work("c", 2, 70)];
    const m = biographyMaterial(s);
    expect(m.bestWork?.id).toBe("c"); // 同ティアなら品質が高い方
  });

  it("最頂スキルは最高到達値で選ばれる", () => {
    const s = state();
    s.player.skills["smithing"]!.peak = 55.5;
    s.player.skills["mining"]!.peak = 80;
    s.player.skills["swordplay"]!.peak = 30;
    const m = biographyMaterial(s);
    expect(m.peakSkill).toEqual({ id: "mining", value: 80 });
  });

  it("称号・目標・死亡数・行動数が集計される", () => {
    const s = state();
    s.titles = ["title.x", "title.y"];
    s.society.achievedGoals = ["goal.first_work"];
    s.counters["action.total"] = 77;
    s.counters["death.count"] = 2;
    const m = biographyMaterial(s);
    expect(m.deeds).toBe(77);
    expect(m.deaths).toBe(2);
    expect(m.titleIds).toEqual(["title.x", "title.y"]);
    expect(m.achievedGoalIds).toEqual(["goal.first_work"]);
  });
});
