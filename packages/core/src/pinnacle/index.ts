import { evaluate, type Cond } from "../conditions/index.js";
import { approaching, type NotifyRank } from "../notify/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 人生の頂点ルート（docs/06_endgame.md §3A、T-41）。
 *
 * ルート = 連続する高難度の条件鎖（条件DSLの列）。各段を順に越えていき、
 * 最終段（Sランク）に至ると頂点称号が授かる。実績の到達は
 * flags["pinnacle.<route>.<stage>"] に刻むだけなので、GameState の形は変わらない
 * （セーブのバージョンは据え置き）。
 *
 * 頂点称号そのものは titles.json に「最終段のフラグ」を条件として定義し、
 * 既存の称号判定（S通知・気配予算を含む）に拾わせる。条件鎖の記述は
 * pinnacles.json 側だけに置き、二重管理しない。
 */

export interface PinnacleStageDef {
  id: string;
  /** 段の表示名（記録・通知用） */
  name: string;
  /** 通知ランク（03 §6）。最終段は S */
  rank: NotifyRank;
  /** 達成時に出す通知文（システムメッセージ書式） */
  notice: string;
  condition: Cond;
}

export interface PinnacleRouteDef {
  id: string;
  /** ルートの表示名（＝頂点の呼び名。剣聖・伝説の職人など） */
  name: string;
  desc: string;
  /** 最終段の達成で獲得する頂点称号（titles.json の id） */
  title: string;
  /**
   * 隠しルート（X-9、06 §3A「2ルートは伏せて、噂で匂わせる」）。
   * このフラグが立つまで目標一覧・社会画面のルート一覧に出ない。
   * 段の評価自体は常に行われる —— 隠しルートの段に達した通知が
   * そのまま「実績による発見」になる（段フラグが立てば一覧にも出る）
   */
  hidden?: { flag: string };
  /** 条件鎖。先頭から順に越えていく。末尾が頂点（Sランク） */
  stages: readonly PinnacleStageDef[];
}

/** 段の達成フラグキー（flags["pinnacle.<route>.<stage>"]） */
export function pinnacleFlag(routeId: string, stageId: string): string {
  return `pinnacle.${routeId}.${stageId}`;
}

/**
 * ルートが一覧表示可能か（X-9 隠しルート）。
 * 隠しルートは発見フラグが立つか、既にいずれかの段に達していれば見せる
 * （噂の発見＝フラグ、実績先行＝段フラグのどちらでも開く）
 */
export function isRouteVisible(route: PinnacleRouteDef, flags: Record<string, boolean>): boolean {
  if (!route.hidden) return true;
  if (flags[route.hidden.flag]) return true;
  return route.stages.some((s) => flags[pinnacleFlag(route.id, s.id)]);
}

/** 一覧表示用に、まだ見せないルートを落とした配列を返す */
export function visiblePinnacles(
  routes: readonly PinnacleRouteDef[],
  flags: Record<string, boolean>,
): PinnacleRouteDef[] {
  return routes.filter((r) => isRouteVisible(r, flags));
}

/** 次に越えるべき段（全段達成済みなら null） */
export function nextStage(state: GameState, route: PinnacleRouteDef): PinnacleStageDef | null {
  return route.stages.find((s) => state.flags[pinnacleFlag(route.id, s.id)] !== true) ?? null;
}

/** ルートの完走（＝最終段に達した。頂点に至った） */
export function pinnacleReached(state: GameState, route: PinnacleRouteDef): boolean {
  const last = route.stages[route.stages.length - 1];
  return last !== undefined && state.flags[pinnacleFlag(route.id, last.id)] === true;
}

/** 頂点に至ったルートの id 一覧（伝記・年代記に載せる記録） */
export function reachedPinnacles(state: GameState, routes: readonly PinnacleRouteDef[]): string[] {
  return routes.filter((r) => pinnacleReached(state, r)).map((r) => r.id);
}

/** ルートの進行度（達成段数 / 全段数。進行表示用） */
export function routeProgress(
  state: GameState,
  route: PinnacleRouteDef,
): { done: number; total: number; complete: boolean } {
  const done = route.stages.filter(
    (s) => state.flags[pinnacleFlag(route.id, s.id)] === true,
  ).length;
  return { done, total: route.stages.length, complete: done === route.stages.length };
}

export interface PinnacleStageReached {
  route: PinnacleRouteDef;
  stage: PinnacleStageDef;
}

export interface PinnacleCheck {
  state: GameState;
  /** 今回新たに達した段（通知・イベント化は呼び出し側） */
  reached: PinnacleStageReached[];
  /** 「気配」を新たに立てた段のフラグキー */
  kehai: string[];
}

/**
 * 条件鎖の進行判定。各ルートについて「次の未達成段」だけを評価する
 * （前段を越えるまで後段は見ない。1ステップに各ルート最大1段）。
 *
 * 次段が S ランク（＝頂点）で条件に近づいたら「気配」を立てる：
 * 段の条件は明かさず kehai イベントとして出し、同じ段への気配は
 * 1日1回まで（notify.kehai にフラグキーを記録。resetDailyNotify で日次リセット）
 */
export function checkPinnacles(
  state: GameState,
  routes: readonly PinnacleRouteDef[],
  time: TimeConfig,
): PinnacleCheck {
  let next = state;
  const reached: PinnacleStageReached[] = [];
  const kehai: string[] = [];
  for (const route of routes) {
    // 隠しルートは発見フラグが立つまで段を評価しない（X-9。
    // 通知・気配が先走ってルートの存在を漏らさないための門）
    if (!isRouteVisible(route, next.flags)) continue;
    const stage = nextStage(next, route);
    if (stage === null) continue;
    if (evaluate(stage.condition, next, time)) {
      next = { ...next, flags: { ...next.flags, [pinnacleFlag(route.id, stage.id)]: true } };
      reached.push({ route, stage });
      continue;
    }
    // 頂点（Sランク段）に近づいた合図。達成した段には気配を出さない
    if (stage.rank === "S") {
      const key = pinnacleFlag(route.id, stage.id);
      if (!next.notify.kehai.includes(key) && approaching(stage.condition, next)) {
        next = { ...next, notify: { ...next.notify, kehai: [...next.notify.kehai, key] } };
        kehai.push(key);
      }
    }
  }
  return { state: next, reached, kehai };
}
