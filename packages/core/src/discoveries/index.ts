import { evaluate, type Cond } from "../conditions/index.js";
import { createRng } from "../rng/index.js";
import type { GameState } from "../state/types.js";
import type { MoonPhase, TimeConfig } from "../time/index.js";

/**
 * 隠し要素（X-11、docs/03_world_systems.md §5）。
 *
 * 隠し要素は「時刻・天候・月齢・状態・所持品の組み合わせ」で出る。
 * 発見条件は既存の条件DSL（conditions）で書き、step のたびに評価する。
 * 見つけると `found.<id>` フラグが立つ —— この旗はアトムの unlock.flag・
 * 書物の棚条件・頂点ルートの hidden・認定条件が既に読んでいる刻印と同じ型
 * （place.old_forge → found.old_forge が雛形）。
 *
 * 「場所」は行動ログ近似（within の kind/target）で表す：
 * 旧街道の追い剥ぎと戦う＝旧街道を歩いた、という具合。「所持品」は台帳・
 * 称号・カウンタで近似する（持ち物システムは作らない）。
 *
 * 見逃し対策：見つけていない発見は `hint` が日替わりの噂に必ず混ざる
 * （dailyDiscoveryHint が今日の一件を選び、新聞・街の噂の欄が載せる）。
 * found.<id> が立った発見のヒントは二度と出ない。
 *
 * 周回変化：`seeded` に挙げた時刻パラメータは世界シード（state.seed）の
 * 独立した乱数列から引く —— 同じ世界＝同じ条件、新しい世界＝別の値。
 * state.rng は消費しない（行事の抽選と同じ仕組み）。
 */

/** 発見条件に世界シード由来で差し込む時刻パラメータの指定 */
export interface DiscoverySeeded {
  /** 曜日（0..daysPerWeek-1）を世界シードから抽選する */
  weekday?: boolean;
  /** 月齢を世界シードから抽選する */
  moon?: boolean;
  /** 季節（0..seasonsPerYear-1）を世界シードから抽選する */
  season?: boolean;
  /** 季節内の日（0..daysPerSeason-1）を世界シードから抽選する */
  dayOfSeason?: boolean;
}

/** 隠し要素の定義（content/discoveries.json の1件） */
export interface DiscoveryDef {
  /** 発見ID。found.<id> が自動で立つ（既存の found.* 参照と互換） */
  id: string;
  /** 発見の表示名（《》で包まず、表示側で包む） */
  name: string;
  /** 発見した瞬間の語り（通知行に続けて出す一行） */
  foundText: string;
  /**
   * 噂のヒント（voices の口調・1文）。`{weekday}`/`{moon}`/`{season}`/`{dayOfSeason}`
   * は世界シードの抽選値の表示名に置き換わる（seeded で引いたものだけ）
   */
  hint: string;
  /** 発見条件（条件DSL） */
  condition: Cond;
  /** 発見時に立つ追加の旗印（found.<id> 以外。lore・書物・称号の条件が読む） */
  setFlags: string[];
  /** 周回変化：世界シードから引く時刻パラメータ（条件に and で足される） */
  seeded?: DiscoverySeeded;
}

/** 発見フラグのキー（lore の unlock.flag などが参照する刻印と同じ型） */
export function foundFlagKey(id: string): string {
  return `found.${id}`;
}

/** 世界シードから引いた時刻パラメータ（同じ世界＝同じ値。state.rng は消費しない） */
export interface DiscoveryParams {
  weekday?: number;
  moon?: MoonPhase;
  season?: number;
  dayOfSeason?: number;
}

/**
 * 発見ごとの独立した乱数列で時刻パラメータを引く。
 * シードは「世界シード:discovery:<id>」— 行事の抽選と同じ仕組みで
 * 同じ世界なら常に同じ値が出る
 */
export function discoveryParams(
  def: DiscoveryDef,
  seed: string,
  time: TimeConfig,
): DiscoveryParams {
  const seeded = def.seeded;
  if (seeded === undefined) return {};
  const rng = createRng(`${seed}:discovery:${def.id}`);
  const params: DiscoveryParams = {};
  if (seeded.weekday === true) params.weekday = rng.int(0, time.daysPerWeek - 1);
  if (seeded.moon === true) params.moon = rng.pick(["new", "waxing", "full", "waning"] as const);
  if (seeded.season === true) params.season = rng.int(0, time.seasonsPerYear - 1);
  if (seeded.dayOfSeason === true) params.dayOfSeason = rng.int(0, time.daysPerSeason - 1);
  return params;
}

/** 引いた時刻パラメータを条件に and で足した実効条件（定義の condition は変えない） */
export function resolveDiscoveryCondition(def: DiscoveryDef, seed: string, time: TimeConfig): Cond {
  const p = discoveryParams(def, seed, time);
  const t: {
    weekday?: number;
    moon?: MoonPhase;
    season?: number;
    dayOfSeason?: { eq: number };
  } = {};
  if (p.weekday !== undefined) t.weekday = p.weekday;
  if (p.moon !== undefined) t.moon = p.moon;
  if (p.season !== undefined) t.season = p.season;
  if (p.dayOfSeason !== undefined) t.dayOfSeason = { eq: p.dayOfSeason };
  if (Object.keys(t).length === 0) return def.condition;
  return { and: [def.condition, { time: t }] };
}

/**
 * 隠し要素の判定（step の末尾に毎回呼ぶ）。
 * 見つけた発見は found.<id> と setFlags の旗を立て、found に返す
 * （呼び出し側が discovery イベントを発行する）。
 * found.<id> が既に立つ発見は二度と発火しない（冪等）。
 */
export function checkDiscoveries(
  state: GameState,
  defs: readonly DiscoveryDef[],
  time: TimeConfig,
): { state: GameState; found: DiscoveryDef[] } {
  let next = state;
  const found: DiscoveryDef[] = [];
  for (const def of defs) {
    if (next.flags[foundFlagKey(def.id)] === true) continue;
    const cond = resolveDiscoveryCondition(def, next.seed, time);
    if (!evaluate(cond, next, time)) continue;
    const flags = { ...next.flags, [foundFlagKey(def.id)]: true };
    for (const f of def.setFlags) flags[f] = true;
    next = { ...next, flags };
    found.push(def);
  }
  return { state: next, found };
}

/** まだ見つけていない発見（噂のヒントの供給元） */
export function unfoundDiscoveries(
  state: GameState,
  defs: readonly DiscoveryDef[],
): DiscoveryDef[] {
  return defs.filter((d) => state.flags[foundFlagKey(d.id)] !== true);
}

/**
 * 今日の噂に載せるヒントの発見（未発見から日替わりで1件・順番に回る）。
 * 未定義・全発見済みなら null。found.<id> が立つと出なくなる。
 */
export function dailyDiscoveryHint(
  state: GameState,
  defs: readonly DiscoveryDef[],
): DiscoveryDef | null {
  const pending = unfoundDiscoveries(state, defs);
  if (pending.length === 0) return null;
  return pending[state.time.day % pending.length]!;
}

/** ヒントの {…} に差し込む表示名（呼び出し側が cli.json の display から注入する） */
export interface DiscoveryHintNames {
  weekday?: (i: number) => string;
  moon?: (phase: MoonPhase) => string;
  season?: (i: number) => string;
  dayOfSeason?: (i: number) => string;
}

/**
 * ヒント文を完成させる（{weekday}/{moon}/{season}/{dayOfSeason} を
 * 世界シードの抽選値の表示名に置き換える。表示名が無いときは生の値を出す）
 */
export function discoveryHintText(
  def: DiscoveryDef,
  seed: string,
  time: TimeConfig,
  names: DiscoveryHintNames,
): string {
  const p = discoveryParams(def, seed, time);
  const vars: Record<string, string> = {};
  if (p.weekday !== undefined) {
    vars.weekday = names.weekday?.(p.weekday) ?? String(p.weekday);
  }
  if (p.moon !== undefined) vars.moon = names.moon?.(p.moon) ?? p.moon;
  if (p.season !== undefined) {
    vars.season = names.season?.(p.season) ?? String(p.season);
  }
  if (p.dayOfSeason !== undefined) {
    vars.dayOfSeason = names.dayOfSeason?.(p.dayOfSeason) ?? String(p.dayOfSeason);
  }
  return def.hint.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
