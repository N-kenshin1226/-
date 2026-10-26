import type { ActionEvent } from "../events/index.js";
import type { Cond } from "../conditions/index.js";
import type { GameState } from "../state/types.js";

/**
 * 通知予算（docs/03_world_systems.md §6）。
 * 快感を薄めないために通知を絞る：
 * - S は1日（＝1セッション相当・仮決定 D-13）に1回まで
 * - A はそのまま、B は表示側で折りたたむ
 * - S候補に近づいたら条件を明かさず「気配」の一行だけ出す
 */

export type NotifyRank = "S" | "A" | "B";

/** イベント → 通知ランク。null は通知しない（ログのみ） */
export function rankOf(
  event: ActionEvent,
  titles: readonly { id: string; rank: NotifyRank }[],
): NotifyRank | null {
  switch (event.type) {
    case "titleGained":
      return titles.find((t) => t.id === event.id)?.rank ?? event.rank;
    case "tierUp":
      return "A";
    case "died":
      return "B";
    case "combatEnded":
      return "B";
    case "workRecorded":
      return "B";
    case "kehai":
      return "A";
    case "pinnacleStageReached":
      // 段ごとの指定ランク（06 §3A。中間段はB/A、頂点はS）
      return event.rank;
    // 勝負所の行事（X-10）：打診は日常に混ざる知らせ（B）。
    // 勝負所の結果は物語を動かす —— 勝ちはA、負けはB（負けも記録される）
    case "occasionOffered":
      return "B";
    case "occasionAttempted":
      return event.won ? "A" : "B";
    default:
      return null; // slept / wakeReport / gainApplied / actionPerformed
  }
}

/**
 * S通知の予算を消費する。当日既にSを出していれば allowed=false（抑制）。
 * state.notify は sleep（日付が変わる）でリセットされる。
 */
export function consumeS(state: GameState): { state: GameState; allowed: boolean } {
  if (state.notify.sToday) return { state, allowed: false };
  return {
    state: { ...state, notify: { ...state.notify, sToday: true } },
    allowed: true,
  };
}

/** 日付が変わったら通知予算をリセット（step の sleep/rest で呼ぶ） */
export function resetDailyNotify(state: GameState): GameState {
  if (state.notify.day === state.time.day) return state;
  return { ...state, notify: { day: state.time.day, sToday: false, kehai: [] } };
}

/**
 * S候補への接近度。「あと少し」を数値条件の8割で近似する
 * （counter / skill / stat / work の数値条件だけ評価。真偽系は近さが定義できないので false）
 */
function near(cur: number, c: { gte?: number; lte?: number; eq?: number }): boolean {
  const target = c.gte ?? c.eq;
  if (target === undefined) return cur > 0;
  return cur > 0 && cur >= target * 0.8 && cur < target;
}

export function approaching(cond: Cond, state: GameState): boolean {
  if ("counter" in cond) return near(state.counters[cond.counter] ?? 0, cond);
  if ("skill" in cond) return near(state.player.skills[cond.skill]?.value ?? 0, cond);
  if ("stat" in cond) return near(state.player.stats[cond.stat] ?? 0, cond);
  if ("money" in cond) return near(state.player.money, cond.money);
  if ("and" in cond) return cond.and.every((c) => approaching(c, state));
  if ("or" in cond) return cond.or.some((c) => approaching(c, state));
  if ("not" in cond || "within" in cond || "work" in cond || "time" in cond || "flag" in cond)
    return false;
  return false;
}

/**
 * Sランク称号の接近を判定して「気配」イベントを出す。
 * 同じ称号への気配は1日1回まで（notify.kehai に記録）。
 */
export function emitKehai(
  state: GameState,
  titles: readonly { id: string; rank: NotifyRank; condition: Cond }[],
): { state: GameState; fired: string[] } {
  const fired: string[] = [];
  let next = state;
  for (const def of titles) {
    if (def.rank !== "S") continue;
    if (next.titles.includes(def.id)) continue;
    if (next.notify.kehai.includes(def.id)) continue;
    if (!approaching(def.condition, next)) continue;
    next = { ...next, notify: { ...next.notify, kehai: [...next.notify.kehai, def.id] } };
    fired.push(def.id);
  }
  return { state: next, fired };
}
