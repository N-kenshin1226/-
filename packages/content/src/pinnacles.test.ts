import {
  checkPinnacles,
  evaluate,
  findContradictions,
  newGame,
  nextStage,
  pinnacleFlag,
  pinnacleReached,
  type GameState,
  type TimeConfig,
  type Work,
} from "@trace/core";
import { describe, expect, it } from "vitest";
import { pinnacles } from "./pinnacles.js";
import { pinnaclesFileSchema } from "./pinnacles.schema.js";
import { titles } from "./titles.js";

describe("pinnacles.json（T-41 頂点ルート）", () => {
  it("剣聖・伝説の職人・大賢者の3ルートがあり、各段は id/name/rank/notice/condition を持つ", () => {
    expect(pinnacles.pinnacles.map((r) => r.id)).toEqual([
      "sword_saint",
      "legendary_artisan",
      "great_sage",
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
