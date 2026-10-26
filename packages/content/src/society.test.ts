import {
  evaluate,
  findContradictions,
  newGame,
  type Cond,
  type GameState,
  type Work,
} from "@trace/core";
import { describe, expect, it } from "vitest";
import { balance } from "./balance.js";
import { skills } from "./skills.js";
import { society } from "./society.js";

const newGameCfg = {
  skillIds: skills.skills.map((s) => s.id),
  initialPotential: 100,
  initialStatValue: 10,
};

/**
 * 条件が真になるように state を作り替える（到達可能性のスモーク用）。
 * カタログで使っている演算（counter/flag/skill/stat/work/within/and/or）だけを対象にする。
 * not は素の状態で偽のまま（否定の内部までは作り込まない）
 */
function satisfy(cond: Cond, g: GameState): void {
  if ("and" in cond) {
    for (const c of cond.and) satisfy(c, g);
    return;
  }
  if ("or" in cond) {
    satisfy(cond.or[0]!, g);
    return;
  }
  if ("not" in cond) return;
  if ("counter" in cond) {
    g.counters[cond.counter] = cond.eq ?? cond.gte ?? cond.lte ?? 1;
    return;
  }
  if ("flag" in cond) {
    g.flags[cond.flag] = cond.eq ?? true;
    return;
  }
  if ("skill" in cond) {
    const s = g.player.skills[cond.skill];
    if (!s) throw new Error(`テスト用 state にスキル ${cond.skill} が無い`);
    s.value = cond.eq ?? cond.gte ?? 0;
    return;
  }
  if ("stat" in cond) {
    g.player.stats[cond.stat] = cond.eq ?? cond.gte ?? 0;
    return;
  }
  if ("work" in cond) {
    const w = cond.work;
    const n = Math.max(w.count?.atLeast ?? 0, 1);
    for (let i = 0; i < n; i++) {
      const work: Work = {
        id: `test-w${g.ledger.length + i + 1}`,
        kind: w.kind ?? "smithing",
        maker: g.player.name,
        quality: 50,
        tier: w.tierGte ?? 1,
        flags: [],
        day: g.time.day,
        worldSeed: g.seed,
        marketValue: 1,
      };
      g.ledger.push(work);
    }
    return;
  }
  if ("within" in cond) {
    const w = cond.within;
    for (let i = 0; i < w.atLeast; i++) {
      g.actionLog.push({
        day: g.time.day,
        kind: w.kind,
        ...(w.target !== undefined ? { target: w.target } : {}),
      });
    }
    return;
  }
  if ("time" in cond) {
    const d = cond.time.day;
    if (d) g.time = { ...g.time, day: d.gte ?? d.eq ?? g.time.day };
    return;
  }
}

describe("society.json", () => {
  it("人生目標は 10〜15 件で id が一意", () => {
    const goals = society.lifeGoals;
    expect(goals.length).toBeGreaterThanOrEqual(10);
    expect(goals.length).toBeLessThanOrEqual(15);
    expect(new Set(goals.map((g) => g.id)).size).toBe(goals.length);
  });

  it("到達可能性：立場・職業・目標の条件に矛盾を含まない", () => {
    const defs = [
      ...society.lifeGoals,
      ...society.professions,
      ...society.standings
        .filter((s) => s.condition !== undefined)
        .map((s) => ({ id: s.id, condition: s.condition! })),
    ];
    expect(findContradictions(defs)).toEqual([]);
  });

  it("すべての人生目標は初期状態で未達成、条件を満たす状態で達成可能（偽→真）", () => {
    for (const goal of society.lifeGoals) {
      const fresh = newGame("c", "t", newGameCfg);
      expect(evaluate(goal.condition, fresh, balance.time), `${goal.id} が初期状態で真`).toBe(
        false,
      );
      const g = newGame("c", "t", newGameCfg);
      satisfy(goal.condition, g);
      expect(evaluate(goal.condition, g, balance.time), `${goal.id} が充足状態で偽`).toBe(true);
    }
  });
});
