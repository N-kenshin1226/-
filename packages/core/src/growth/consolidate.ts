import type { GameState, StatId } from "../state/types.js";

/**
 * 睡眠による定着と起床ログ（docs/02_growth_system.md §3、§6）。
 *
 * - 未定着経験は睡眠時にまとめて数値へ変換する
 * - 1晩の定着上限 = 基礎上限 × 睡眠の質（宿ランク × 夕食の2要因）
 * - 上限超過分は carryoverRatio が翌日に持ち越され、残りは失われる
 * - 値が上がったら peak を更新し、素質を減らす（§6）
 */

export type InnRank = "cheap" | "normal" | "good";

export interface SleepConfig {
  /** 1スキルあたり1晩の基礎定着上限 */
  nightlyCapPerSkill: number;
  /** 上限超過分の持ち越し割合 */
  carryoverRatio: number;
  /** 宿ランク係数 */
  innFactors: Record<InnRank, number>;
  /** 夕食係数（あり/なし） */
  dinnerFactors: { withDinner: number; noDinner: number };
  /** 睡眠の質の下限・上限 */
  qualityMin: number;
  qualityMax: number;
  /** スキル値が 1 上がるごとの素質の減少率（§6：現在値の約1%） */
  potentialDecayPerPoint: number;
}

/** 睡眠の質 = 宿ランク係数 × 夕食係数（0.6〜1.2 にクランプ） */
export function sleepQuality(inn: InnRank, dinner: boolean, cfg: SleepConfig): number {
  const q =
    cfg.innFactors[inn] * (dinner ? cfg.dinnerFactors.withDinner : cfg.dinnerFactors.noDinner);
  return Math.min(cfg.qualityMax, Math.max(cfg.qualityMin, q));
}

/** 起床ログの1行（スキル or 基礎能力の変化） */
export interface WakeLine {
  kind: "skill" | "stat";
  id: string;
  from: number;
  to: number;
  delta: number;
}

/** 起床ログの構造化データ。UI側はこれを整形する（文字列は core が組み立てない） */
export interface WakeReport {
  quality: number;
  inn: InnRank;
  dinner: boolean;
  /** 変化を伸びの小さい順に */
  lines: WakeLine[];
  /**
   * 「予想外の1行」の枠（派生の芽・錆の回復・気配など）。
   * 現時点では常に空。該当する機能が実装されたら末尾に置く。
   */
  surprises: string[];
  /** 翌日の追い風（T-07 で充填） */
  tailwinds: { id: string; direction: "tailwind" | "headwind" }[];
}

export interface ConsolidateResult {
  state: GameState;
  report: WakeReport;
}

/** 全スキルの pending を定着させる。pending は「1スキルごと」に上限を適用する */
export function consolidateSleep(
  state: GameState,
  inn: InnRank,
  dinner: boolean,
  cfg: SleepConfig,
): ConsolidateResult {
  const quality = sleepQuality(inn, dinner, cfg);
  const cap = cfg.nightlyCapPerSkill * quality;
  const lines: WakeLine[] = [];

  const skills = { ...state.player.skills };
  for (const [id, prev] of Object.entries(skills)) {
    if (prev.pending <= 0) continue;
    const applied = Math.min(prev.pending, cap);
    const carryover = (prev.pending - applied) * cfg.carryoverRatio;
    const from = prev.value;
    const to = from + applied;
    skills[id] = {
      ...prev,
      value: to,
      peak: Math.max(prev.peak, to),
      pending: carryover,
      potential: prev.potential * Math.pow(1 - cfg.potentialDecayPerPoint, applied),
    };
    if (applied > 0) lines.push({ kind: "skill", id, from, to, delta: applied });
  }

  // 伸びの小さい順（02 §3：最後に予想外の1行が来る並び）
  lines.sort((a, b) => a.delta - b.delta);

  return {
    state: { ...state, player: { ...state.player, skills } },
    report: { quality, inn, dinner, lines, surprises: [], tailwinds: [] },
  };
}

/** stats 定着の行を追加する拡張点（T-08 の基礎能力が使う） */
export function statLine(id: StatId, from: number, to: number): WakeLine {
  return { kind: "stat", id, from, to, delta: to - from };
}
