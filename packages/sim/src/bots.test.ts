import { balance, enemies, pinnacles, skills, world as worldFile } from "@trace/content";
import { generateWorld, mergeLifeContrib, pinnacleReached, WORLD_RECIPE } from "@trace/core";
import { describe, expect, it } from "vitest";
import { makePinnacleBot, metricBots, withTravel } from "./bots.js";
import { simClock, stepConfig } from "./config.js";
import { runBot } from "./runner.js";
import { thresholds } from "./thresholds.js";

const skillIds = skills.skills.map((s) => s.id);

describe("頂点ルートの専用ボット（X-4 大賢者）", () => {
  // F-05：出来事の応答が加わってランが重くなったためタイムアウトを広げる
  it(
    "大賢者ルート：読む系の条件鎖（読了数・知識フラグ）を含めて全段に至る",
    { timeout: 30000 },
    () => {
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
    },
  );
});

describe("頂点ルートの専用ボット（X-9 伏せられた頂点ルート）", () => {
  // 隠しルートは発見フラグ（噂アトムの unlock.flag）が立つまで段が評価されない。
  // ボットは planReading 経由で噂を読んでから段の条件をこなす
  for (const routeId of ["merchant_king", "lord"] as const) {
    // 全行程ボットシムは出来事の応答も加わって重いため、余裕を持たせる
    it(`${routeId}ルート：噂を読んで開き、全段に至る`, { timeout: 30000 }, () => {
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

  it("領主ルート：寄付の累計（town.donated）と名士への打診を通る", { timeout: 30000 }, () => {
    const route = pinnacles.pinnacles.find((r) => r.id === "lord")!;
    const bot = makePinnacleBot(route, enemies.enemies);
    const r = runBot(bot, 120, "test:lord", stepConfig(), simClock(), skillIds);
    expect(r.final.counters["town.donated"] ?? 0).toBeGreaterThanOrEqual(1500);
    expect(r.final.counters["society.offer.patrician"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(r.final.society.standing).toBe("patrician");
  });
});

describe("地方の地図と旅（G-02）：生き方ごとのボットが一生のうちに地方を巡る", () => {
  // 敵の挑戦差（危険度の蓋で敵を絞る生成の係数。web の world.ts と同じ注入）
  const enemyChallenge = Object.fromEntries(enemies.enemies.map((e) => [e.id, e.challenge]));
  for (const base of metricBots) {
    it(
      `${base.id}：地方の大半（町の6割以上・町と地域合わせて5割以上）を訪れる`,
      { timeout: 60000 },
      () => {
        const cfg = stepConfig();
        // 旅欲を混ぜた生き方ボット（地域の場所 id は世界生成の結果から渡す）
        const bot = withTravel(base, { regions: [] });
        // 生成世界は state.seed（runBot が組み立てる "<seed>:<bot.id>"）から引き直す
        const world = generateWorld(
          `g02-travel:${bot.id}`,
          worldFile,
          balance.world,
          enemyChallenge,
        );
        const bot2 = withTravel(base, { regions: world.areas.map((a) => a.id) });
        const r = runBot(
          bot2,
          224, // 2年（28日×4季節×2年）。一生のうちの序盤〜中盤に相当
          "g02-travel",
          { ...cfg, life: mergeLifeContrib(cfg.life!, world.life, balance.world.rep) },
          simClock(),
          skillIds,
          {
            world: { kind: "gen", recipe: WORLD_RECIPE },
            initialTown: world.startTown,
            initialMoney: 80,
          },
        );
        // 旅は実際に行われている（出発カウンタと、旅の途中経過の刻印）
        expect(r.final.counters["journey.count"] ?? 0).toBeGreaterThan(0);
        expect(r.final.life.map.heard.length).toBeGreaterThan(1);
        // 町の大半を訪れる（季節の通行止め・危機の閉鎖・関所で届かない町がありうる）
        const visitedTowns = world.towns.filter((t) =>
          r.final.life.map.visited.includes(t.id),
        ).length;
        expect(visitedTowns / world.towns.length).toBeGreaterThanOrEqual(0.6);
        // 町の外の地域も訪れる（地方全体で見た訪問カバレッジ）
        const visitedRegions = world.areas.filter((a) =>
          r.final.life.map.visited.includes(a.id),
        ).length;
        const coverage =
          (visitedTowns + visitedRegions) / (world.towns.length + world.areas.length);
        expect(coverage).toBeGreaterThanOrEqual(0.5);
      },
    );
  }
});
