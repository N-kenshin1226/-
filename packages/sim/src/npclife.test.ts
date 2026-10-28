import { balance, mentors, rivals, sampleCrises, skills } from "@trace/content";
import {
  apprentice,
  canApprentice,
  drawRivalCast,
  newGame,
  npcGoneReason,
  npcLifeLog,
  rivalsOf,
  step,
  type GameState,
} from "@trace/core";
import { describe, expect, it } from "vitest";
import { stepConfig } from "./config.js";

/**
 * NPCの歳月（X-12、docs/07 §3）の e2e 検証。
 * 実コンテンツ（npc_lifecycle.json／mentors.json／voices.json／balance.json）を
 * そのまま通す stepConfig() で、CLI・Web・シムが共有する step(state, command, cfg)
 * の道上で「師匠が引退する → 以後の弟子入りは不可能」が成立することを確かめる
 */

// 危機の型は公開サンプルに固定する（hidden の本番の型に依存しない。
// このテストが見るのは歳月の退場→入門可否の規則で、危機の中身ではない）
const baseCfg = stepConfig();
const cfg = {
  ...baseCfg,
  crisis: baseCfg.crisis === undefined ? undefined : { ...baseCfg.crisis, types: sampleCrises },
};
const skillIds = skills.skills.map((s) => s.id);
const SEED = "x12-sim";

/** ガロ（mentor.garo → npc.garo）の引退日：year2・season0・dayOfSeason0（0始まり暦で day 224） */
const GARO_RETIRE_DAY = 2 * balance.time.daysPerSeason * balance.time.seasonsPerYear;

const mkLife = (carryoverCrisis?: GameState["crisis"]): GameState => {
  const s = newGame(SEED, "試し", {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
    ...(carryoverCrisis !== undefined ? { carryoverCrisis } : {}),
  });
  // 弟子入りの条件（剣術10・採掘10）を満たす腕を持たせる —— このテストの関心は
  // 歳月の退場→入門可否であり、成長の式自体は growth 系のテストが担う
  return {
    ...s,
    player: {
      ...s.player,
      skills: {
        ...s.player.skills,
        swordplay: { ...s.player.skills["swordplay"]!, value: 10 },
        mining: { ...s.player.skills["mining"]!, value: 10 },
      },
    },
  };
};

/** 指定日まで眠り続け、その間に起きた npcEvent を集める */
const sleepUntil = (
  state: GameState,
  day: number,
): {
  state: GameState;
  npcEvents: { npcId: string; kind: string; name: string; day: number }[];
} => {
  const npcEvents: { npcId: string; kind: string; name: string; day: number }[] = [];
  let s = state;
  while (s.time.day < day) {
    const r = step(s, { type: "sleep" }, cfg);
    for (const e of r.events) {
      if (e.type === "npcEvent") {
        npcEvents.push({ npcId: e.npcId, kind: e.kind, name: e.name, day: e.day });
      }
    }
    s = r.state;
  }
  return { state: s, npcEvents };
};

describe("NPCの歳月（X-12）e2e：実コンテンツを通す step の道", () => {
  it("師匠ガロが引退する → 弟子入りは解消され、以後の入門は不可能になる", () => {
    let s = mkLife();
    // 引退前：条件を満たせばガロに弟子入りできる
    expect(canApprentice(s, "mentor.garo", cfg.mentors, cfg.time)).toBe(true);
    const a = apprentice(s, "mentor.garo", cfg.mentors, cfg.time);
    expect(a.ok).toBe(true);
    s = a.state;

    // 引退の朝（year2 season0 day0 = day 224）まで世界を進める
    const r = sleepUntil(s, GARO_RETIRE_DAY);
    s = r.state;
    expect(s.time.day).toBe(GARO_RETIRE_DAY);

    // 歳月の出来事として「ガロの引退」が届いた（記事文は解決済み）
    const garo = r.npcEvents.find((e) => e.npcId === "npc.garo");
    expect(garo?.kind).toBe("retire");
    expect(garo?.name).toBe("ガロ");
    expect(garo?.day).toBe(GARO_RETIRE_DAY);

    // 弟子入り中の師弟は解消され、以後は入門・師事ともに不可能
    expect(s.mentor).toBeNull();
    expect(npcGoneReason(s, "npc.garo")).toBe("retire");
    expect(canApprentice(s, "mentor.garo", cfg.mentors, cfg.time)).toBe(false);
    expect(apprentice(s, "mentor.garo", cfg.mentors, cfg.time).ok).toBe(false);

    // 結末は世界の記録（年代記の帳面）に残る
    expect(npcLifeLog(s).some((l) => l.kind === "npc.retire" && l.ref === "npc.garo")).toBe(true);
  });

  it("ライバルの引退：ランキングから外れ、出来事は世界シード由来の名で記録される", () => {
    // rival.1 の引退（year1 season2 dayOfSeason14 = day 182）まで進める
    const r = sleepUntil(mkLife(), 182);
    const s = r.state;
    const fired = r.npcEvents.find((e) => e.npcId === "rival.1");
    expect(fired?.kind).toBe("retire");
    // 名は世界シードのライバル抽選（rival.<index> 固定）から解決される
    const pool = { names: rivals.names, epithets: rivals.epithets };
    const cast = drawRivalCast(SEED, pool, balance.rivals);
    expect(fired!.name).toBe(cast[1]!.name);
    // ランキングからその1人だけが外れる（size → size-1、顔ぶれの解決は変わらない）
    const entries = rivalsOf(s, pool, balance.rivals).entries.filter((e) => !e.isPlayer);
    expect(entries).toHaveLength(balance.rivals.size - 1);
    expect(entries.some((e) => e.name === fired!.name)).toBe(false);
  });

  it("決定性：同じ世界シードなら、同じ日に同じ出来事が起きる", () => {
    const a = sleepUntil(mkLife(), GARO_RETIRE_DAY).npcEvents;
    const b = sleepUntil(mkLife(), GARO_RETIRE_DAY).npcEvents;
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it("世代をまたぐ：引退した師匠は次の生でも戻らない（世界の記録の引き継ぎ）", () => {
    // 1代目をガロの引退まで進める
    const s1 = sleepUntil(mkLife(), GARO_RETIRE_DAY).state;
    // 次の代：実際の継承経路と同じく carryoverCrisis で世界の記録だけを引く
    const s2 = mkLife(s1.crisis);
    expect(s2.crisis?.log.some((l) => l.kind === "npc.retire" && l.ref === "npc.garo")).toBe(true);
    expect(npcGoneReason(s2, "npc.garo")).toBe("retire");
    expect(canApprentice(s2, "mentor.garo", cfg.mentors, cfg.time)).toBe(false);
    // 引き継いだ記録のある出来事は再発火しない（冪等の2層目）
    const r = sleepUntil(s2, GARO_RETIRE_DAY + 5);
    expect(r.npcEvents.some((e) => e.npcId === "npc.garo")).toBe(false);
  });

  it("危機で先に離散した人物の歳月の出来事は起きない（世界の物語が優先される）", () => {
    // この世界シードではサドが歳月の祝言（day 119）より先に危機で離散する。
    // 門番は戻らない —— 起きなかった結婚は記録にも刻まれない
    const s = sleepUntil(mkLife(), 200).state;
    expect(npcGoneReason(s, "npc.sado")).toBe("leave");
    expect(npcLifeLog(s).some((l) => l.kind === "npc.marry" && l.ref === "npc.sado")).toBe(false);
  });

  it("師匠の人物紐付け：退場の印は mentors.json の npc で対応づく", () => {
    // mentors.json の全師匠に npc が対応づいている（歳月・危機の影響を受ける）
    for (const m of mentors.mentors) {
      expect(m.npc).toMatch(/^npc\./);
    }
    // 引退前：街に居る師匠には入門できる（フェン：採掘10の条件を満たしている）
    expect(canApprentice(mkLife(), "mentor.fenn", cfg.mentors, cfg.time)).toBe(true);
    const s = sleepUntil(mkLife(), GARO_RETIRE_DAY).state;
    // ガロ以外の師匠はまだ街に居る（歳月は定義された人物だけを動かす。
    // ※長期間使わない技能は rust で衰える別系統の話 —— 歳月の判定とは無関係）
    expect(npcGoneReason(s, "npc.fenn")).toBeNull();
    expect(npcGoneReason(s, "npc.edel")).toBeNull();
    expect(npcGoneReason(s, "npc.nola")).toBeNull();
    expect(npcGoneReason(s, "npc.cum")).toBeNull();
  });
});
