import { enemies, pinnacles, skills } from "@trace/content";
import { pinnacleReached } from "@trace/core";
import { describe, expect, it } from "vitest";
import { makePinnacleBot } from "./bots.js";
import { simClock, stepConfig } from "./config.js";
import { runBot } from "./runner.js";
import { thresholds } from "./thresholds.js";

const skillIds = skills.skills.map((s) => s.id);

describe("頂点ルートの専用ボット（X-4 大賢者）", () => {
  it("大賢者ルート：読む系の条件鎖（読了数・知識フラグ）を含めて全段に至る", () => {
    const route = pinnacles.pinnacles.find((r) => r.id === "great_sage")!;
    const bot = makePinnacleBot(route, enemies.enemies);
    const r = runBot(
      bot,
      thresholds.growth.titleReachabilityDays,
      "test:great_sage",
      stepConfig(),
      simClock(),
      skillIds,
    );
    for (const s of route.stages) {
      expect(
        r.firsts.some((f) => f.key === `pinnacle:${route.id}.${s.id}`),
        `段 ${s.id}（${s.name}）`,
      ).toBe(true);
    }
    expect(pinnacleReached(r.final, route)).toBe(true);
    expect(r.final.flags["pinnacle.great_sage.apex"]).toBe(true);
    // 頂点称号は既存の称号判定が最終段フラグを拾って授ける
    expect(r.final.titles).toContain("title.great_sage");
    // 知識フラグの出所：禁書の読了と見聞録のアトム
    expect(r.final.books.read.map((b) => b.id)).toContain("book.taboo_codex");
    expect(r.final.lore.read).toContain("rumor.taboo_codex");
  });
});
