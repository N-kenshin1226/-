import { findContradictions } from "@trace/core";
import { describe, expect, it } from "vitest";
import { pinnacles } from "./pinnacles.js";
import { pinnaclesFileSchema } from "./pinnacles.schema.js";
import { titles } from "./titles.js";

describe("pinnacles.json（T-41 頂点ルート）", () => {
  it("剣聖・伝説の職人の2ルートがあり、各段は id/name/rank/notice/condition を持つ", () => {
    expect(pinnacles.pinnacles.map((r) => r.id)).toEqual(["sword_saint", "legendary_artisan"]);
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
