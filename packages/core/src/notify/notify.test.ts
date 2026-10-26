import { describe, expect, it } from "vitest";
import { approaching, consumeS, emitKehai, rankOf, resetDailyNotify } from "./index.js";
import { newGame } from "../state/newGame.js";

const mk = () =>
  newGame("seed", "名無し", {
    skillIds: ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"],
    initialPotential: 100,
    initialStatValue: 10,
  });

describe("通知予算（03 §6）", () => {
  it("Sは1日1回まで。2回目は抑制される", () => {
    let s = mk();
    let r = consumeS(s);
    s = r.state;
    expect(r.allowed).toBe(true);
    r = consumeS(s);
    expect(r.allowed).toBe(false);
    expect(r.state.notify.sToday).toBe(true);
  });

  it("日付が変わると予算がリセットされる", () => {
    let s = mk();
    s = consumeS(s).state;
    s = { ...s, time: { ...s.time, day: 1 } };
    s = resetDailyNotify(s);
    expect(s.notify.sToday).toBe(false);
    expect(s.notify.day).toBe(1);
    expect(consumeS(s).allowed).toBe(true);
  });

  it("rankOf: 称号は定義のランク、tierUpはA、diedはB", () => {
    const titles = [{ id: "t.x", rank: "S" as const }];
    expect(rankOf({ type: "titleGained", id: "t.x", rank: "S" }, titles)).toBe("S");
    expect(rankOf({ type: "tierUp", kind: "smithing", tier: 2 }, titles)).toBe("A");
    expect(rankOf({ type: "died" }, titles)).toBe("B");
    expect(rankOf({ type: "gainApplied", skill: "x", amount: 1 }, titles)).toBeNull();
  });
});

describe("気配（S候補への接近）", () => {
  const sTitles = [
    {
      id: "title.s_test",
      rank: "S" as const,
      condition: { counter: "kill.species.wolf", gte: 100 },
    },
  ];

  it("8割に近づくと気配が出る（条件は明かさない）", () => {
    let s = mk();
    s = { ...s, counters: { "kill.species.wolf": 84 } };
    const r = emitKehai(s, sTitles);
    expect(r.fired).toEqual(["title.s_test"]);
    expect(r.state.notify.kehai).toContain("title.s_test");
    expect(approaching(sTitles[0]!.condition, s)).toBe(true);
  });

  it("0 や 達成済みでは出ない・同じ日に二度出ない", () => {
    let s = mk();
    expect(emitKehai(s, sTitles).fired).toEqual([]);
    s = { ...s, counters: { "kill.species.wolf": 84 } };
    const r = emitKehai(s, sTitles);
    expect(r.fired).toEqual(["title.s_test"]);
    // 同日に二度目は出ない
    expect(emitKehai(r.state, sTitles).fired).toEqual([]);
    // 達成後は出ない
    s = { ...s, counters: { "kill.species.wolf": 100 } };
    // （達成判定自体は称号側。approaching は範囲外なので false）
    expect(approaching(sTitles[0]!.condition, s)).toBe(false);
  });
});
