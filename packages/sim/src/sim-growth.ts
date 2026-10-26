import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skills, titles } from "@trace/content";
import { makeSeekerBot, metricBots } from "./bots.js";
import { simClock, stepConfig } from "./config.js";
import { atMinutes, runBot, type RunResult } from "./runner.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:growth — 4ボットを標準60日分回し、成長の指標を検査する
 * （docs/02 §10）。閾値を割ったら非ゼロで終了する。
 */

interface Fail {
  metric: string;
  detail: string;
}
const fails: Fail[] = [];
const notes: string[] = [];

function ok(metric: string, detail: string, pass: boolean) {
  if (!pass) fails.push({ metric, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${metric}: ${detail}`);
}

function writeCsv(result: RunResult, outDir: string) {
  const skillIds = skills.skills.map((s) => s.id);
  const head = ["day", "minutes", "mainSkill", "totalSkill", "fatigue", "overwork", ...skillIds];
  const rows = result.days.map((d) =>
    [
      d.day,
      d.minutes.toFixed(1),
      d.mainSkill.toFixed(3),
      d.totalSkill.toFixed(3),
      d.fatigue.toFixed(1),
      d.overwork ? 1 : 0,
      ...skillIds.map((id) => (d.skills[id] ?? 0).toFixed(3)),
    ].join(","),
  );
  writeFileSync(join(outDir, `growth-${result.botId}.csv`), [head.join(","), ...rows].join("\n"));
}

export function runGrowth(): number {
  const cfg = stepConfig();
  const clock = simClock();
  const t = thresholds.growth;
  const skillIds = skills.skills.map((s) => s.id);

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });

  console.log(`== sim:growth (${t.days}日 × ${metricBots.length}ボット) ==`);

  const results = new Map<string, RunResult>();
  for (const bot of metricBots) {
    const r = runBot(bot, t.days, "growth", cfg, clock, skillIds);
    results.set(bot.id, r);
    writeCsv(r, outDir);
    const last = r.days.at(-1);
    console.log(
      `  ${bot.id.padEnd(8)} 主スキル=${last?.mainSkill.toFixed(1)} 合計=${last?.totalSkill.toFixed(1)} 最大連続同一行動=${r.maxConsecutiveSameAction}`,
    );
  }

  // 到達帯: 標準プレイ3時間で主スキル 25〜40
  for (const botId of t.mainSkillAt3h.bots) {
    const rec = atMinutes(results.get(botId)!.days, t.mainSkillAt3h.minutes);
    const v = rec?.mainSkill ?? 0;
    ok(
      "主スキル@3h",
      `${botId}: ${v.toFixed(1)} （範囲 ${t.mainSkillAt3h.min}〜${t.mainSkillAt3h.max}、${rec ? `${rec.day}日目` : "?"})`,
      v >= t.mainSkillAt3h.min && v <= t.mainSkillAt3h.max,
    );
  }

  // 10〜15時間で 40（一人前）
  for (const botId of t.mainSkillByMid.bots) {
    for (const mark of t.mainSkillByMid.marksMinutes) {
      const rec = atMinutes(results.get(botId)!.days, mark);
      const v = rec?.mainSkill ?? 0;
      ok(
        `主スキル@${Math.round(mark / 60)}h`,
        `${botId}: ${v.toFixed(1)} （≥${t.mainSkillByMid.min}、${rec ? `${rec.day}日目` : "?"})`,
        v >= t.mainSkillByMid.min,
      );
    }
  }

  // 方針間の差: 合計スキル増分の比 ≤ 1.3
  const total = (id: string) => results.get(id)!.days.at(-1)?.totalSkill ?? 0;
  const gap =
    Math.max(total("single"), total("diverse")) /
    Math.max(1e-9, Math.min(total("single"), total("diverse")));
  ok(
    "方針間の差",
    `single=${total("single").toFixed(1)} / diverse=${total("diverse").toFixed(1)} → ${gap.toFixed(2)}倍 （≤${thresholds.growth.policyGapMax}）`,
    gap <= thresholds.growth.policyGapMax,
  );

  // 簡易判定のみ型の効率（M0 は代用。実測値を報告、ゲートは enabled 次第）
  const simpleShare = total("simple") / Math.max(1e-9, total("diverse"));
  if (t.simpleExpShare.enabled) {
    ok(
      "簡易判定の経験効率",
      `simple/diverse = ${(simpleShare * 100).toFixed(0)}% （≤${t.simpleExpShare.max * 100}%）`,
      simpleShare <= t.simpleExpShare.max,
    );
  } else {
    notes.push(
      `簡易判定の経験効率（参考・無効化中）: ${(simpleShare * 100).toFixed(0)}% — ${t.simpleExpShare.reason}`,
    );
  }
  if (!t.simpleRevenueShare.enabled) {
    notes.push(`収益効率（未計測）: ${t.simpleRevenueShare.reason}`);
  }

  // 称号の到達可能性（seeker を長めに回す）
  const seeker = makeSeekerBot(titles.titles);
  const seekerRun = runBot(seeker, t.titleReachabilityDays, "titles", cfg, clock, skillIds);
  const earned = new Set(seekerRun.titlesEarned);
  const missing = titles.titles.filter((tt) => !earned.has(tt.id)).map((tt) => tt.id);
  ok(
    "称号の到達可能性",
    `${earned.size}/${titles.titles.length} 到達（${t.titleReachabilityDays}日シード）${missing.length ? ` 未到達: ${missing.join(", ")}` : ""}`,
    missing.length === 0,
  );

  for (const n of notes) console.log(`  - ${n}`);

  console.log(`  CSV: packages/sim/out/growth-*.csv`);
  if (fails.length) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
