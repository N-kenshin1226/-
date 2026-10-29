import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinnacles, skills } from "@trace/content";
import { loadHiddenCrises } from "@trace/content/hidden";
import { isCrisisPinnacleRoute } from "@trace/core";
import { crisisBotDomains, crisisBots } from "./crisis-bots.js";
import { runCrisisWorld, type CrisisRun } from "./crisis-runner.js";
import { simClock, stepConfig } from "./config.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:crisis — 世界の危機の面白さの検証（docs/08 §8、W-05）。
 * 同じ世界シード群を方針の違うボットで回し、6指標＋「見える」を検査する。
 * 閾値を割ったら非ゼロで終了する。
 *
 * hidden/crises の型があるときはそちらが対象になる（content 側の既存の
 * 読み込み経路）。中身（型の id・名前・数値の内訳）は一切出力しない —
 * 指標ごとの合否と実測値だけを出す
 */

interface Fail {
  metric: string;
  detail: string;
}

/** 1年は 112日（daysPerSeason 28 × seasonsPerYear 4） */
const DAYS_PER_YEAR = 112;

export function runCrisis(): number {
  const cfg = stepConfig();
  const clock = simClock();
  const t = thresholds.crisis;
  const skillIds = skills.skills.map((s) => s.id);
  const fails: Fail[] = [];
  const notes: string[] = [];
  const startedAt = Date.now();

  const hidden = loadHiddenCrises();
  const hiddenActive = hidden.length > 0;
  const typeLabel = (i: number) =>
    hiddenActive ? `型#${i}` : (cfg.crisis?.types[i]?.id ?? `型#${i}`);

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });

  const ok = (metric: string, detail: string, pass: boolean) => {
    if (!pass) fails.push({ metric, detail });
    console.log(`  ${pass ? "✓" : "✗"} ${metric}: ${detail}`);
  };

  const seeds = Array.from({ length: t.seeds }, (_, i) => `crisis:w${i}`);
  const typeCount = cfg.crisis?.types.length ?? 0;

  console.log(
    `== sim:crisis (${t.seeds}世界 × ボット${crisisBots.lifestyles.length + 4}種、上限${t.maxDays}日) ==`,
  );
  if (hiddenActive) {
    console.log(`  対象: hidden の危機の型 ${hidden.length}件（中身は出力しない）`);
  } else {
    console.log(`  対象: 公開サンプル ${typeCount}種（hidden の危機の型は未配置）`);
  }

  // ---- Phase A: 何もしないボット（世界が自分で動く・滅び・兆し） ----
  const idle: CrisisRun[] = seeds.map((s) =>
    runCrisisWorld(crisisBots.idle, s, cfg, clock, skillIds, { maxDays: t.maxDays }),
  );
  const withCrisis = idle.filter((r) => !r.noCrisis);
  const noCrisis = idle.length - withCrisis.length;
  if (noCrisis > 0) notes.push(`危機の無い世界: ${noCrisis}/${idle.length}`);

  const typeStats = new Map<number, { n: number; resolved: number; ruin: number }>();
  for (const r of withCrisis) {
    const s = typeStats.get(r.typeIndex) ?? { n: 0, resolved: 0, ruin: 0 };
    s.n++;
    if (r.outcome === "resolved") s.resolved++;
    if (r.outcome === "ruin") s.ruin++;
    typeStats.set(r.typeIndex, s);
  }
  for (const [i, s] of [...typeStats.entries()].sort()) {
    console.log(
      `  ${typeLabel(i).padEnd(24)} ${s.n}世界: 決着 ${s.resolved} / 滅び ${s.ruin} / 進行中 ${s.n - s.resolved - s.ruin}`,
    );
  }

  // 指標1「世界が自分で動く」：通常の（重くない）危機の決着率
  const normal = withCrisis.filter((r) => !r.heavy);
  const normalResolved = normal.filter((r) => r.outcome === "resolved").length;
  const normalRate = normal.length > 0 ? normalResolved / normal.length : 0;
  ok(
    "世界が自分で動く",
    `通常危機の決着 ${normalResolved}/${normal.length} = ${(normalRate * 100).toFixed(0)}% （基準 ≥${t.worldResolves.minResolvedRate * 100}%）`,
    normal.length > 0 && normalRate >= t.worldResolves.minResolvedRate,
  );

  // 指標2「滅びはたまに」：何もしないボットでの滅び率が範囲内
  const ruins = withCrisis.filter((r) => r.outcome === "ruin").length;
  const ruinRate = withCrisis.length > 0 ? ruins / withCrisis.length : 0;
  const heavyN = withCrisis.filter((r) => r.heavy).length;
  ok(
    "滅びはたまに",
    `滅び ${ruins}/${withCrisis.length} = ${(ruinRate * 100).toFixed(1)}% （基準 ${t.ruin.minRate * 100}〜${t.ruin.maxRate * 100}%、期待約${t.ruin.expectedRate * 100}%。重い危機の出現 ${heavyN}世界）`,
    ruinRate >= t.ruin.minRate && ruinRate <= t.ruin.maxRate,
  );

  // ---- Phase B: 生き方別ボット（接点の届き） ----
  console.log("  ── 生き方ごとの接点の届き（ゲーム内1年あたりの提示数） ──");
  const lifeRuns = new Map<string, CrisisRun[]>();
  for (const bot of crisisBots.lifestyles) {
    const domain = crisisBotDomains[bot.id];
    const runs = seeds.map((s) =>
      runCrisisWorld(bot, s, cfg, clock, skillIds, {
        maxDays: t.maxDays,
        ...(domain !== undefined ? { domain } : {}),
      }),
    );
    lifeRuns.set(bot.id, runs);
    const offersPerYear =
      runs.reduce((a, r) => a + r.offers, 0) /
      Math.max(1, runs.reduce((a, r) => a + r.crisisDays, 0) / DAYS_PER_YEAR);
    const domainPerYear =
      runs.reduce((a, r) => a + r.domainOffers, 0) /
      Math.max(1, runs.reduce((a, r) => a + r.crisisDays, 0) / DAYS_PER_YEAR);
    const kinds = Object.entries(
      runs.reduce<Record<string, number>>((acc, r) => {
        for (const [k, v] of Object.entries(r.offersByKind)) acc[k] = (acc[k] ?? 0) + v;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(`    ${bot.id.padEnd(16)} ${kinds}`);
    ok(
      `接点の届き(${bot.id})`,
      `${offersPerYear.toFixed(0)}件/年（基準 ≥${t.touchpoints.minOffersPerYear}）、うちその生き方の分野 ${domainPerYear.toFixed(0)}件/年（基準 ≥${t.touchpoints.minDomainOffersPerYear}）`,
      offersPerYear >= t.touchpoints.minOffersPerYear &&
        domainPerYear >= t.touchpoints.minDomainOffersPerYear,
    );
  }

  // ---- Phase C: 関わり方の違うボット（英雄・縛り・成功率） ----
  const engaged = [
    crisisBots.focused,
    crisisBots.mixed,
    crisisBots.noPinnacle,
    crisisBots.dabble,
  ] as const;
  const engagedRuns = new Map<string, CrisisRun[]>();
  for (const bot of engaged) {
    const domain = crisisBotDomains[bot.id];
    engagedRuns.set(
      bot.id,
      seeds.map((s) =>
        runCrisisWorld(bot, s, cfg, clock, skillIds, {
          maxDays: t.maxDays,
          ...(domain !== undefined ? { domain } : {}),
        }),
      ),
    );
  }
  const stageSummary = (id: string): string => {
    const runs = engagedRuns.get(id)!;
    const hist = [0, 0, 0, 0, 0];
    for (const r of runs) hist[r.maxStage]!++;
    return `段階分布[1:${hist[1]} 2:${hist[2]} 3:${hist[3]} 4:${hist[4]}]`;
  };
  for (const bot of engaged) {
    const runs = engagedRuns.get(bot.id)!;
    const tp = runs.reduce((a, r) => a + r.tpDone, 0) / runs.length;
    const heroes = runs.filter((r) => r.heroLed).length;
    console.log(
      `    ${bot.id.padEnd(20)} ${stageSummary(bot.id)} 接点達成 ${tp.toFixed(0)}/世界 英雄 ${heroes}世界`,
    );
  }

  // 指標4「英雄は勝ち取るもの」：集中で届き、片手間・普通遊びではほぼ届かない
  const focused = engagedRuns.get(crisisBots.focused.id)!;
  const focused4 = focused.filter((r) => r.maxStage >= 4).length;
  ok(
    "英雄は勝ち取るもの(集中)",
    `危機集中の段階4到達 ${focused4}/${focused.length}世界 （基準 ≥${t.hero.focusedStage4MinWorlds}世界）`,
    focused4 >= t.hero.focusedStage4MinWorlds,
  );
  const dabble = engagedRuns.get(crisisBots.dabble.id)!;
  const dabble4 = dabble.filter((r) => r.maxStage >= 4).length;
  const casualRuns = [...dabble, ...[...lifeRuns.values()].flat()];
  const casual4 = casualRuns.filter((r) => r.maxStage >= 4).length;
  const casual4Rate = casual4 / Math.max(1, casualRuns.length);
  ok(
    "英雄は勝ち取るもの(片手間・普通遊び)",
    `段階4到達 ${casual4}/${casualRuns.length} = ${(casual4Rate * 100).toFixed(1)}% （基準 ≤${t.hero.casualStage4MaxRate * 100}%。内訳 片手間${dabble4}・生き方別${casual4 - dabble4}）`,
    casual4Rate <= t.hero.casualStage4MaxRate,
  );

  // 指標5「縛られない」：頂点なし・混ざった生き方でも段階4に届く世界がある
  const mixed = engagedRuns.get(crisisBots.mixed.id)!;
  const mixed4 = mixed.filter((r) => r.maxStage >= 4).length;
  const noPin = engagedRuns.get(crisisBots.noPinnacle.id)!;
  // 危機の足跡だけで出来たルート（英雄）は「頂点未踏」の対象外 ——
  // 危機に身を投じれば踏まれるのが設計（X-39）。別の道の極みが
  // 要らないことが証左なので、危機由来以外の頂点が無いかを見る
  const crisisRouteIds = new Set(
    pinnacles.pinnacles.filter(isCrisisPinnacleRoute).map((r) => r.id),
  );
  const apexFree = (r: CrisisRun) => r.pinnacleTopIds.every((id) => crisisRouteIds.has(id));
  const noPinApexFree = noPin.filter(apexFree).length;
  const noPin4 = noPin.filter((r) => r.maxStage >= 4 && apexFree(r)).length;
  ok(
    "縛られない(混ざった生き方)",
    `鍛冶＋剣の段階4到達 ${mixed4}/${mixed.length}世界 （基準 ≥${t.unbound.mixedStage4MinWorlds}世界）`,
    mixed4 >= t.unbound.mixedStage4MinWorlds,
  );
  ok(
    "縛られない(頂点なし)",
    `頂点未踏のまま段階4到達 ${noPin4}/${noPin.length}世界 （基準 ≥${t.unbound.noPinnacleStage4MinWorlds}世界。頂点（英雄除く）到達ゼロの世界は${noPinApexFree}）`,
    noPin4 >= t.unbound.noPinnacleStage4MinWorlds && noPinApexFree === noPin.length,
  );

  // 指標6「関わると変わる」：段階3以上に届いた世界の決着成功率が
  // 何もしない場合（同じ世界シードの idle 走）より有意に高い
  const involved = [...focused, ...mixed, ...noPin].filter((r) => r.maxStage >= 3);
  const involvedSeeds = new Set(involved.map((r) => r.seed));
  const idleOnSeeds = idle.filter((r) => involvedSeeds.has(r.seed));
  const involvedRate =
    involved.length > 0
      ? involved.filter((r) => r.outcome === "resolved").length / involved.length
      : 0;
  const idleRate =
    idleOnSeeds.length > 0
      ? idleOnSeeds.filter((r) => r.outcome === "resolved").length / idleOnSeeds.length
      : 0;
  const delta = involvedRate - idleRate;
  // 参考：決着の場面ごとの勝率でも見る
  const finaleWins = (rs: CrisisRun[]) =>
    rs.flatMap((r) => r.finales).filter((f) => f.success === true).length;
  const finaleAll = (rs: CrisisRun[]) => rs.flatMap((r) => r.finales).length;
  const invFinaleRate = finaleWins(involved) / Math.max(1, finaleAll(involved));
  const idleFinaleRate = finaleWins(idleOnSeeds) / Math.max(1, finaleAll(idleOnSeeds));
  ok(
    "関わると変わる",
    `段階3以上 ${involved.length}世界: 決着率 ${(involvedRate * 100).toFixed(1)}% vs 何もしない ${(idleRate * 100).toFixed(1)}% （差 ${(delta * 100).toFixed(1)}pt ≥${t.involvement.minSuccessDelta * 100}pt。場面勝率 ${(invFinaleRate * 100).toFixed(0)}% vs ${(idleFinaleRate * 100).toFixed(0)}%）`,
    involved.length >= t.involvement.minInvolvedWorlds && delta >= t.involvement.minSuccessDelta,
  );

  // 指標7「見える」：開始から1時間以内に危機の兆しが新聞・噂に出る
  const signBad = idle.filter((r) => r.signMinute === null || r.signMinute > t.sign.withinMinutes);
  const signMax = Math.max(0, ...idle.map((r) => r.signMinute ?? Infinity));
  ok(
    "見える",
    `兆しが出るまで 最大 ${signMax === Infinity ? "―" : signMax}分 / ${idle.length}世界 （基準 ≤${t.sign.withinMinutes}分。出ない世界 ${signBad.length}）`,
    signBad.length === 0,
  );

  for (const n of notes) console.log(`  - ${n}`);

  const summary = {
    seeds: t.seeds,
    hiddenTypes: hidden.length,
    runs: idle.length * (1 + crisisBots.lifestyles.length + engaged.length),
    idle: idle.map((r) => ({
      seed: r.seed,
      typeIndex: r.typeIndex,
      heavy: r.heavy,
      outcome: r.outcome,
      endDay: r.endDay,
      signMinute: r.signMinute,
    })),
    engaged: [...engagedRuns.values()].flat().map((r) => ({
      seed: r.seed,
      botId: r.botId,
      outcome: r.outcome,
      maxStage: r.maxStage,
      stage4Day: r.stage4Day,
      tpDone: r.tpDone,
      pinnacleTops: r.pinnacleTops,
      heroLed: r.heroLed,
      finales: r.finales,
    })),
  };
  writeFileSync(join(outDir, "crisis.json"), JSON.stringify(summary, null, 2));
  console.log(`  詳細: packages/sim/out/crisis.json`);
  console.log(`  実行時間: ${((Date.now() - startedAt) / 1000).toFixed(1)}秒`);

  if (fails.length) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
