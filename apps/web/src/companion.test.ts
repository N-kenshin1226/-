/**
 * 同行者の声（X-38、docs/10 §13「仲間との会話」の最小版）の検証。
 * - 「話す」と相手が応える —— 住人の語彙（greet/respect/街の歳月）で返す
 * - 抽選は世界シード×相手×話した回数 —— 同じ系列なら同じ応答（決定性）
 * - 声の無い相手（名簿に居ない）には何も返らない
 */
import { describe, expect, it } from "vitest";
import type { GameState } from "@trace/core";
import { companionVoice } from "./game.js";

const state = (socialCount: number): GameState =>
  ({
    seed: "e2e",
    world: { kind: "legacy", recipe: 0 },
    life: {
      town: "ardi",
      companion: { npc: "npc.ilda", sinceDay: 0 },
      items: {},
      bonds: {},
      rep: {},
      mealDay: -1,
      mealQuality: 0,
      prayedDay: -1,
      journey: null,
      map: { visited: ["ardi"], heard: ["ardi"] },
    },
    counters: { "action.social": socialCount },
    actionLog: [],
    society: { standing: "drifter" },
    player: { name: "旅人" },
    time: { day: 1, action: 0 },
    crisis: null,
    flags: {},
  }) as unknown as GameState;

describe("同行者の声（X-38）", () => {
  it("同行者に話しかけると、その人の口で応答が返る", () => {
    const v = companionVoice(state(0), "npc.ilda");
    expect(v).not.toBeNull();
    expect(v!.name).toBe("イルダ");
    expect(v!.text.length).toBeGreaterThan(0);
  });

  it("同じ系列なら同じ応答、話した回数が進めば抽選が進む（決定性）", () => {
    const a = companionVoice(state(3), "npc.ilda");
    const b = companionVoice(state(3), "npc.ilda");
    expect(a).toEqual(b);
    // 回数の違う系列は（別の文になるとは限らないが）別の抽選を通る
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const v = companionVoice(state(i), "npc.ilda");
      if (v !== null) seen.add(v.text);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("声の無い相手（名簿に居ない id）には何も返らない", () => {
    expect(companionVoice(state(0), "npc.no_such")).toBeNull();
  });
});
