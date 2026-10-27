import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enemies, pinnacles, skills, society, titles } from "@trace/content";
import { evaluate } from "@trace/core";
import { makePinnacleBot, makeSeekerBot, metricBots } from "./bots.js";
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
  const head = [
    "day",
    "minutes",
    "mainSkill",
    "totalSkill",
    "fatigue",
    "overwork",
    "incident",
    ...skillIds,
  ];
  const rows = result.days.map((d) =>
    [
      d.day,
      d.minutes.toFixed(1),
      d.mainSkill.toFixed(3),
      d.totalSkill.toFixed(3),
      d.fatigue.toFixed(1),
      d.overwork ? 1 : 0,
      d.incident ? 1 : 0,
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

  // ---- F-01「成長の爽快感」----
  // 初日（1日目の睡眠明け）に主スキルがこれだけ伸びる —— 初日から伸びが見える
  for (const botId of t.earlyGrowth.dayOneBots) {
    const d1 = results.get(botId)!.days[0];
    const v = d1?.mainSkill ?? 0;
    ok(
      "初日の伸び",
      `${botId}: 初朝 +${v.toFixed(1)} （≥${t.earlyGrowth.dayOneMinGain}、${d1 ? `${d1.day}日目の朝` : "?"})`,
      v >= t.earlyGrowth.dayOneMinGain,
    );
  }
  // 最初のランクアップ（ランク帯を越えた節目）がこの日数以内に来る
  for (const botId of t.earlyGrowth.rankUpBots) {
    const r = results.get(botId)!;
    const f = r.firsts.find((x) => x.key.startsWith("rankup:"));
    const day =
      f !== undefined
        ? (r.days.find((d) => d.minutes >= f.minutes)?.day ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
    ok(
      "最初のランクアップ",
      `${botId}: ${day === Number.POSITIVE_INFINITY ? "期間内なし" : `${day}日目の朝`} （≤${t.earlyGrowth.firstRankUpDays}日）`,
      day <= t.earlyGrowth.firstRankUpDays,
    );
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

  // 称号の到達可能性（seeker を長めに回す）。
  // simReachable=false の称号は戦闘・台帳など訓練ボットが作らない条件なので対象外
  const simTitles = titles.titles.filter((tt) => tt.simReachable !== false);
  const excluded = titles.titles.filter((tt) => tt.simReachable === false).map((tt) => tt.id);
  const seeker = makeSeekerBot(simTitles);
  const seekerRun = runBot(seeker, t.titleReachabilityDays, "titles", cfg, clock, skillIds);
  const earned = new Set(seekerRun.titlesEarned);
  const missing = simTitles.filter((tt) => !earned.has(tt.id)).map((tt) => tt.id);
  ok(
    "称号の到達可能性",
    `${earned.size}/${simTitles.length} 到達（${t.titleReachabilityDays}日シード）${missing.length ? ` 未到達: ${missing.join(", ")}` : ""}`,
    missing.length === 0,
  );
  if (excluded.length > 0) {
    notes.push(`到達性の対象外（戦闘・台帳など訓練で得られない条件）: ${excluded.join(", ")}`);
  }

  // 人生目標の到達可能性（T-34）：各ボットの最終状態で条件を評価する。
  // 宣言の要否は見ず「条件が真になり得るか」を見る。戦闘・仕事・打診・読了系は
  // 訓練ボットでは満たせないため society.json の simReachable:false で対象外
  const simGoals = society.lifeGoals.filter((g) => g.simReachable !== false);
  const goalExcluded = society.lifeGoals.filter((g) => g.simReachable === false).map((g) => g.id);
  const finals = [...results.values()].map((r) => r.final);
  finals.push(seekerRun.final);
  const goalsHit = new Set(
    simGoals.filter((g) => finals.some((f) => evaluate(g.condition, f, cfg.time))).map((g) => g.id),
  );
  const goalsMissing = simGoals.filter((g) => !goalsHit.has(g.id)).map((g) => g.id);
  ok(
    "人生目標の到達可能性",
    `${goalsHit.size}/${simGoals.length} 到達可能（訓練シムの最終状態）${goalsMissing.length ? ` 未到達: ${goalsMissing.join(", ")}` : ""}`,
    goalsMissing.length === 0,
  );
  if (goalExcluded.length > 0) {
    notes.push(
      `目標の到達性の対象外（戦闘・仕事・打診・読了など訓練で満たせない条件）: ${goalExcluded.join(", ")}`,
    );
  }

  // 頂点ルート「到達までの日数」の目安（T-41。06 §3A のバランス確認）。
  // 専用ボット（条件鎖を読んで撃破→連戦→台帳→訓練をこなす）を seeker と同じ日数で回す。
  // 戦闘は常勝・仕事は見込み品質で近似した楽観値なので、ゲートではなく報告のみ
  for (const route of pinnacles.pinnacles) {
    const bot = makePinnacleBot(route, enemies.enemies);
    const r = runBot(bot, t.titleReachabilityDays, `pinnacle:${route.id}`, cfg, clock, skillIds);
    const dayOf = (minutes: number) =>
      r.days.find((d) => d.minutes >= minutes)?.day ?? r.days.at(-1)?.day ?? "?";
    const stageDays = route.stages.map((s) => {
      const f = r.firsts.find((x) => x.key === `pinnacle:${route.id}.${s.id}`);
      return `${s.name}=${f !== undefined ? `${dayOf(f.minutes)}日目` : "未到達"}`;
    });
    const apex = route.stages[route.stages.length - 1]!;
    const apexF = r.firsts.find((x) => x.key === `pinnacle:${route.id}.${apex.id}`);
    notes.push(
      `頂点「${route.name}」: ${stageDays.join(" / ")}${apexF === undefined ? "（期間内に未達）" : ""}`,
    );
  }

  for (const n of notes) console.log(`  - ${n}`);

  console.log(`  CSV: packages/sim/out/growth-*.csv`);
  if (fails.length) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
