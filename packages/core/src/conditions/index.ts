import { matchesWork } from "../ledger/index.js";
import type { GameState, StatId } from "../state/types.js";
import {
  describe as describeTime,
  type MoonPhase,
  type TimeConfig,
  type TimeOfDay,
} from "../time/index.js";
import { weatherOf, type WeatherConfig } from "../weather/index.js";

/**
 * 条件DSL（docs/03_world_systems.md §7、02 §9）。
 * 称号・派生スキル・認定・隠し要素の条件をコードではなくデータで書く。
 * 評価器は純関数 evaluate(cond, state, time, env?) → boolean。
 */

/**
 * 条件の評価環境（X-13）：state から導出する語彙の設定。
 * {weather} のように「今日の天候」という state に無い語彙を評価するには、
 * その判定に必要なコンテンツ設定をここから受け取る。
 * env 省略時・該当の設定が無い世界では、その語彙の条件は成立しない（偽）。
 */
export interface CondEnv {
  /** 天候表（weather.json 由来＋balance.weather。{weather} 条件の判定に使う） */
  weather?: WeatherConfig;
}

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
  /** 所持金の比較（X-9 商王ルートの「いま持っている富」／X-10 打診・行事の「身なり」条件。
      売上の累計は counter の money.earned を使う） */
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
  | { within: { days: number; kind: string; target?: string; atLeast: number } }
  /**
   * 今日の天候（X-13、docs/03 §5「時刻・天候・月齢…の組み合わせ」）。
   * weather.json の kind id の集合一致（配列で複数指定可）。
   * 天候表（env.weather）の無い世界では成立しない
   */
  | { weather: string | string[] }
  /**
   * 世界の危機の進行（F-05、docs/08）：active は「進行中の危機がある」、
   * minStage は段階の下限（進行中でない世界では成立しない）。
   * 出来事・打診が「危機の気配」に応じて現れる条件に使う
   */
  | { crisis: { active?: boolean; minStage?: number } };

function compareNum(v: number, c: Compare): boolean {
  if (c.gte !== undefined && v < c.gte) return false;
  if (c.lte !== undefined && v > c.lte) return false;
  if (c.eq !== undefined && v !== c.eq) return false;
  return true;
}

export function evaluate(cond: Cond, state: GameState, time: TimeConfig, env?: CondEnv): boolean {
  if ("and" in cond) return cond.and.every((c) => evaluate(c, state, time, env));
  if ("or" in cond) return cond.or.some((c) => evaluate(c, state, time, env));
  if ("not" in cond) return !evaluate(cond.not, state, time, env);
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
  if ("crisis" in cond) {
    const c = state.crisis;
    const active = c !== null && c.outcome === "ongoing";
    if (cond.crisis.active !== undefined && active !== cond.crisis.active) return false;
    // 段階条件は進行中の世界にだけ効く（未抽選・決着済みは成立しない）
    if (cond.crisis.minStage !== undefined && (!active || c!.stageIndex < cond.crisis.minStage)) {
      return false;
    }
    return true;
  }
  if ("weather" in cond) {
    // 今日の天候（X-13）：seed+day から導出するので state.rng は消費しない。
    // 天候表の無い世界（env.weather 未設定）では天候条件は成立しない
    if (env?.weather === undefined) return false;
    const today = weatherOf(state.seed, state.time.day, env.weather, time);
    const ids = Array.isArray(cond.weather) ? cond.weather : [cond.weather];
    return ids.includes(today.kind.id);
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
