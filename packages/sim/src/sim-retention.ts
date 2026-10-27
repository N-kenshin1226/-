import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skills } from "@trace/content";
import { metricBots } from "./bots.js";
import { simClock, stepConfig } from "./config.js";
import { runBot } from "./runner.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:retention — 各時間帯の「初体験イベント」件数と
 * 同一行動の最大連続回数を検査する（docs/02 §10、03 §6）。
 */

interface Fail {
  metric: string;
  detail: string;
}

export function runRetention(): number {
  const cfg = stepConfig();
  const clock = simClock();
  const t = thresholds.retention;
  const skillIds = skills.skills.map((s) => s.id);
  const fails: Fail[] = [];

  console.log(`== sim:retention (${t.days}日 × ${metricBots.length}ボット) ==`);

  const results = metricBots.map((bot) => runBot(bot, t.days, "retention", cfg, clock, skillIds));

  // 初体験イベント（開始から upToMinutes までの累計件数）
  for (const band of t.bands) {
    for (const botId of band.bots) {
      const r = results.find((x) => x.botId === botId)!;
      const n = r.firsts.filter((f) => f.minutes <= band.upToMinutes).length;
      const pass = n >= band.minFirstEvents;
      if (!pass) {
        fails.push({
          metric: `初体験イベント ≤${band.upToMinutes}分`,
          detail: `${botId}: ${n}件 （基準 ${band.minFirstEvents}）`,
        });
      }
      console.log(
        `  ${pass ? "✓" : "✗"} 初体験 ≤${String(band.upToMinutes).padStart(3)}分: ${botId.padEnd(8)} ${n}件 （基準 ${band.minFirstEvents}）`,
      );
    }
  }

  // 同一行動の連続回数
  const cg = t.maxConsecutiveSameAction;
  for (const botId of cg.bots) {
    const r = results.find((x) => x.botId === botId)!;
    const pass = r.maxConsecutiveSameAction <= cg.max;
    if (!pass) {
      fails.push({
        metric: "作業化",
        detail: `${botId}: ${r.maxConsecutiveSameAction}連続 （基準 ≤${cg.max}）`,
      });
    }
    console.log(
      `  ${pass ? "✓" : "✗"} 連続同一行動: ${botId.padEnd(8)} ${r.maxConsecutiveSameAction}回 （基準 ≤${cg.max}）`,
    );
  }
  // 対象外ボットは参考値として表示
  for (const r of results) {
    if (!cg.bots.includes(r.botId)) {
      console.log(`  - 連続同一行動（参考）: ${r.botId.padEnd(8)} ${r.maxConsecutiveSameAction}回`);
    }
  }

  // 日々の出来事の頻度（F-05、docs/devin_tasks/F-05_daily_events.md
  // 「普通に遊んで3日に1回以上」）：届いた日の割合と、届かない日の最大連続数
  const ig = t.incidents;
  for (const botId of ig.bots) {
    const r = results.find((x) => x.botId === botId)!;
    const offerRate = r.incidentDays.length / Math.max(1, r.days.length);
    let dry = 0;
    let maxDry = 0;
    for (const d of r.days) {
      dry = d.incident ? 0 : dry + 1;
      if (dry > maxDry) maxDry = dry;
    }
    const pass = offerRate >= ig.minOfferRate && maxDry <= ig.maxDryStreak;
    if (!pass) {
      fails.push({
        metric: "日々の出来事の頻度",
        detail: `${botId}: 届いた日 ${r.incidentDays.length}/${r.days.length}日（${(offerRate * 100).toFixed(0)}% ≥ ${ig.minOfferRate * 100}%） 最長空白 ${maxDry}日（≤${ig.maxDryStreak}）`,
      });
    }
    console.log(
      `  ${pass ? "✓" : "✗"} 出来事の頻度: ${botId.padEnd(8)} ${r.incidentDays.length}/${r.days.length}日（${(offerRate * 100).toFixed(0)}% ≥ ${(ig.minOfferRate * 100).toFixed(0)}%） 最長空白 ${maxDry}日（≤${ig.maxDryStreak}）`,
    );
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "retention.json"),
    JSON.stringify(
      results.map((r) => ({
        botId: r.botId,
        firsts: r.firsts,
        maxConsecutiveSameAction: r.maxConsecutiveSameAction,
        incidentDays: r.incidentDays,
      })),
      null,
      2,
    ),
  );
  console.log(`  詳細: packages/sim/out/retention.json`);

  if (fails.length) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
