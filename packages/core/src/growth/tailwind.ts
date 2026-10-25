import type { Rng } from "../rng/index.js";
import type { GameState } from "../state/types.js";

/**
 * 今日の追い風（docs/02_growth_system.md §4）。
 *
 * 睡眠時に翌日の追い風・逆風を1〜2種抽選する。直近の行動の偏りを見て、
 * 偏っている分野には逆風が、あまり触っていない分野には追い風が出やすい
 * よう重みを付ける（毎日最適な行動が変わり、固定ルーチンを崩す）。
 *
 * 種類の定義は packages/content/tailwinds.json。係数は balance.json
 * の tailwind 節（TailwindConfig）。
 */

export type WindDirection = "tailwind" | "headwind";

/** tailwinds.json の1件（content 側は同じ形を zod で検証） */
export interface TailwindDef {
  id: string;
  /** 表示名（「《鍛冶》の伸び ↑」など） */
  label: string;
  /** 対象：スキル（skill.value に効く）または行動種別（kind に効く） */
  target: { kind: "skill" | "action"; id: string };
  direction: WindDirection;
}

/** balance.json tailwind 節＋defs をまとめた実行時設定 */
export interface TailwindConfig {
  defs: readonly TailwindDef[];
  tailwindFactor: number;
  headwindFactor: number;
  /** 「直近の偏り」を数える日数（当日を含む） */
  recentDays: number;
  /** 逆風の重み = 1 + headwindBiasK × 直近の回数 */
  headwindBiasK: number;
  /** 追い風の重み = 1 + tailwindBoostK × (最多回数 − その分野の回数) */
  tailwindBoostK: number;
  /** 抽選する種数の範囲 */
  drawMin: number;
  drawMax: number;
}

/** 抽選結果。GameState.today.winds に保存して1日有効にする */
export interface RolledWind {
  id: string;
  label: string;
  direction: WindDirection;
  factor: number;
  target: { kind: "skill" | "action"; id: string };
}

/** 直近 recentDays 日（当日を含む）の、その対象への行動回数 */
function recentCount(state: GameState, target: TailwindDef["target"], days: number): number {
  const cutoff = state.time.day - days + 1;
  return state.actionLog.filter(
    (e) =>
      e.day >= cutoff && (target.kind === "action" ? e.kind === target.id : e.target === target.id),
  ).length;
}

/** 睡眠時に翌日の追い風・逆風を1〜2種抽選する（決定論的・rng消費） */
export function rollTailwind(state: GameState, rng: Rng, cfg: TailwindConfig): RolledWind[] {
  const counts = new Map<string, number>();
  let maxCount = 0;
  for (const def of cfg.defs) {
    const c = recentCount(state, def.target, cfg.recentDays);
    counts.set(def.id, c);
    if (c > maxCount) maxCount = c;
  }

  const factor = (d: WindDirection) => (d === "tailwind" ? cfg.tailwindFactor : cfg.headwindFactor);

  const n = rng.int(cfg.drawMin, cfg.drawMax);
  const pool = cfg.defs.map((def) => {
    const c = counts.get(def.id) ?? 0;
    const weight =
      def.direction === "headwind"
        ? 1 + cfg.headwindBiasK * c
        : 1 + cfg.tailwindBoostK * (maxCount - c);
    return { item: def, weight };
  });

  const picked: RolledWind[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const def = rng.weighted(pool);
    picked.push({
      id: def.id,
      label: def.label,
      direction: def.direction,
      factor: factor(def.direction),
      target: def.target,
    });
    // 同じ種類は二度引かない
    const idx = pool.findIndex((p) => p.item.id === def.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked;
}

/**
 * その行動に効く追い風・逆風の積（W 項）。該当がなければ 1.0。
 * スキル対象は skill.id、行動対象は kind にマッチする。
 */
export function windFor(state: GameState, kind: string, skillId?: string): number {
  let w = 1;
  for (const wind of state.today.winds) {
    const match =
      wind.target.kind === "skill" ? wind.target.id === skillId : wind.target.id === kind;
    if (match) w *= wind.factor;
  }
  return w;
}
