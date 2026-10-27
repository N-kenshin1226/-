import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import { canApprentice, currentMentor, type MentorsConfig } from "./index.js";

/**
 * T-27 師匠（docs/02_growth_system.md §8・§6）。
 * 弟子入り→効果適用→稽古→別れ が決定論的に動くことを検証する。
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

const mentorsCfg: MentorsConfig = {
  mentors: [
    {
      id: "mentor.garo",
      skill: "swordplay",
      condition: { skill: "swordplay", gte: 10 },
      fee: 15,
      potentialRecover: 5,
      effect: { gainVs: { swordplay: 1.5 } },
      flag: "taught.garo_draw",
    },
    {
      id: "mentor.fenn",
      skill: "mining",
      fee: 10,
      potentialRecover: 4,
      effect: { gainVs: { mining: 1.3 } },
    },
  ],
  potentialMax: 100,
};

const cfg = (mentors: MentorsConfig = mentorsCfg): StepConfig =>
  ({
    time: {
      actionsPerDay: 5,
      timeOfDay: ["morning", "morning", "noon", "evening", "night"],
      daysPerWeek: 7,
      daysPerSeason: 28,
      seasonsPerYear: 4,
      moonCycleDays: 28,
      moonPhaseWindowDays: 1,
      startAge: 15,
    },
    actionLogMax: 50,
    gain: {
      base: { train: 1 },
      challengePoints: [
        [0, 1],
        [30, 0],
      ],
      challengeTrainCap: 0.6,
      noveltyK: 1,
      noveltyWindow: 10,
      failMultiplier: 0.6,
      modifierCap: 2.5,
      diminishBase: 110,
      diminishExponent: 1.5,
      fatigueScale: 0.8,
    },
    sleep: {
      nightlyCapPerSkill: 8,
      nightlyCapTotal: 999,
      innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
      dinnerFactors: { withDinner: 1, noDinner: 1 },
      qualityMin: 0.6,
      qualityMax: 1.2,
      potentialDecayPerPoint: 0.01,
    },
    tailwind: {
      defs: [],
      tailwindFactor: 1.3,
      headwindFactor: 0.8,
      recentDays: 3,
      headwindBiasK: 1.5,
      tailwindBoostK: 0.5,
      drawMin: 1,
      drawMax: 2,
    },
    ledger: {
      basePricePerQuality: 2,
      marketWindowDays: 7,
      marketDecayPerWork: 0.9,
      tierUpBonusPending: 8,
    },
    combat: {
      baseHp: 30,
      hpPerEndurance: 2,
      attackBase: 5,
      attackPerSwordplay: 0.15,
      attackPerStrength: 0.2,
      ctBase: 12,
      ctPerAgility: 0.15,
      ctMin: 6,
      defendFactor: 0.5,
      fleeBase: 0.7,
      fleePerAgility: 0.02,
      observeBonus: 20,
      preciseObserve: 40,
      deathPendingFactor: 0.5,
    },
    body: {
      fatiguePerAction: { wait: 1, train: 6 },
      fatigueDefaultPerAction: 2,
      fatigueRecover: 60,
      statLoadPerAction: { train: { strength: 2, endurance: 2, dexterity: 1 } },
      statGainPerLoad: 0.05,
      overloadThreshold: 15,
      overworkStreakDays: 3,
      overworkConsolidateFactor: 0.5,
      restQuality: 0.9,
      restPotentialRecover: 3,
      potentialMax: 100,
    },
    society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
    lore: { atoms: [], connections: [] },
    titles: [],
    mentors,
  }) as StepConfig;

const freshGame = (seed = "mt", money = 100): GameState =>
  newGame(seed, "t", { ...newGameCfg, initialMoney: money });

/** スキル値を直接上げた状態を作る（入門条件を満たすため） */
const withSkill = (g: GameState, skill: string, value: number): GameState => ({
  ...g,
  player: {
    ...g.player,
    skills: { ...g.player.skills, [skill]: { ...g.player.skills[skill]!, value } },
  },
});

const trainGain = (g: GameState, skill: string, c: StepConfig): number => {
  const r = step(g, { type: "train", skill, difficulty: 15 }, c);
  const ev = r.events.find((e) => e.type === "gainApplied");
  return ev?.type === "gainApplied" ? ev.amount : 0;
};

describe("弟子入り", () => {
  it("条件を満たすと弟子入りできる（行動は消費しない）", () => {
    const g0 = withSkill(freshGame("a1"), "swordplay", 12);
    expect(canApprentice(g0, "mentor.garo", mentorsCfg, cfg().time)).toBe(true);
    const r = step(g0, { type: "apprentice", id: "mentor.garo" }, cfg());
    expect(r.state.mentor).toEqual({ id: "mentor.garo", sinceDay: 0 });
    expect(r.state.time).toEqual({ day: 0, action: 0 });
    expect(r.events.some((e) => e.type === "mentorApprenticed" && e.id === "mentor.garo")).toBe(
      true,
    );
  });

  it("条件未達・不明ID・すでに師匠がいる場合は弟子入りできない", () => {
    const g = freshGame("a2");
    // 剣術 0 < 10 で入門不可
    expect(canApprentice(g, "mentor.garo", mentorsCfg, cfg().time)).toBe(false);
    const r1 = step(g, { type: "apprentice", id: "mentor.garo" }, cfg());
    expect(r1.state.mentor).toBeNull();
    expect(r1.events).toHaveLength(0);
    // 不明ID
    expect(step(g, { type: "apprentice", id: "mentor.nobody" }, cfg()).state.mentor).toBeNull();
    // 条件なしの師匠には入門できるが、同時に2人は持てない
    const r2 = step(g, { type: "apprentice", id: "mentor.fenn" }, cfg());
    expect(r2.state.mentor?.id).toBe("mentor.fenn");
    const r3 = step(r2.state, { type: "apprentice", id: "mentor.garo" }, cfg());
    expect(r3.state.mentor?.id).toBe("mentor.fenn"); // 変わらない
    expect(r3.events.some((e) => e.type === "mentorApprenticed")).toBe(false);
  });
});

describe("師匠の効果（M項）", () => {
  it("弟子期間中は担当スキルの gain に係数が乗り、門を出ると消える", () => {
    const plain = withSkill(freshGame("e1"), "swordplay", 12);
    const student = step(plain, { type: "apprentice", id: "mentor.garo" }, cfg()).state;
    expect(currentMentor(student, mentorsCfg)?.id).toBe("mentor.garo");
    // 通常の訓練にも 1.5 倍が乗る（他のスキルには乗らない）
    expect(trainGain(student, "swordplay", cfg())).toBeCloseTo(
      trainGain(plain, "swordplay", cfg()) * 1.5,
      10,
    );
    expect(trainGain(student, "mining", cfg())).toBeCloseTo(trainGain(plain, "mining", cfg()), 10);
    // 門を出ると効果は消える
    const left = step(student, { type: "leaveMentor" }, cfg()).state;
    expect(left.mentor).toBeNull();
    expect(trainGain(left, "swordplay", cfg())).toBeCloseTo(
      trainGain(plain, "swordplay", cfg()),
      10,
    );
  });

  it("弟子期間効果は M項の上限（modifierCap）内で積まれる", () => {
    const strongCfg = cfg({
      mentors: [
        { id: "mentor.garo", skill: "swordplay", fee: 1, effect: { gainVs: { train: 9 } } },
      ],
      potentialMax: 100,
    });
    const g = step(freshGame("cap"), { type: "apprentice", id: "mentor.garo" }, strongCfg).state;
    // gainVs.train=9 でも modifierCap=2.5 で頭打ち
    expect(trainGain(g, "swordplay", strongCfg)).toBeCloseTo(
      trainGain(freshGame("cap"), "swordplay", strongCfg) * 2.5,
      10,
    );
  });
});

describe("師匠の稽古", () => {
  it("礼金を払って1行動の稽古をすると、経験と素質回復・秘伝フラグが入る", () => {
    let g = withSkill(freshGame("t1", 50), "swordplay", 12);
    g = { ...g, player: { ...g.player, skills: { ...g.player.skills } } };
    g.player.skills["swordplay"] = { ...g.player.skills["swordplay"]!, potential: 80 };
    g = step(g, { type: "apprentice", id: "mentor.garo" }, cfg()).state;

    const r = step(g, { type: "trainWithMentor", difficulty: 22 }, cfg());
    expect(r.state.time.action).toBe(1);
    expect(r.state.player.money).toBe(50 - 15);
    // 素質 80 + 5 = 85
    expect(r.state.player.skills["swordplay"]!.potential).toBe(85);
    // 秘伝フラグ（初回のみ）
    expect(r.state.flags["taught.garo_draw"]).toBe(true);
    const ev = r.events.find((e) => e.type === "mentorTrained");
    expect(ev?.type === "mentorTrained" && ev.fee).toBe(15);
    expect(ev?.type === "mentorTrained" && ev.recovered).toEqual([
      { skill: "swordplay", amount: 5 },
    ]);
    expect(ev?.type === "mentorTrained" && ev.flag).toBe("taught.garo_draw");
    // 稽古回数カウンタと行動ログ（kind は train として記録される）
    expect(r.state.counters["mentor.session.mentor.garo"]).toBe(1);
    expect(r.state.counters["action.train"]).toBe(1);
    expect(r.state.actionLog.at(-1)).toMatchObject({ kind: "train", target: "swordplay" });
  });

  it("2回目以降の稽古で秘伝フラグは再び立たない", () => {
    let g = withSkill(freshGame("t2", 50), "swordplay", 12);
    g = step(g, { type: "apprentice", id: "mentor.garo" }, cfg()).state;
    g = step(g, { type: "trainWithMentor", difficulty: 22 }, cfg()).state;
    const r = step(g, { type: "trainWithMentor", difficulty: 22 }, cfg());
    const ev = r.events.find((e) => e.type === "mentorTrained");
    expect(ev?.type === "mentorTrained" && ev.flag).toBeUndefined();
    expect(r.state.counters["mentor.session.mentor.garo"]).toBe(2);
  });

  it("礼金不足・師匠なし・行動残なし・不明定義では何も起きない", () => {
    // 師匠なし
    const noMentor = step(freshGame("f1", 100), { type: "trainWithMentor", difficulty: 10 }, cfg());
    expect(noMentor.state.time.action).toBe(0);
    expect(noMentor.events).toHaveLength(0);
    // 礼金不足
    const poor = step(
      step(
        withSkill(freshGame("f2", 5), "swordplay", 12),
        {
          type: "apprentice",
          id: "mentor.garo",
        },
        cfg(),
      ).state,
      { type: "trainWithMentor", difficulty: 22 },
      cfg(),
    );
    expect(poor.state.time.action).toBe(0);
    expect(poor.state.player.money).toBe(5);
    // 行動残なし
    let full = step(
      withSkill(freshGame("f3", 100), "swordplay", 12),
      {
        type: "apprentice",
        id: "mentor.garo",
      },
      cfg(),
    ).state;
    for (let i = 0; i < 5; i++) full = step(full, { type: "wait" }, cfg()).state;
    const tired = step(full, { type: "trainWithMentor", difficulty: 22 }, cfg());
    expect(tired.events.some((e) => e.type === "mentorTrained")).toBe(false);
  });

  it("素質が上限に近いとき回復は potentialCap で頭打ち", () => {
    let g = withSkill(freshGame("t3", 50), "swordplay", 12);
    g.player.skills["swordplay"] = { ...g.player.skills["swordplay"]!, potential: 97 };
    g = step(g, { type: "apprentice", id: "mentor.garo" }, cfg()).state;
    const r = step(g, { type: "trainWithMentor", difficulty: 22 }, cfg());
    expect(r.state.player.skills["swordplay"]!.potential).toBe(100); // 97+5 → 上限100
    const ev = r.events.find((e) => e.type === "mentorTrained");
    expect(ev?.type === "mentorTrained" && ev.recovered).toEqual([
      { skill: "swordplay", amount: 3 },
    ]);
  });
});

describe("門を出る", () => {
  it("leaveMentor で師匠が外れ、師匠なしでは何も起きない", () => {
    const g = step(
      withSkill(freshGame("l1"), "swordplay", 12),
      {
        type: "apprentice",
        id: "mentor.garo",
      },
      cfg(),
    ).state;
    const r = step(g, { type: "leaveMentor" }, cfg());
    expect(r.state.mentor).toBeNull();
    expect(r.events.some((e) => e.type === "mentorLeft" && e.id === "mentor.garo")).toBe(true);
    // 師匠がいない状態では何も起きない
    const again = step(r.state, { type: "leaveMentor" }, cfg());
    expect(again.events).toHaveLength(0);
  });
});

describe("決定論", () => {
  it("弟子入り→稽古→別れの一連は同じ入力で同じ結果になる", () => {
    const run = () => {
      const cmds: Command[] = [
        { type: "apprentice", id: "mentor.garo" },
        { type: "trainWithMentor", difficulty: 22 },
        { type: "train", skill: "swordplay", difficulty: 22 },
        { type: "sleep", inn: "normal", dinner: true },
        { type: "leaveMentor" },
      ];
      return cmds.reduce(
        (acc, c) => step(acc, c, cfg()).state,
        withSkill(freshGame("det", 100), "swordplay", 12),
      );
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
