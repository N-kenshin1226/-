import {
  checkPinnacles,
  evaluate,
  findContradictions,
  isRouteVisible,
  newGame,
  nextStage,
  pinnacleFlag,
  pinnacleReached,
  visiblePinnacles,
  type GameState,
  type TimeConfig,
  type Work,
} from "@trace/core";
import { describe, expect, it } from "vitest";
import { atoms } from "./lore.js";
import { pinnacles } from "./pinnacles.js";
import { pinnaclesFileSchema } from "./pinnacles.schema.js";
import { titles } from "./titles.js";

describe("pinnacles.json（T-41 頂点ルート）", () => {
  it("英雄・剣聖・伝説の職人・大賢者・商王・領主の6ルートがあり、各段は id/name/rank/notice/condition を持つ", () => {
    expect(pinnacles.pinnacles.map((r) => r.id)).toEqual([
      "hero",
      "sword_saint",
      "legendary_artisan",
      "great_sage",
      "merchant_king",
      "lord",
    ]);
    for (const r of pinnacles.pinnacles) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.desc.length).toBeGreaterThan(0);
      expect(r.stages.length).toBeGreaterThanOrEqual(2);
      for (const s of r.stages) {
        expect(s.id.length).toBeGreaterThan(0);
        expect(s.name.length).toBeGreaterThan(0);
        expect(["S", "A", "B"]).toContain(s.rank);
      }
    }
  });

  it("頂点（最終段）は S ランク、中間段は B/A に留まる", () => {
    for (const r of pinnacles.pinnacles) {
      expect(r.stages[r.stages.length - 1]!.rank).toBe("S");
      for (const s of r.stages.slice(0, -1)) {
        expect(s.rank).not.toBe("S");
      }
    }
  });

  it("すべての段の通知文がシステムメッセージ書式（――・《》）", () => {
    for (const r of pinnacles.pinnacles) {
      for (const s of r.stages) {
        expect(s.notice).toMatch(/^――.+《.+》.+。$/);
      }
    }
  });

  it("頂点称号が titles.json にあり、その条件は最終段フラグと一致する", () => {
    const titleMap = new Map(titles.titles.map((t) => [t.id, t]));
    for (const r of pinnacles.pinnacles) {
      const def = titleMap.get(r.title);
      expect(def, `${r.id} の頂点称号 ${r.title}`).toBeDefined();
      expect(def!.rank).toBe("S");
      const last = r.stages[r.stages.length - 1]!;
      expect(def!.condition).toEqual({ flag: `pinnacle.${r.id}.${last.id}` });
    }
  });

  it("段の条件は矛盾を含まない（到達可能）", () => {
    for (const r of pinnacles.pinnacles) {
      for (const s of r.stages) {
        expect(findContradictions([{ id: `${r.id}.${s.id}`, condition: s.condition }])).toEqual([]);
      }
    }
  });

  it("各ルートは4段で、通知ランクは B/A/A/S", () => {
    for (const r of pinnacles.pinnacles) {
      expect(r.stages.map((s) => s.rank)).toEqual(["B", "A", "A", "S"]);
    }
  });

  it("隠しルート（X-9）：商王・領主は発見フラグまで一覧に出ず、段も評価されない", () => {
    const time: TimeConfig = {
      actionsPerDay: 5,
      timeOfDay: ["morning", "morning", "noon", "evening", "night"],
      daysPerWeek: 7,
      daysPerSeason: 28,
      seasonsPerYear: 4,
      moonCycleDays: 28,
      moonPhaseWindowDays: 1,
      startAge: 15,
    };
    const hidden = pinnacles.pinnacles.filter((r) => r.hidden !== undefined);
    // 隠すのは商王・領主の2本だけ（X-9：最初に見せるのは既存ルート＋英雄だけ）
    expect(hidden.map((r) => r.id).sort()).toEqual(["lord", "merchant_king"]);
    const mk = pinnacles.pinnacles.find((r) => r.id === "merchant_king")!;

    let s = newGame("seed", "富商", {
      skillIds: ["smithing"],
      initialPotential: 100,
      initialStatValue: 10,
    });
    // 未発見：一覧にも評価にも出ない（条件を全部満たしても段は立たない）
    expect(visiblePinnacles(pinnacles.pinnacles, s.flags).map((r) => r.id)).toEqual([
      "hero",
      "sword_saint",
      "legendary_artisan",
      "great_sage",
    ]);
    expect(isRouteVisible(mk, s.flags)).toBe(false);
    s = {
      ...s,
      counters: { "money.earned": 9999, "action.work": 99, "society.offer.citizen": 1 },
      player: { ...s.player, money: 9999 },
      ledger: [0, 1, 2, 3, 4].map((i) => ({
        id: `w${i}`,
        kind: "smithing",
        maker: "富商",
        quality: 50,
        tier: 1,
        flags: [],
        day: 0,
        worldSeed: "seed",
        marketValue: 100,
      })),
    };
    expect(evaluate(mk.stages[0]!.condition, s, time)).toBe(true);
    expect(checkPinnacles(s, pinnacles.pinnacles, time).reached).toEqual([]);

    // 発見（噂を読んでフラグが立つ）と一覧に出て、段の評価も始まる
    // （領主はまだ未発見なので 5 件。両方読めば 6 件）
    s = { ...s, flags: { ...s.flags, "found.merchant_king": true } };
    expect(isRouteVisible(mk, s.flags)).toBe(true);
    expect(visiblePinnacles(pinnacles.pinnacles, s.flags)).toHaveLength(5);
    s = { ...s, flags: { ...s.flags, "found.lord": true } };
    expect(visiblePinnacles(pinnacles.pinnacles, s.flags)).toHaveLength(6);
    const r = checkPinnacles(s, pinnacles.pinnacles, time);
    expect(r.reached.map((x) => `${x.route.id}.${x.stage.id}`)).toContain(
      "merchant_king.first_gain",
    );
  });

  it("隠しルートの発見フラグは、見聞録の噂アトムの unlock.flag と一致する", () => {
    const atomFlags = new Set(atoms.map((a) => a.unlock?.flag).filter((f) => f !== undefined));
    for (const r of pinnacles.pinnacles) {
      if (r.hidden === undefined) continue;
      expect(atomFlags, `${r.id} の発見フラグ ${r.hidden.flag}`).toContain(r.hidden.flag);
    }
  });

  it("大賢者ルートは読了数・知識フラグ・仕事の条件で4段を順に越えて頂点に至る", () => {
    const route = pinnacles.pinnacles.find((r) => r.id === "great_sage")!;
    const time: TimeConfig = {
      actionsPerDay: 5,
      timeOfDay: ["morning", "morning", "noon", "evening", "night"],
      daysPerWeek: 7,
      daysPerSeason: 28,
      seasonsPerYear: 4,
      moonCycleDays: 28,
      moonPhaseWindowDays: 1,
      startAge: 15,
    };
    const mkWork = (w: Partial<Work>): Work => ({
      id: "w1",
      kind: "appraisal",
      maker: "賢者",
      quality: 60,
      tier: 3,
      flags: [],
      day: 0,
      worldSeed: "seed",
      marketValue: 100,
      ...w,
    });
    const setSkill = (st: GameState, id: string, v: number): GameState => ({
      ...st,
      player: {
        ...st.player,
        skills: { ...st.player.skills, [id]: { ...st.player.skills[id]!, value: v } },
      },
    });
    let s = newGame("seed", "賢者", {
      skillIds: ["observation", "appraisal", "eloquence"],
      initialPotential: 100,
      initialStatValue: 10,
    });
    expect(nextStage(s, route)?.id).toBe("voracity");

    // 段1 読書の虫：読了4回＋観察20
    s = setSkill(s, "observation", 20);
    s = { ...s, counters: { "action.read": 4 } };
    let r = checkPinnacles(s, [route], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["voracity"]);

    // 段2 鑑定の眼：鑑定45＋鑑定の仕事でティア3＋読了累計7
    s = setSkill(r.state, "appraisal", 45);
    s = {
      ...s,
      counters: { ...s.counters, "action.read": 7 },
      ledger: [mkWork({})],
    };
    r = checkPinnacles(s, [route], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["discerning"]);

    // 段3 禁書の探索：知識フラグ＋鑑定65＋弁舌50（旗が無いと進まない）
    s = setSkill(setSkill(r.state, "appraisal", 65), "eloquence", 50);
    expect(checkPinnacles(s, [route], time).reached).toEqual([]);
    s = { ...s, flags: { ...s.flags, "found.taboo_codex": true } };
    r = checkPinnacles(s, [route], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["forbidden"]);

    // 段4 世界の真理：禁書の知識フラグ＋鑑定90＋観察75
    s = setSkill(setSkill(r.state, "appraisal", 90), "observation", 75);
    expect(checkPinnacles(s, [route], time).reached).toEqual([]);
    s = { ...s, flags: { ...s.flags, "knows.world_truth": true } };
    r = checkPinnacles(s, [route], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["apex"]);
    expect(r.state.flags[pinnacleFlag("great_sage", "apex")]).toBe(true);
    expect(pinnacleReached(r.state, route)).toBe(true);

    // 頂点称号（title.great_sage）の条件はそのまま最終段フラグを見る
    const title = titles.titles.find((t) => t.id === route.title)!;
    expect(evaluate(title.condition, r.state, time)).toBe(true);
  });

  it("スキーマ違反は弾かれる（最終段がSでない・段の重複・書式違反）", () => {
    const base = {
      id: "r",
      name: "ルート",
      desc: "説明",
      title: "title.x",
      stages: [
        {
          id: "a",
          name: "段",
          rank: "B",
          notice: "――段《段》に至りました。",
          condition: { flag: "x" },
        },
        {
          id: "b",
          name: "段2",
          rank: "S",
          notice: "――段《段2》に至りました。",
          condition: { flag: "y" },
        },
      ],
    };
    expect(pinnaclesFileSchema.safeParse({ pinnacles: [base] }).success).toBe(true);
    // 最終段が S でない
    const noS = {
      ...base,
      stages: [base.stages[0]!, { ...base.stages[1]!, rank: "A" }],
    };
    expect(pinnaclesFileSchema.safeParse({ pinnacles: [noS] }).success).toBe(false);
    // 段 id の重複
    const dup = {
      ...base,
      stages: [base.stages[0]!, { ...base.stages[1]!, id: "a" }],
    };
    expect(pinnaclesFileSchema.safeParse({ pinnacles: [dup] }).success).toBe(false);
    // 通知文の書式違反（――・《》 が無い）
    const badMsg = {
      ...base,
      stages: [base.stages[0]!, { ...base.stages[1]!, notice: "段に至りました。" }],
    };
    expect(pinnaclesFileSchema.safeParse({ pinnacles: [badMsg] }).success).toBe(false);
  });
});
