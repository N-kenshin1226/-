import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { ActionEvent } from "../events/index.js";
import type { GameState } from "../state/types.js";
import {
  drawIncidents,
  incidentChoosable,
  incidentDoneDayKey,
  incidentLastOfferKey,
  incidentOfferKindDayKey,
  incidentOffers,
  incidentSpeaker,
  type IncidentDef,
  type IncidentsConfig,
} from "./index.js";

/**
 * 日々の出来事（F-05、docs/devin_tasks/F-05_daily_events.md）のテスト。
 * 出来事が日付＋世界シードの独立した抽選で決まること（state.rng を消費しない）、
 * 行動の合間に届き・応えは行動を消費しないこと、間隔（同じ出来事・同じ種類が
 * 続かない）と一度きり・危機条件が効くこと、保証（起きない日が続かない）が
 * 効くことを確かめる
 */

const SKILL_IDS = [
  "swordplay",
  "evasion",
  "observation",
  "smithing",
  "mining",
  "eloquence",
  "fishing",
  "performance",
  "appraisal",
];

/**
 * 試験用の出来事表：
 * - inc.free：無条件の出来事（手堅い手と賭けの手。結果は両方出る形に）
 * - inc.rich：所持金を見る出来事（money 条件の試験台）
 * - inc.once：その生で一度だけ届く出来事
 * - inc.crisis：進行中の危機がある世界にだけ届く出来事（crisis 条件の試験台）
 * - inc.mentor：弟子入り中の師匠だけが運ぶ出来事（mentor.now 旗の試験台）
 * - inc.found2：inc.free と同じ種類（同種が続かない間隔の試験台）
 */
const INCIDENTS: IncidentDef[] = [
  {
    id: "inc.free",
    name: "試験の出来事",
    kind: "encounter",
    text: "――試験用の出来事が起きた。",
    speaker: { kind: "npc", id: "npc.fenn" },
    say: "試験の台詞だ",
    choices: [
      {
        id: "safe",
        label: "手堅く受ける",
        hint: "手堅い",
        outcomes: [{ text: "――小さな得を拾った。", money: 3 }],
      },
      {
        id: "risky",
        label: "賭ける",
        hint: "賭け",
        outcomes: [
          { weight: 1, text: "――大きく当たった。", money: 30 },
          { weight: 1, text: "――外れた。", money: -5 },
        ],
      },
    ],
  },
  {
    id: "inc.rich",
    name: "金持ちの出来事",
    kind: "market",
    text: "――身なりを見て話しかけられた。",
    require: { money: { gte: 100 } },
    choices: [{ id: "talk", label: "話す", outcomes: [{ text: "――話した。" }] }],
  },
  {
    id: "inc.once",
    name: "一度きりの出会い",
    kind: "fate",
    text: "――その生で一度だけの出会い。",
    once: true,
    choices: [
      {
        id: "take",
        label: "受け取る",
        outcomes: [{ text: "――受け取った。", flags: ["inc.once_taken"] }],
      },
    ],
  },
  {
    id: "inc.crisis",
    name: "危機の気配",
    kind: "omen",
    text: "――空の色がいつもと違う。",
    require: { crisis: { active: true } },
    choices: [
      {
        id: "watch",
        label: "見上げる",
        outcomes: [
          { text: "――世界の備えに足された。", contribution: { field: "knowledge", amount: 2 } },
        ],
      },
    ],
  },
  {
    id: "inc.mentor",
    name: "師匠の気まぐれ",
    kind: "visitor",
    text: "――師匠が顔を出した。",
    speaker: { kind: "mentor" },
    say: "稽古は進んでいるか",
    require: { flag: "mentor.now" },
    choices: [
      {
        id: "bow",
        label: "礼をする",
        outcomes: [{ text: "――師匠は満足して帰った。", gain: { skill: "smithing", amount: 2 } }],
      },
    ],
  },
  {
    id: "inc.found2",
    name: "拾い物・乙",
    kind: "encounter",
    text: "――道端に何か落ちている。",
    choices: [
      {
        id: "pick",
        label: "拾う",
        outcomes: [{ text: "――拾った。", counters: { "inc.picked": 1 } }],
      },
    ],
  },
];

const incConfig = (over?: Partial<IncidentsConfig>): IncidentsConfig => ({
  incidents: INCIDENTS,
  perDay: 2,
  chance: 1,
  secondChance: 1,
  cooldownDays: 3,
  kindGapDays: 2,
  pityGapDays: 3,
  npcs: [{ id: "npc.fenn", name: "炉職人の親方", role: "鍛冶職人" }],
  mentors: [{ id: "mentor.test", npc: "npc.fenn", skill: "smithing", fee: 10 }],
  ...over,
});

const cfgBase: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 4,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 40,
  gain: {
    base: { train: 1.0 },
    challengePoints: [
      [-20, 0.05],
      [0, 1.0],
      [10, 1.6],
      [30, 0],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 1.0,
    noveltyWindow: 10,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.8,
  },
  sleep: {
    nightlyCapPerSkill: 8.0,
    nightlyCapTotal: 999,
    carryoverRatio: 0.5,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
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
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
};

/**
 * 届け方の基本形を見る用の表：無条件の出来事3件（同じ種類2件＋別の種類1件。
 * 「同じ種類は同日に並ばない」を見るため encounter を2件入れる）
 */
const cfg: StepConfig = {
  ...cfgBase,
  incidents: incConfig({ incidents: [INCIDENTS[0]!, INCIDENTS[5]!, INCIDENTS[2]!] }),
};

const newGameCfg = {
  skillIds: SKILL_IDS,
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 50,
};

const startWorld = (seed: string): GameState => newGame(seed, "名無し", newGameCfg);

const sleepDays = (state: GameState, days: number, stepCfg: StepConfig = cfg): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "rest" }, stepCfg).state;
  return s;
};

/** その日の届く分を全部届かせる（届く行動番号まで行動する）。その日の出来事も返す */
const deliverDay = (
  state: GameState,
  stepCfg: StepConfig,
): { state: GameState; events: ActionEvent[] } => {
  let s = state;
  const events: ActionEvent[] = [];
  for (let i = 0; i < stepCfg.time.actionsPerDay; i++) {
    const r = step(s, { type: "wait" }, stepCfg);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
};

const deliverToday = (state: GameState, stepCfg: StepConfig): GameState =>
  deliverDay(state, stepCfg).state;

/** 指定の出来事が届いた状態を作る（chance 1 の表で行動を重ねる。届かなければ null） */
const offeredState = (
  seed: string,
  id: string,
  stepCfg: StepConfig,
  maxDays = 10,
): GameState | null => {
  let s = startWorld(seed);
  for (let d = 0; d < maxDays; d++) {
    for (let i = 0; i < stepCfg.time.actionsPerDay; i++) {
      s = step(s, { type: "wait" }, stepCfg).state;
      if (incidentOffers(s, stepCfg.incidents!).some((o) => o.def.id === id)) return s;
    }
    s = step(s, { type: "rest" }, stepCfg).state;
  }
  return null;
};

describe("出来事の届け方（日付＋世界シードの独立した抽選）", () => {
  it("同じ世界・同じ日には同じ出来事が届く（決定的）", () => {
    const r1 = step(startWorld("w-inc-det"), { type: "wait" }, cfg);
    const r2 = step(startWorld("w-inc-det"), { type: "wait" }, cfg);
    expect(r1.events.filter((e) => e.type === "incidentOffered")).toEqual(
      r2.events.filter((e) => e.type === "incidentOffered"),
    );
    expect(incidentOffers(r1.state, cfg.incidents!).map((o) => o.def.id)).toEqual(
      incidentOffers(r2.state, cfg.incidents!).map((o) => o.def.id),
    );
  });

  it("出来事の抽選は state.rng を消費しない", () => {
    const g = startWorld("w-inc-rng");
    const before = g.rng;
    const res = step(g, { type: "wait" }, cfg);
    expect(res.state.rng).toStrictEqual(before);
  });

  it("出来事は行動の合間に届く（行動しない往復・睡眠では届かない）", () => {
    const g = startWorld("w-inc-flow");
    // 行動の無いステップ（条件未達の宣言など、actionPerformed の立たない往復）では届かない
    const free = step(g, { type: "declareGoal", id: "none" }, cfg);
    expect(free.events.some((e) => e.type === "incidentOffered")).toBe(false);
    // 睡眠・休養の日またぎでも届かない
    const slept = step(g, { type: "rest" }, cfg);
    expect(slept.events.some((e) => e.type === "incidentOffered")).toBe(false);
    // 行動すれば届く（届く行動番号まで進めた分だけ）
    const { events } = deliverDay(g, cfg);
    expect(events.some((e) => e.type === "incidentOffered")).toBe(true);
  });

  it("届くのは1日 perDay まで。同じ出来事・同じ種類は同日に並ばない", () => {
    const s = deliverToday(startWorld("w-inc-max"), cfg);
    const today = incidentOffers(s, cfg.incidents!);
    expect(today.length).toBe(cfg.incidents!.perDay);
    expect(new Set(today.map((o) => o.def.id)).size).toBe(today.length);
    expect(new Set(today.map((o) => o.def.kind)).size).toBe(today.length);
  });

  it("届かない日もある（chance 0 では決して届かない）", () => {
    const noCfg: StepConfig = { ...cfgBase, incidents: incConfig({ chance: 0 }) };
    const { state: s, events } = deliverDay(startWorld("w-inc-never"), noCfg);
    expect(events.some((e) => e.type === "incidentOffered")).toBe(false);
    expect(incidentOffers(s, noCfg.incidents!)).toEqual([]);
  });
});

describe("届く条件（提示条件・一度きり・間隔・保証）", () => {
  it("提示条件を満たさない出来事は届かない（所持金を見る）", () => {
    const richOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[1]!] }),
    };
    const poor = deliverToday(startWorld("w-inc-poor"), richOnly);
    expect(incidentOffers(poor, richOnly.incidents!)).toEqual([]);
    let rich = startWorld("w-inc-rich");
    rich = { ...rich, player: { ...rich.player, money: 150 } };
    const r = deliverToday(rich, richOnly);
    expect(incidentOffers(r, richOnly.incidents!).map((o) => o.def.id)).toEqual(["inc.rich"]);
  });

  it("進行中の危機が無い世界では、危機の出来事は届かない", () => {
    const crisisOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[3]!] }),
    };
    const s = deliverToday(startWorld("w-inc-nocrisis"), crisisOnly);
    expect(incidentOffers(s, crisisOnly.incidents!)).toEqual([]);
  });

  it("一度きりの出来事は届いたら二度と候補に挙がらない", () => {
    const onceOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[2]!], perDay: 1 }),
    };
    const offered = offeredState("w-inc-once", "inc.once", onceOnly);
    expect(offered).not.toBeNull();
    // 応えなくても翌日以降は二度と届かない（届いた時点で一生の記録になる）
    let s = offered!;
    for (let d = 0; d < 20; d++) {
      s = sleepDays(s, 1, onceOnly);
      s = deliverToday(s, onceOnly);
      expect(incidentOffers(s, onceOnly.incidents!).map((o) => o.def.id)).not.toContain("inc.once");
    }
  });

  it("同じ出来事は cooldownDays の間は再び届かない", () => {
    const oneOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[0]!], cooldownDays: 3, pityGapDays: 1 }),
    };
    const offered = offeredState("w-inc-cool", "inc.free", oneOnly);
    expect(offered).not.toBeNull();
    const day = offered!.time.day;
    // 翌日・翌々日は間隔内なので候補に挙がらない（保証が効いても間隔は破られない）
    let s = sleepDays(offered!, 1, oneOnly);
    expect(drawIncidents(s, oneOnly.incidents!, oneOnly.time).map((d) => d.def.id)).toEqual([]);
    s = sleepDays(s, 1, oneOnly);
    expect(drawIncidents(s, oneOnly.incidents!, oneOnly.time).map((d) => d.def.id)).toEqual([]);
    // 間隔が開けば再び候補に挙がる（day + 3 以降）
    s = sleepDays(s, 1, oneOnly);
    const ids = drawIncidents(s, oneOnly.incidents!, oneOnly.time).map((d) => d.def.id);
    expect(ids).toContain("inc.free");
    expect(s.time.day - day).toBeGreaterThanOrEqual(3);
  });

  it("同じ種類の出来事は kindGapDays の間は続かない", () => {
    // 同種 kind "encounter" の2出来事。どちらかが届いた翌日は同種が届かない
    const kindCfg: StepConfig = {
      ...cfgBase,
      incidents: incConfig({
        incidents: [INCIDENTS[0]!, INCIDENTS[5]!],
        kindGapDays: 2,
        perDay: 1,
      }),
    };
    const offered = deliverDay(startWorld("w-inc-kind"), kindCfg);
    const today = incidentOffers(offered.state, kindCfg.incidents!);
    expect(today.length).toBe(1);
    expect(offered.state.counters[incidentOfferKindDayKey("encounter")]).toBe(
      offered.state.time.day,
    );
    // 翌日は同じ種類が候補に挙がらない
    const next = sleepDays(offered.state, 1, kindCfg);
    expect(drawIncidents(next, kindCfg.incidents!, kindCfg.time)).toEqual([]);
  });

  it("出来事の起きない日が pityGapDays 続くと、その日は確実に起きる（3日に1回以上）", () => {
    // chance 0 + pityGapDays 2：通常は届かないが、最後の提示から2日で必ず届く
    // （cooldownDays 0 にして同じ出来事が間隔で弾かれないようにする —— 間隔は保証に優先する）
    const pityCfg: StepConfig = {
      ...cfgBase,
      incidents: incConfig({
        incidents: [INCIDENTS[0]!],
        chance: 0,
        pityGapDays: 2,
        cooldownDays: 0,
      }),
    };
    // まず一度届かせる（chance 1 の表で）。以降は pityCfg で追う
    let s = offeredState("w-inc-pity", "inc.free", {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[0]!], cooldownDays: 0, kindGapDays: 0 }),
    })!;
    const offeredDay = s.time.day;
    expect(s.counters[incidentLastOfferKey]).toBe(offeredDay);
    // 翌日は届かない（chance 0 で pity にも未達）
    s = sleepDays(s, 1, pityCfg);
    s = deliverToday(s, pityCfg);
    expect(s.counters[incidentLastOfferKey]).toBe(offeredDay);
    // 2日目：間隔が開いたので確実に届く
    s = sleepDays(s, 1, pityCfg);
    s = deliverToday(s, pityCfg);
    expect(s.counters[incidentLastOfferKey]).toBe(offeredDay + 2);
  });
});

describe("出来事への応え（incidentChoose）", () => {
  const offered = (seed = "w-inc-choose"): { state: GameState; def: IncidentDef } => {
    const oneOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[0]!], perDay: 1 }),
    };
    const s = offeredState(seed, "inc.free", oneOnly);
    expect(s).not.toBeNull();
    return { state: s!, def: INCIDENTS[0]! };
  };

  it("応えると結末が刻まれ、行動は消費しない", () => {
    const { state, def } = offered();
    const before = state.time.action;
    const res = step(state, { type: "incidentChoose", id: def.id, choice: "safe" }, cfg);
    const ev = res.events.find((e) => e.type === "incidentResolved");
    expect(ev).toBeDefined();
    expect(ev && "text" in ev && ev.text).toBe("――小さな得を拾った。");
    // 応えの刻印：その日・累計
    expect(res.state.counters[incidentDoneDayKey(def.id)]).toBe(res.state.time.day);
    expect(res.state.counters["incident.resolved"]).toBe(1);
    expect(res.state.counters["incident.resolved.inc.free"]).toBe(1);
    // 行動は消費しない（会話の一瞬）
    expect(res.state.time.action).toBe(before);
    // 効果：小さな得（+3G）
    expect(res.state.player.money).toBe(state.player.money + 3);
  });

  it("同じ日・同じ選択には同じ結末が待っている（独立した乱数列）", () => {
    const { state, def } = offered("w-inc-outcome");
    const a = step(state, { type: "incidentChoose", id: def.id, choice: "risky" }, cfg);
    const b = step(state, { type: "incidentChoose", id: def.id, choice: "risky" }, cfg);
    const ta = a.events.find((e) => e.type === "incidentResolved")!;
    const tb = b.events.find((e) => e.type === "incidentResolved")!;
    expect(ta.text).toBe(tb.text);
    // 賭けの結末は定義のどちらか（当たり +30 / 外れ -5）
    const delta = a.state.player.money - state.player.money;
    expect([30, -5]).toContain(delta);
  });

  it("届いていない出来事・応え済みの出来事には応えられない", () => {
    const { state, def } = offered();
    // 届いていない id への応えは何も起きない
    const bad = step(state, { type: "incidentChoose", id: "inc.rich", choice: "talk" }, cfg);
    expect(bad.events.some((e) => e.type === "incidentResolved")).toBe(false);
    // 存在しない選択肢も何も起きない
    const badChoice = step(state, { type: "incidentChoose", id: def.id, choice: "x" }, cfg);
    expect(badChoice.events.some((e) => e.type === "incidentResolved")).toBe(false);
    // 応えたあとは二度応えられない
    const done = step(state, { type: "incidentChoose", id: def.id, choice: "safe" }, cfg).state;
    expect(incidentChoosable(done, cfg.incidents!, def.id)).toBeUndefined();
    const again = step(done, { type: "incidentChoose", id: def.id, choice: "safe" }, cfg);
    expect(again.events.some((e) => e.type === "incidentResolved")).toBe(false);
    expect(again.state.counters["incident.resolved"]).toBe(1);
  });

  it("応えなくても世界は進む —— 翌日には流れる", () => {
    const { state, def } = offered();
    const next = sleepDays(state, 1, cfg);
    // 昨日の出来事は届いているとは見なされない（応えずに過ぎた）
    expect(incidentOffers(next, cfg.incidents!).some((o) => o.def.id === def.id)).toBe(false);
    const r = step(next, { type: "incidentChoose", id: def.id, choice: "safe" }, cfg);
    expect(r.events.some((e) => e.type === "incidentResolved")).toBe(false);
  });

  it("結果の効果が刻まれる：旗印・カウンタ・未定着経験・所持金の下限0", () => {
    // 一度きり → 旗印
    const onceOnly: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[2]!], perDay: 1 }),
    };
    const so = offeredState("w-inc-effects", "inc.once", onceOnly)!;
    const r1 = step(so, { type: "incidentChoose", id: "inc.once", choice: "take" }, onceOnly);
    expect(r1.state.flags["inc.once_taken"]).toBe(true);

    // 師匠の気まぐれ → 未定着経験（師匠が居る状態を作る）
    const mentorInc: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[4]!], perDay: 1 }),
    };
    let sm = startWorld("w-inc-mentor");
    sm = {
      ...sm,
      mentor: { id: "mentor.test", sinceDay: 0 },
      flags: { ...sm.flags, "mentor.now": true },
    };
    const mo = offeredStateFrom(sm, "inc.mentor", mentorInc, 10)!;
    expect(mo).not.toBeNull();
    const before = mo.player.skills["smithing"]!.pending;
    const r2 = step(mo, { type: "incidentChoose", id: "inc.mentor", choice: "bow" }, mentorInc);
    expect(r2.state.player.skills["smithing"]!.pending).toBeCloseTo(before + 2, 5);
    expect(r2.events.some((e) => e.type === "gainApplied" && e.skill === "smithing")).toBe(true);

    // 所持金は 0 未満にならない（損失が持ち金を上回っても）
    const offeredPoor = offered("w-inc-poor-money");
    const poor: GameState = {
      ...offeredPoor.state,
      player: { ...offeredPoor.state.player, money: 2 },
    };
    const r3 = step(poor, { type: "incidentChoose", id: "inc.free", choice: "risky" }, cfg);
    expect(r3.state.player.money).toBeGreaterThanOrEqual(0);
  });

  it("アトムの手がかりは見聞録に記される（readAtom と同じ道）", () => {
    const atomInc: IncidentDef = {
      id: "inc.atom",
      name: "手がかりの出来事",
      kind: "omen",
      text: "――古い紙片を拾った。",
      choices: [
        {
          id: "read",
          label: "読む",
          outcomes: [{ text: "――記事が見聞録に残った。", atom: "atom.test" }],
        },
      ],
    };
    const atomCfg: StepConfig = {
      ...cfgBase,
      lore: {
        atoms: [{ id: "atom.test", reveals: ["fact.test"], unlock: null }],
        connections: [],
      },
      incidents: incConfig({ incidents: [atomInc], perDay: 1 }),
    };
    const s = offeredState("w-inc-atom", "inc.atom", atomCfg)!;
    const res = step(s, { type: "incidentChoose", id: "inc.atom", choice: "read" }, atomCfg);
    expect(res.events.some((e) => e.type === "atomRead" && e.id === "atom.test")).toBe(true);
    expect(res.events.some((e) => e.type === "factLearned" && e.id === "fact.test")).toBe(true);
    expect(res.state.lore.read).toContain("atom.test");
    expect(res.state.lore.facts).toContain("fact.test");
  });
});

/** 与えた状態から届くまで進める版（師匠入りの状態など、途中の状態を持ち込む用） */
const offeredStateFrom = (
  start: GameState,
  id: string,
  stepCfg: StepConfig,
  maxDays = 10,
): GameState | null => {
  let s = start;
  for (let d = 0; d < maxDays; d++) {
    for (let i = 0; i < stepCfg.time.actionsPerDay; i++) {
      s = step(s, { type: "wait" }, stepCfg).state;
      if (incidentOffers(s, stepCfg.incidents!).some((o) => o.def.id === id)) return s;
    }
    s = step(s, { type: "rest" }, stepCfg).state;
  }
  return null;
};

describe("話し手（出来事を運ぶ者）", () => {
  it("住人の出来事は名簿から名を引く。居ない者は届かない（X-12の歳月）", () => {
    const g = startWorld("w-inc-sp");
    const def = INCIDENTS[0]!;
    const sp = incidentSpeaker(g, cfg.incidents!, def);
    expect(sp?.name).toBe("炉職人の親方");
    expect(sp?.role).toBe("鍛冶職人");
    // 街を去った者の出来事は届かない
    let gone = startWorld("w-inc-gone");
    gone = { ...gone, flags: { ...gone.flags, "npc.gone.npc.fenn": true } };
    const r = deliverToday(gone, {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[0]!] }),
    });
    expect(incidentOffers(r, { ...incConfig(), incidents: [INCIDENTS[0]!] }).length).toBe(0);
  });

  it("師匠の出来事は弟子入り中で街に居るときだけ届く", () => {
    const mentorInc: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [INCIDENTS[4]!] }),
    };
    // 師匠不在の生では届かない（require の旗も立っていない）
    const alone = deliverToday(startWorld("w-inc-nomentor"), mentorInc);
    expect(incidentOffers(alone, mentorInc.incidents!)).toEqual([]);
    // 弟子入り中なら届く
    let sm = startWorld("w-inc-mentor2");
    sm = {
      ...sm,
      mentor: { id: "mentor.test", sinceDay: 0 },
      flags: { ...sm.flags, "mentor.now": true },
    };
    const mo = offeredStateFrom(sm, "inc.mentor", mentorInc, 10);
    expect(mo).not.toBeNull();
    const sp = incidentSpeaker(mo!, mentorInc.incidents!, INCIDENTS[4]!);
    expect(sp?.name).toBe("炉職人の親方");
  });

  it("話し手の名は結末の文の {name} に入る", () => {
    const named: IncidentDef = {
      id: "inc.named",
      name: "名を呼ぶ出来事",
      kind: "encounter",
      text: "――名を呼ばれた。",
      speaker: { kind: "npc", id: "npc.fenn" },
      choices: [{ id: "go", label: "応じる", outcomes: [{ text: "――{name}は手を振った。" }] }],
    };
    const namedCfg: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ incidents: [named], perDay: 1 }),
    };
    const s = offeredState("w-inc-named", "inc.named", namedCfg)!;
    const res = step(s, { type: "incidentChoose", id: "inc.named", choice: "go" }, namedCfg);
    const ev = res.events.find((e) => e.type === "incidentResolved")!;
    expect("text" in ev && ev.text).toBe("――炉職人の親方は手を振った。");
  });
});

describe("頻度（普通に遊んで3日に1回以上）", () => {
  it("既定の確率では、行動する日には高い頻度で出来事が届く", () => {
    // 実バランス相当（chance 0.5・pityGapDays 3）で30日回し、出来事の日が 1/3 以上ある
    const realCfg: StepConfig = {
      ...cfgBase,
      incidents: incConfig({ chance: 0.5, secondChance: 0.25, pityGapDays: 3 }),
    };
    let s = startWorld("w-inc-freq");
    let offeredDays = 0;
    let dryStreak = 0;
    let maxDry = 0;
    for (let d = 0; d < 30; d++) {
      s = deliverToday(s, realCfg);
      const had = incidentOffers(s, realCfg.incidents!).length > 0;
      if (had) {
        offeredDays += 1;
        dryStreak = 0;
      } else {
        dryStreak += 1;
        maxDry = Math.max(maxDry, dryStreak);
      }
      s = step(s, { type: "rest" }, realCfg).state;
    }
    expect(offeredDays).toBeGreaterThanOrEqual(10);
    expect(maxDry).toBeLessThanOrEqual(3);
  });
});
