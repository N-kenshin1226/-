import { createRng } from "../rng/index.js";
import type { GameState } from "../state/types.js";
import { describe as describeTime, type TimeConfig } from "../time/index.js";

/**
 * 天候（X-13、docs/03_world_systems.md §2「日替わりの要因は2つまで」・§5）。
 *
 * その日の空は「世界シード×日付」の独立した乱数列で決まる ——
 * `createRng(`${seed}:weather:${day}`)`。行事の抽選（occasions）や
 * 危機の接点と同じ原則で、世界を進める乱数列（state.rng）は一切消費しない。
 * GameState にも欄を足さない：天候は seed+day から導出するだけの値。
 *
 * 季節ごとの重み（seasonWeights）で空の種類を抽選する ——
 * 雪は冬だけ、雨は春に多い、という具合。季節の求め方は暦（time/describe）と同じ。
 *
 * 効き方（「2つまで」の1枠）：
 * - 注文の報酬に天候ごとの係数が乗る（weatherPriceFactor。係数は balance.weather.orderPrice）
 * - 条件DSLの {weather} 語彙（conditions/index.ts が今日の空をここから引く）
 * - 起床レポート・新聞の風景の行（kind.lines を同じ乱数列から引く）
 */

/** 空の種類（content/weather.json の1件） */
export interface WeatherKind {
  /** 天候ID（条件DSLの {weather}・balance.weather.orderPrice のキーが指す） */
  id: string;
  /** 表示名（「晴れ」「雨」など。起床レポート・新聞に出す） */
  name: string;
  /**
   * 季節（0..seasonsPerYear-1）ごとの抽選の重み。
   * 0 は「その季節には出ない」（雪を冬だけにする、など）。
   * 配列の長さは balance.time.seasonsPerYear に合わせる（check:content で検証）
   */
  seasonWeights: readonly number[];
  /**
   * 風景の行の語彙（起床レポート・新聞・噂で使う1行文。
   * 文体は voices.json・narration.json の系統：淡々とした景物描写）
   */
  lines: readonly string[];
}

/** 天候の設定（weather.json の kinds ＋ balance.weather の係数を注入する形） */
export interface WeatherConfig {
  kinds: readonly WeatherKind[];
  /**
   * 注文の報酬に乗る日替わり係数：天候id → 仕事の kind → 係数。
   * キー "*" はその天候の全 kind の既定値。省略時は報酬に影響しない
   * （docs/03 §2「天候・相場・客の機嫌は2つまで」—— 天候はその1枠として
   * 注文の日替わり要因になる。特別注文と並ぶ「要因」なので係数は小さく保つ）
   */
  orderPrice?: Record<string, Record<string, number>>;
}

/** その日の天候（種類＋風景の行。行は lines から同じ乱数列で決定的に引く） */
export interface Weather {
  kind: WeatherKind;
  /** その日の風景の行（lines が空の種類では ""） */
  line: string;
}

/**
 * その日の天候を引く（世界シード×日付の独立した乱数列。state.rng は消費しない）。
 * 季節は暦（describe）から導出し、その季節の重みで種類を選ぶ。
 * 風景の行も同じ乱数列から引くので、同じ日・同じ世界では同じ天候と同じ行になる
 */
export function weatherOf(
  seed: string,
  day: number,
  cfg: WeatherConfig,
  time: TimeConfig,
): Weather {
  const season = describeTime({ day, action: 0 }, time).season;
  const rng = createRng(`${seed}:weather:${day}`);
  const kind = rng.weighted(
    cfg.kinds.map((k) => ({ item: k, weight: k.seasonWeights[season] ?? 0 })),
  );
  const line = kind.lines.length === 0 ? "" : rng.pick(kind.lines);
  return { kind, line };
}

/** 今日の天候（state の seed と日付から引く便り） */
export function weatherToday(state: GameState, cfg: WeatherConfig, time: TimeConfig): Weather {
  return weatherOf(state.seed, state.time.day, cfg, time);
}

/**
 * 天候による注文の報酬係数（X-13。注文の日替わり要因の1枠）。
 * 天候が未定義・係数が未設定の kind では 1（影響なし）。
 * 「雨の日は採掘系が渋い」「晴れの日は興行が人を呼ぶ」ような微変を想定
 */
export function weatherPriceFactor(
  state: GameState,
  cfg: WeatherConfig | undefined,
  time: TimeConfig,
  kind: string,
): number {
  if (cfg?.orderPrice === undefined) return 1;
  const w = weatherToday(state, cfg, time);
  const table = cfg.orderPrice[w.kind.id];
  return table?.[kind] ?? table?.["*"] ?? 1;
}
