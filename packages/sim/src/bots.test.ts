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

describe("頂点ルートの専用ボット（X-9 伏せられた頂点ルート）", () => {
  // 隠しルートは発見フラグ（噂アトムの unlock.flag）が立つまで段が評価されない。
  // ボットは planReading 経由で噂を読んでから段の条件をこなす
  for (const routeId of ["merchant_king", "lord"] as const) {
    it(`${routeId}ルート：噂を読んで開き、全段に至る`, () => {
      const route = pinnacles.pinnacles.find((r) => r.id === routeId)!;
      expect(route.hidden).toBeDefined();
      const bot = makePinnacleBot(route, enemies.enemies);
      const r = runBot(
        bot,
        thresholds.growth.titleReachabilityDays,
        `test:${routeId}`,
        stepConfig(),
        simClock(),
        skillIds,
      );
      // 発見の出所は見聞録の噂アトム
      const atomId = `rumor.${routeId}`;
      expect(r.final.lore.read).toContain(atomId);
      expect(r.final.flags[route.hidden!.flag]).toBe(true);
      for (const s of route.stages) {
        expect(
          r.firsts.some((f) => f.key === `pinnacle:${route.id}.${s.id}`),
          `段 ${s.id}（${s.name}）`,
        ).toBe(true);
      }
      expect(pinnacleReached(r.final, route)).toBe(true);
      expect(r.final.titles).toContain(route.title);
    });
  }

  it("領主ルート：寄付の累計（town.donated）と名士への打診を通る", () => {
    const route = pinnacles.pinnacles.find((r) => r.id === "lord")!;
    const bot = makePinnacleBot(route, enemies.enemies);
    const r = runBot(bot, 120, "test:lord", stepConfig(), simClock(), skillIds);
    expect(r.final.counters["town.donated"] ?? 0).toBeGreaterThanOrEqual(1500);
    expect(r.final.counters["society.offer.patrician"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(r.final.society.standing).toBe("patrician");
  });
});
