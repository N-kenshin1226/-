/**
 * 釣りの注文名の水域別出し分け（X-23）の検証。
 * - 生成地方の町の港と海岸の地域は「海の釣り」、川は「川の釣り」、湖は「湖の釣り」
 * - fixed 世界（湖畔だけ）と型の無い場所は従来どおり「湖の釣り」
 * - 注文の中身（id・価値）は水域で変わらない
 */
import { describe, expect, it } from "vitest";
import { WORLD_RECIPE, type GameState } from "@trace/core";
import { fishOrderOf, fishWaterOf, LAKE_ORDER } from "./game.js";
import { genWorld } from "./world.js";

const genState = (seed: string) =>
  ({
    seed,
    world: { kind: "gen", recipe: WORLD_RECIPE },
    life: { town: "t0" },
  }) as GameState;

const legacyState = () =>
  ({
    seed: "e2e",
    world: { kind: "legacy", recipe: 0 },
    life: { town: "ardi" },
  }) as GameState;

describe("釣り場の水域（fishWaterOf）", () => {
  it("生成地方では港と海岸が海・川は川・湖は湖（50シード走査）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const state = genState(`water-${i}`);
      const w = genWorld(state)!;
      for (const p of w.places) {
        if (p.id.endsWith(".harbor")) {
          expect(fishWaterOf(state, p.id)).toBe("sea");
          seen.add("harbor");
        }
      }
      for (const a of w.areas) {
        if (a.typeId === "coast" || a.typeId === "river" || a.typeId === "lake") {
          const want = a.typeId === "coast" ? "sea" : a.typeId;
          expect(fishWaterOf(state, a.id)).toBe(want);
          seen.add(a.typeId);
        }
      }
    }
    // 全水域が少なくとも1回は現れること（走査が空振りしていないか）
    expect(seen).toContain("harbor");
    expect(seen).toContain("coast");
    expect(seen).toContain("river");
    expect(seen).toContain("lake");
  });

  it("fixed 世界はどの場所でも湖（後方互換）", () => {
    expect(fishWaterOf(legacyState(), "lake")).toBe("lake");
    expect(fishWaterOf(legacyState(), "gate")).toBe("lake");
  });
});

describe("釣りの注文（fishOrderOf）", () => {
  it("水域で名が変わり、中身は変わらない", () => {
    // 港と川と湖が同じ世界に揃うシードを探す
    let found: { state: GameState; sea: string; river: string; lake: string } | undefined;
    for (let i = 0; i < 50 && found === undefined; i++) {
      const state = genState(`water-${i}`);
      const w = genWorld(state)!;
      const sea = w.places.find((p) => p.id.endsWith(".harbor"))?.id;
      const river = w.areas.find((a) => a.typeId === "river")?.id;
      const lake = w.areas.find((a) => a.typeId === "lake")?.id;
      if (sea && river && lake) found = { state, sea, river, lake };
    }
    expect(found).toBeDefined();
    const { state, sea, river, lake } = found!;

    expect(fishOrderOf(state, sea).name).toBe("海の釣り");
    expect(fishOrderOf(state, river).name).toBe("川の釣り");
    expect(fishOrderOf(state, lake).name).toBe("湖の釣り");
    for (const id of [sea, river, lake]) {
      const o = fishOrderOf(state, id);
      expect(o.id).toBe(LAKE_ORDER.id);
      expect(o.kind).toBe("fishing");
      expect(o.targetQuality).toBe(LAKE_ORDER.targetQuality);
      expect(o.rewardMoney).toBe(0);
    }
  });
});
