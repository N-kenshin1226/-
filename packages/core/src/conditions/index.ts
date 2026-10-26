import { matchesWork } from "../ledger/index.js";
import type { GameState, StatId } from "../state/types.js";
import {
  describe as describeTime,
  type MoonPhase,
  type TimeConfig,
  type TimeOfDay,
} from "../time/index.js";

/**
 * 条件DSL（docs/03_world_systems.md §7、02 §9）。
 * 称号・派生スキル・認定・隠し要素の条件をコードではなくデータで書く。
 * 評価器は純関数 evaluate(cond, state, time) → boolean。
 */

/** 数値の比較（gte/lte/eq は複数指定で AND。全部省略は「存在する」で true） */
export interface Compare {
  gte?: number;
  lte?: number;
  eq?: number;
}

export type Cond =
  /** カウンタ（kill.species.wolf など）の数値比較 */
  | ({ counter: string } & Compare)
  /** フラグ（省略時 eq=true） */
  | { flag: string; eq?: boolean }
  /** スキル値の比較 */
  | ({ skill: string } & Compare)
  /** 基礎能力の比較 */
  | ({ stat: StatId } & Compare)
  /** 所持金の比較（X-10。打診・行事の「身なり」条件に使う） */
  | { money: Compare }
  /** 作品台帳の条件（03 §3/§7）：kind 限定・最高ティア・件数 */
  | { work: { kind?: string; tierGte?: number; count?: { atLeast: number } } }
  /** 時刻・暦（describe の項目） */
  | {
      time: {
        day?: Compare;
        age?: Compare;
        year?: Compare;
        dayOfSeason?: Compare;
        weekday?: number | number[];
        season?: number;
        moon?: MoonPhase;
        timeOfDay?: TimeOfDay;
      };
    }
  | { and: Cond[] }
  | { or: Cond[] }
  | { not: Cond }
  /** 直近 days 日間（当日を含む）に kind（×target）の行動が atLeast 回以上 */
  | { within: { days: number; kind: string; target?: string; atLeast: number } };

function compareNum(v: number, c: Compare): boolean {
  if (c.gte !== undefined && v < c.gte) return false;
  if (c.lte !== undefined && v > c.lte) return false;
  if (c.eq !== undefined && v !== c.eq) return false;
  return true;
}

export function evaluate(cond: Cond, state: GameState, time: TimeConfig): boolean {
  if ("and" in cond) return cond.and.every((c) => evaluate(c, state, time));
  if ("or" in cond) return cond.or.some((c) => evaluate(c, state, time));
  if ("not" in cond) return !evaluate(cond.not, state, time);
  if ("within" in cond) {
    const w = cond.within;
    const cutoff = state.time.day - w.days + 1;
    const n = state.actionLog.filter(
      (e) =>
        e.day >= cutoff && e.kind === w.kind && (w.target === undefined || e.target === w.target),
    ).length;
    return n >= w.atLeast;
  }
  if ("counter" in cond) return compareNum(state.counters[cond.counter] ?? 0, cond);
  if ("flag" in cond) return (state.flags[cond.flag] ?? false) === (cond.eq ?? true);
  if ("skill" in cond) return compareNum(state.player.skills[cond.skill]?.value ?? 0, cond);
  if ("stat" in cond) return compareNum(state.player.stats[cond.stat], cond);
  if ("money" in cond) return compareNum(state.player.money, cond.money);
  if ("work" in cond) {
    return matchesWork(state.ledger, cond.work);
  }
  if ("time" in cond) {
    const t = cond.time;
    const d = describeTime(state.time, time);
    if (t.day !== undefined && !compareNum(state.time.day, t.day)) return false;
    if (t.age !== undefined && !compareNum(d.age, t.age)) return false;
    if (t.year !== undefined && !compareNum(d.year, t.year)) return false;
    if (t.dayOfSeason !== undefined && !compareNum(d.dayOfSeason, t.dayOfSeason)) return false;
    if (t.weekday !== undefined) {
      const days = Array.isArray(t.weekday) ? t.weekday : [t.weekday];
      if (!days.includes(d.weekday)) return false;
    }
    if (t.season !== undefined && d.season !== t.season) return false;
    if (t.moon !== undefined && d.moon !== t.moon) return false;
    if (t.timeOfDay !== undefined && d.timeOfDay !== t.timeOfDay) return false;
    return true;
  }
  // 網羅性チェック（新しい演算を足したらここで型エラーになる）
  const _exhaustive: never = cond;
  return _exhaustive;
}
