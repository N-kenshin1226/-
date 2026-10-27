import { describe, expect, it } from "vitest";
import type { CrisisConfig } from "../crisis/index.js";
import { apprentice, canApprentice, currentMentor } from "../mentors/index.js";
import { rankOf } from "../notify/index.js";
import { drawRivalCast, rivalsOf, type RivalNamePool, type RivalsConfig } from "../rivals/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import { step, type StepConfig } from "../step.js";
import {
  npcGoneReason,
  npcLifeDoneKey,
  npcLifeEvents,
  npcLifeGoneFlag,
  npcLifeLog,
  npcLifeMark,
  npcLifeMarkFlag,
  npcLifeRecent,
  npcLifeToday,
  type NpcLifeConfig,
  type NpcLifeEventDef,
} from "./index.js";

/**
 * NPCの歳月（X-12、docs/07 §3）：平時の人物の物語（引退・結婚・死去・栄転・旅立ち）。
 * 発火は条件DSLで決定的、刻印は counters/flags と世界の記録（crisis.log）に残り、
 * 二度は発火しない（冪等）。退場した人物は師匠・街の声・ランキングから外れる
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const base = (): StepConfig => ({
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
    base: { train: 1.0, work: 1.0 },
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
    hitBase: 0.86,
    hitPerSwordplay: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerSwordplay: 0.002,
    critFactor: 1.8,
    enemyCritBase: 0.05,
    enemyCritFactor: 1.6,
    evadeBase: 0.06,
    evadePerEvasion: 0.004,
    evadePerAgilityDiff: 0.008,
    evadeMax: 0.7,
    readEvadeBonus: 0.5,
    guardTelegraphFactor: 0.15,
    counterFactor: 2.4,
    counterFactorRead: 2.8,
    openingTicks: 16,
    staggerTicks: 11,
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
});

/** 世界の記録（crisis.log）を持つ最小の危機設定（進行しないが帳面だけはある世界） */
const crisisCfg = (): CrisisConfig => ({
  types: [{ id: "c.quiet", name: "静かな脅威", weight: 1, factions: [], stages: [], finales: [] }],
  strongFields: 1,
  weakFieldFactor: 0.5,
});

const mkState = (seed = "life", crisis?: CrisisConfig): GameState =>
  newGame(seed, "テスト", {
    skillIds: SKILL_IDS,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
    ...(crisis !== undefined ? { crisis } : {}),
  });

const sleepDays = (state: GameState, cfg: StepConfig, days: number): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = step(s, { type: "sleep" }, cfg).state;
  return s;
};

const lifeWith = (ev: NpcLifeEventDef): NpcLifeConfig => ({
  npcs: [
    {
      npcId: "npc.test",
      name: "テスト翁",
      events: [ev],
    },
  ],
});

describe("npcLifeEvents：発火と冪等（X-12）", () => {
  it("暦条件を満たした日に発火し、刻印と世界の記録が残る", () => {
    const cfg: StepConfig = {
      ...base(),
      crisis: crisisCfg(),
      npcLife: lifeWith({
        at: { time: { day: { eq: 2 } } },
        kind: "retire",
        text: "{name}が引退した。",
      }),
    };
    let s = mkState("fire", cfg.crisis);
    const r1 = step(s, { type: "sleep" }, cfg); // → day 1：まだ発火しない
    expect(r1.events.filter((e) => e.type === "npcEvent")).toHaveLength(0);
    s = r1.state;
    const r2 = step(s, { type: "sleep" }, cfg); // → day 2：発火する
    const ev = r2.events.find((e) => e.type === "npcEvent");
    expect(ev).toBeDefined();
    expect(ev?.type === "npcEvent" && ev.kind).toBe("retire");
    expect(ev?.type === "npcEvent" && ev.name).toBe("テスト翁");
    expect(ev?.type === "npcEvent" && ev.text).toBe("テスト翁が引退した。");
    expect(ev?.type === "npcEvent" && ev.day).toBe(2);
    s = r2.state;
    // 刻印：done カウンタ・人生の印・退場の印
    expect(s.counters[npcLifeDoneKey("npc.test", 0)]).toBe(2);
    expect(s.flags[npcLifeMarkFlag("npc.test", "retire")]).toBe(true);
    expect(s.flags[npcLifeGoneFlag("npc.test")]).toBe(true);
    // 世界の記録（年代記の素材）に1行刻まれる
    expect(
      s.crisis?.log.some((l) => l.kind === "npc.retire" && l.ref === "npc.test" && l.day === 2),
    ).toBe(true);
    expect(npcLifeLog(s).some((l) => l.ref === "npc.test")).toBe(true);
    // その人はもう街に居ない
    expect(npcGoneReason(s, "npc.test")).toBe("retire");
    // 通知ランクは B（淡々とした知らせ）
    expect(rankOf(ev!, [])).toBe("B");
    // 発火の累計は購読者が数える（条件DSLから読める）
    expect(s.counters["npc.events"]).toBe(1);
    expect(s.counters["npc.events.retire"]).toBe(1);
  });

  it("条件を満たさない日は発火しない", () => {
    const cfg: StepConfig = {
      ...base(),
      npcLife: lifeWith({
        at: { time: { day: { eq: 9 } } },
        kind: "die",
        text: "{name}が亡くなった。",
      }),
    };
    const s = sleepDays(mkState(), cfg, 3);
    expect(s.counters[npcLifeDoneKey("npc.test", 0)]).toBeUndefined();
    expect(npcGoneReason(s, "npc.test")).toBeNull();
  });

  it("二度は発火しない（done 刻印による冪等）。退場した人物の後続イベントも起きない", () => {
    const cfg: StepConfig = {
      ...base(),
      npcLife: {
        npcs: [
          {
            npcId: "npc.test",
            name: "テスト翁",
            events: [
              { at: { time: { day: { gte: 1 } } }, kind: "depart", text: "{name}が旅立った。" },
              { at: { time: { day: { gte: 1 } } }, kind: "marry", text: "{name}の祝言" },
            ],
          },
        ],
      },
    };
    let s = mkState();
    const fired: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = step(s, { type: "sleep" }, cfg);
      fired.push(
        ...r.events.flatMap((e) => (e.type === "npcEvent" ? [`${e.npcId}:${e.day}`] : [])),
      );
      s = r.state;
    }
    // depart だけが day 1 で一度発火する（その人はもう街に居ないので marry は起きない）
    expect(fired).toEqual(["npc.test:1"]);
    expect(s.flags[npcLifeMarkFlag("npc.test", "marry")]).toBeUndefined();
    expect(npcGoneReason(s, "npc.test")).toBe("depart");
  });

  it("退場しない出来事（結婚・栄転）はその人を街に残し、setFlags が立つ", () => {
    const cfg: StepConfig = {
      ...base(),
      npcLife: {
        npcs: [
          {
            npcId: "npc.test",
            name: "テスト翁",
            events: [
              {
                at: { time: { day: { eq: 1 } } },
                kind: "promote",
                text: "{name}が抜擢された。",
                setFlags: ["world.test_director"],
              },
            ],
          },
        ],
      },
    };
    const s = sleepDays(mkState(), cfg, 2);
    expect(s.flags[npcLifeMarkFlag("npc.test", "promote")]).toBe(true);
    expect(s.flags["world.test_director"]).toBe(true);
    // promote は退場ではない —— その人は街に居る
    expect(npcGoneReason(s, "npc.test")).toBeNull();
    expect(npcLifeMark(s, "npc.test", "promote")).toBe(true);
    // 危機の無い世界では記録帳は無いが、刻印（flags/counters）は残る
    expect(s.crisis).toBeNull();
    expect(npcLifeLog(s)).toHaveLength(0);
  });

  it("{name} は name コールバックで解決される（ライバルの名は世界シード由来）", () => {
    const life: NpcLifeConfig = {
      npcs: [
        {
          npcId: "rival.0",
          events: [{ at: { time: { day: { eq: 1 } } }, kind: "retire", text: "{name}の退場" }],
        },
      ],
      name: (_s, id) => (id === "rival.0" ? "ライバル一郎" : undefined),
    };
    const res = npcLifeEvents({ ...mkState(), time: { day: 1, action: 0 } }, life, base().time);
    expect(res.fired[0]?.name).toBe("ライバル一郎");
    expect(res.fired[0]?.text).toBe("ライバル一郎の退場");
  });
});

describe("可用性：退場した人物は使えなくなる（X-12）", () => {
  const mentorsCfg = {
    mentors: [{ id: "mentor.test", npc: "npc.test", skill: "swordplay", fee: 0 }],
    potentialMax: 100,
  };

  it("師匠が引退すると弟子入りは解消され、以後の入門・稽古はできない", () => {
    const cfg: StepConfig = {
      ...base(),
      mentors: mentorsCfg,
      npcLife: {
        ...lifeWith({
          at: { time: { day: { eq: 2 } } },
          kind: "retire",
          text: "{name}が引退した。",
        }),
        mentors: mentorsCfg.mentors,
      },
    };
    let s = mkState();
    // 引退前：弟子入りできる
    expect(canApprentice(s, "mentor.test", cfg.mentors, cfg.time)).toBe(true);
    const a = apprentice(s, "mentor.test", cfg.mentors, cfg.time);
    expect(a.ok).toBe(true);
    s = a.state;
    expect(currentMentor(s, cfg.mentors)?.id).toBe("mentor.test");
    // day 2 の朝に引退する
    s = sleepDays(s, cfg, 2);
    // 弟子入りは解消された（街を去った師に師事し続けることはできない）
    expect(s.mentor).toBeNull();
    expect(npcGoneReason(s, "npc.test")).toBe("retire");
    // 以後の入門はできない
    expect(canApprentice(s, "mentor.test", cfg.mentors, cfg.time)).toBe(false);
    expect(apprentice(s, "mentor.test", cfg.mentors, cfg.time).ok).toBe(false);
    expect(currentMentor(s, cfg.mentors)).toBeNull();
  });

  it("引退したライバルはランキングから外れる（顔ぶれ自体は変わらない）", () => {
    const pool: RivalNamePool = {
      names: ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク"],
      epithets: ["剣", "弓", "杖"],
    };
    const rivals: RivalsConfig = {
      size: 3,
      scoreMin: 50,
      scoreMax: 50,
      growthPerDay: 0,
      playerQualityWeight: 1,
      playerTitleWeight: 1,
      playerKillWeight: 1,
      playerAbyssWeight: 1,
    };
    const cfg: StepConfig = {
      ...base(),
      npcLife: {
        npcs: [
          {
            npcId: "rival.1",
            events: [{ at: { time: { day: { eq: 1 } } }, kind: "retire", text: "{name}の引退" }],
          },
        ],
      },
    };
    const seed = "rivals-life";
    const before = rivalsOf(mkState(seed), pool, rivals).entries.filter((e) => !e.isPlayer);
    expect(before).toHaveLength(3);
    const s = sleepDays(mkState(seed), cfg, 2);
    const rest = rivalsOf(s, pool, rivals).entries.filter((e) => !e.isPlayer);
    // 引退した1人（抽選順 rival.1）だけが外れる —— 名の解決は変わらない
    const gone = drawRivalCast(seed, pool, rivals)[1]!.name;
    expect(rest).toHaveLength(2);
    expect(rest.map((e) => e.name)).toEqual(before.map((e) => e.name).filter((n) => n !== gone));
    // ランキングから外れても記録の参照（rival.1）は変わらない
    expect(npcGoneReason(s, "rival.1")).toBe("retire");
  });
});

describe("記録と素材：新聞・噂・年代記（X-12）", () => {
  it("npcLifeToday / npcLifeRecent が発火日と噂の期間を返す", () => {
    const life: NpcLifeConfig = lifeWith({
      at: { time: { day: { eq: 2 } } },
      kind: "marry",
      text: "{name}が祝言を挙げた。",
    });
    const cfg: StepConfig = { ...base(), npcLife: life };
    let s = mkState();
    expect(npcLifeToday(s, life)).toHaveLength(0);
    s = sleepDays(s, cfg, 2);
    const today = npcLifeToday(s, life);
    expect(today).toHaveLength(1);
    expect(today[0]!.text).toBe("テスト翁が祝言を挙げた。");
    expect(today[0]!.kind).toBe("marry");
    // 噂の期間（npcRumorDays 14日）のあいだは recent に残る
    s = sleepDays(s, cfg, 10);
    expect(npcLifeToday(s, life)).toHaveLength(0);
    expect(npcLifeRecent(s, life, 14).map((e) => e.day)).toEqual([2]);
    s = sleepDays(s, cfg, 10);
    expect(npcLifeRecent(s, life, 14)).toHaveLength(0); // 噂はやがて収まる（記録には残る）
  });

  it("世界の記録は世代をまたぐ（前世で起きた退場は次の代でも戻らない）", () => {
    const crisis = crisisCfg();
    const life: NpcLifeConfig = lifeWith({
      at: { time: { day: { eq: 1 } } },
      kind: "depart",
      text: "{name}が旅立った。",
    });
    const cfg: StepConfig = { ...base(), crisis, npcLife: life };
    const s = sleepDays(mkState("gen", crisis), cfg, 2);
    // 次の代：世界の記録だけを引き継いだ新しい生（heir の carryoverCrisis と同じ形）
    const s2 = mkState("gen", crisis);
    s2.crisis = s.crisis;
    // 前世で旅立った人はこの代でも街に居ない
    expect(npcGoneReason(s2, "npc.test")).toBe("depart");
    expect(npcLifeMark(s2, "npc.test", "depart")).toBe(true);
    // 同じ出来事は再発火しない（世界の記録が刻まれている = 冪等のもう一層）
    const res = npcLifeEvents({ ...s2, time: { day: 5, action: 0 } }, life, cfg.time);
    expect(res.fired).toHaveLength(0);
  });
});
