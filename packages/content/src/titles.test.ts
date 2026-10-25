import { findContradictions, type Cond } from "@trace/core";
import { describe, expect, it } from "vitest";
import { titles } from "./titles.js";
import { titlesFileSchema } from "./titles.schema.js";

describe("titles.json", () => {
  it("スキーマを通り、サンプル5件", () => {
    expect(titles.titles).toHaveLength(5);
    const ranks = titles.titles.map((t) => t.rank);
    expect(ranks.filter((r) => r === "B")).toHaveLength(4);
    expect(ranks.filter((r) => r === "A")).toHaveLength(1);
    expect(titles.titles.every((t) => !t.hidden)).toBe(true);
  });

  it("すべての称号の message がシステムメッセージ書式（――・《》）", () => {
    for (const t of titles.titles) {
      expect(t.message).toMatch(/^――.+《.+》.+。$/);
    }
  });

  it("到達可能性：矛盾した条件を含まない", () => {
    expect(findContradictions(titles.titles)).toEqual([]);
  });

  it("矛盾した条件を含むデータは検査で失敗する", () => {
    const bad = {
      id: "title.impossible",
      rank: "B" as const,
      condition: {
        and: [
          { counter: "x", gte: 10 },
          { counter: "x", lte: 5 },
        ],
      } satisfies Cond,
    };
    expect(findContradictions([bad])).toEqual(["title.impossible"]);
  });

  it("書式違反の message はスキーマで弾かれる", () => {
    const bad = {
      titles: [
        {
          id: "title.bad_msg",
          name: "悪い文",
          rank: "B",
          hidden: false,
          condition: { flag: "x" },
          effect: {},
          message: "称号を獲得しました。", // ―― と 《》 が無い
        },
      ],
    };
    expect(titlesFileSchema.safeParse(bad).success).toBe(false);
  });
});
