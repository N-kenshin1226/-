import {
  createRng,
  crisisEffects,
  crisisInvolvement,
  crisisTouchpointOffers,
  crisisTypeOf,
  newGame,
  reachedPinnacles,
  routeProgress,
  step,
  type Command,
  type GameState,
  type StepConfig,
} from "@trace/core";
import type { Bot, BotCtx } from "./bots.js";
import type { SimClock } from "./config.js";
import type { CrisisBotDomain } from "./crisis-bots.js";

/**
 * 危機シムの世界ランナー（W-05、docs/08 §8）。
 * 同じ世界シードをボットごとに共有する（newGame の seed にボット名を混ぜない ——
 * 危機は世界のものなので、同じ世界でボットだけを変えて比較する）
 */

/** 1世界・1ボットの走行結果 */
export interface CrisisRun {
  seed: string;
  botId: string;
  /** 抽選された危機の型（hidden の世界では内容を出さない扱い。index で識別する） */
  typeIndex: number;
  /** 危機の型が重いものか（滅びうる型） */
  heavy: boolean;
  /** 危機が無い世界か（型の一覧が空など） */
  noCrisis: boolean;
  outcome: "none" | "ongoing" | "resolved" | "ruin";
  /** 走行した日数・実時間（分） */
  days: number;
  minutes: number;
  /** 危機が終わった日（終わらなければ null） */
  endDay: number | null;
  /** 危機が進行していた日数（接点/年の正規化に使う） */
  crisisDays: number;
  /** 兆しが見えるようになった実時間（分。見えなければ null） */
  signMinute: number | null;
  /** 日ごとの接点の提示の合計（その世界で日常に混ざった回数） */
  offers: number;
  /** うち、そのボットの生き方の分野に届いた提示の合計 */
  domainOffers: number;
  /** 接点の語り分類（order/supply/defense/…）ごとの提示数 */
  offersByKind: Record<string, number>;
  /** 果たした接点の数（counters["crisis.tp.done"]） */
  tpDone: number;
  /** 関与の最高段階（危機の進行中に届いた最大値） */
  maxStage: number;
  /** 段階4に最初に届いた日（届かなければ null） */
  stage4Day: number | null;
  /** 頂点に至ったルートの数（終了時） */
  pinnacleTops: number;
  /** 頂点に至ったルートのID（終了時。英雄のような危機由来のルートも含む） */
  pinnacleTopIds: string[];
  /** 頂点ルートの達成段数の合計（終了時） */
  pinnacleStages: number;
  /** 判定された決着の場面（成功可否と備え合計） */
  finales: { id: string; success: boolean | null; total: number | null }[];
  /** 自分で起こした決着を勝ち取ったか（flags["crisis.hero"]） */
  heroLed: boolean;
}

const SLEEP_KINDS = new Set(["sleep", "rest"]);

/** 行動を消費しないコマンド（会話の一瞬。実時間を進めない） */
const FREE_KINDS = new Set([
  "acceptOffer",
  "crisisFinaleJoin",
  "buyBook",
  "apprentice",
  "leaveMentor",
  "declareGoal",
  "abandonGoal",
  "retire",
]);

/**
 * 「危機の兆しが新聞・噂に出る」状態か（docs/08 §8「見える」）。
 * 判定は世界側の素材で行う：
 *  - 出来事の記録（crisis.log）に新聞・噂に載せる行があること
 *  - 兆しが遊びに届いていること（段階の影響が有効、または接点が提示されている）
 * 記事そのものの文言は語り層（W-04 側）の仕事 —— ここでは「出せる状態」を検査する
 */
function crisisSignVisible(g: GameState, cfg: StepConfig): boolean {
  const crisis = g.crisis;
  if (crisis === null || crisis.log.length === 0 || cfg.crisis === undefined) return false;
  const e = crisisEffects(g, cfg.crisis);
  const effects =
    e.closeAreas.length + e.price.length + e.enemy.length + e.npc.length + e.features.length;
  if (effects > 0) return true;
  return crisisTouchpointOffers(g, cfg.crisis, cfg.time).length > 0;
}

/**
 * bot を世界シード seed の世界で、危機の終幕（または maxDays）まで回す。
 * ボットがどう遊んでも世界の危機は進む —— 終幕までの間、接点の提示・
 * 関与の段階・兆しの可視性を計測する
 */
export function runCrisisWorld(
  bot: Bot,
  seed: string,
  cfg: StepConfig,
  clock: SimClock,
  skillIds: readonly string[],
  opts: { maxDays: number; domain?: CrisisBotDomain },
): CrisisRun {
  let g: GameState = newGame(seed, bot.id, {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    ...(cfg.crisis !== undefined ? { crisis: cfg.crisis } : {}),
  });
  const rng = createRng(`crisisbot:${seed}:${bot.id}`);
  const ctx: BotCtx = { cfg, rng, skillIds };

  let minutes = 0;
  let countedDay = -1;
  let offers = 0;
  let domainOffers = 0;
  const offersByKind: Record<string, number> = {};
  let maxStage = 1;
  let stage4Day: number | null = null;
  let signMinute: number | null = null;
  let endDay: number | null = null;
  let stalled = 0;

  const countOffers = () => {
    if (g.crisis === null || g.crisis.outcome !== "ongoing") return;
    const list = crisisTouchpointOffers(g, cfg.crisis, cfg.time);
    offers += list.length;
    for (const o of list) {
      offersByKind[o.def.kind] = (offersByKind[o.def.kind] ?? 0) + 1;
      const domain =
        opts.domain !== undefined &&
        ((o.vessel === "work" &&
          o.order !== undefined &&
          opts.domain.workKinds.includes(o.order.kind)) ||
          (o.vessel === "combat" && opts.domain.fights));
      if (domain) domainOffers += 1;
    }
  };

  let guard = 0;
  while (guard++ < opts.maxDays * 20 + 60) {
    // 新しい日の最初に、その日の提示を数える（世界シード×日付で決定的）
    if (g.time.day !== countedDay) {
      countedDay = g.time.day;
      countOffers();
    }
    if (g.crisis !== null && g.crisis.outcome === "ongoing") {
      const stage = crisisInvolvement(g, cfg.crisis).stage;
      if (stage > maxStage) {
        maxStage = stage;
        if (stage === 4 && stage4Day === null) stage4Day = g.time.day;
      }
    }
    if (signMinute === null && crisisSignVisible(g, cfg)) signMinute = minutes;
    if (g.crisis === null) {
      if (g.time.day >= opts.maxDays) break;
    } else if (g.crisis.outcome !== "ongoing") {
      endDay = g.time.day;
      break;
    } else if (g.time.day >= opts.maxDays) {
      break;
    }

    const cmd: Command =
      g.time.action >= cfg.time.actionsPerDay ? bot.endDay(g, ctx) : bot.act(g, ctx);
    const actionBefore = g.time.action;
    const dayBefore = g.time.day;
    const { state: next } = step(g, cmd, cfg);
    g = next;
    minutes += SLEEP_KINDS.has(cmd.type)
      ? clock.minutesPerSleep
      : FREE_KINDS.has(cmd.type)
        ? 0
        : clock.minutesPerAction;
    // 時間の進まないコマンドが連続したらスタックとみなして打ち切る（安全弁）
    if (g.time.day === dayBefore && g.time.action === actionBefore) {
      if (++stalled > 40) break;
    } else {
      stalled = 0;
    }
  }

  const type = cfg.crisis !== undefined ? crisisTypeOf(g, cfg.crisis) : undefined;
  const typeIndex =
    cfg.crisis === undefined ? -1 : cfg.crisis.types.findIndex((t) => t.id === type?.id);
  const pinnacleRoutes = cfg.pinnacles ?? [];
  return {
    seed,
    botId: bot.id,
    typeIndex,
    heavy: type?.heavy === true,
    noCrisis: g.crisis === null,
    outcome: g.crisis === null ? "none" : g.crisis.outcome,
    days: g.time.day,
    minutes,
    endDay,
    crisisDays: g.crisis === null ? 0 : Math.min(g.time.day, endDay ?? g.time.day),
    signMinute,
    offers,
    domainOffers,
    offersByKind,
    tpDone: g.counters["crisis.tp.done"] ?? 0,
    maxStage,
    stage4Day,
    pinnacleTops: reachedPinnacles(g, pinnacleRoutes).length,
    pinnacleTopIds: reachedPinnacles(g, pinnacleRoutes),
    pinnacleStages: pinnacleRoutes.reduce((s, r) => s + routeProgress(g, r).done, 0),
    finales: (g.crisis?.finales ?? [])
      .filter((f) => f.resolved)
      .map((f) => ({ id: f.id, success: f.success ?? null, total: f.total ?? null })),
    heroLed: g.flags["crisis.hero"] === true,
  };
}
