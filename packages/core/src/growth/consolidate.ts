import type { GameState, StatId } from "../state/types.js";
import { rustedValue, type RustConfig } from "./rust.js";

const tplRust = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

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
  /**
   * 1晩に定着できる全スキル合計の上限（×睡眠の質）。
   * 単一集中と多角化の総成長差を抑えるための上限（02 §10 方針間の差）
   */
  nightlyCapTotal: number;
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
  /** 宿代（G）。省略時は無料 */
  innCost?: Record<InnRank, number>;
  /** 錆の設定（02 §7）。省略時は錆びない */
  rust?: RustConfig;
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
  /** 翌日の追い風 */
  tailwinds: { id: string; label: string; direction: "tailwind" | "headwind" }[];
  /** 疲労の推移（睡眠でどれだけ回復したか） */
  fatigue: { from: number; to: number };
  /** この睡眠でオーバーワークに陥った／継続中 */
  overwork: { active: boolean; became: boolean };
  /** 行動0回で眠った休養日か */
  restDay: boolean;
}

export interface ConsolidateResult {
  state: GameState;
  report: WakeReport;
}

/**
 * 全スキルの pending を定着させる。pending は「1スキルごと」に上限を適用する。
 * opts.capFactor: オーバーワーク等で上限ごと下げる倍率（省略時 1）
 * opts.qualityOverride: rest コマンドなど宿・夕食を通さない場合の質の直接指定
 * opts.names: 起床ログに出すスキル表示名（省略時はID）
 */
export function consolidateSleep(
  state: GameState,
  inn: InnRank,
  dinner: boolean,
  cfg: SleepConfig,
  opts?: { capFactor?: number; qualityOverride?: number; names?: Record<string, string> },
): ConsolidateResult {
  const quality =
    opts?.qualityOverride !== undefined
      ? Math.min(cfg.qualityMax, Math.max(cfg.qualityMin, opts.qualityOverride))
      : sleepQuality(inn, dinner, cfg);
  const cap = cfg.nightlyCapPerSkill * quality * (opts?.capFactor ?? 1);
  const totalCap = cfg.nightlyCapTotal * quality * (opts?.capFactor ?? 1);
  const lines: WakeLine[] = [];

  // 第1段階：スキルごとの上限まで定着
  const appliedMap = new Map<string, number>();
  let appliedSum = 0;
  for (const [id, prev] of Object.entries(state.player.skills)) {
    if (prev.pending <= 0) continue;
    const applied = Math.min(prev.pending, cap);
    appliedMap.set(id, applied);
    appliedSum += applied;
  }
  // 第2段階：合計上限を超えたら比例配分で縮める
  const scale = appliedSum > totalCap && appliedSum > 0 ? totalCap / appliedSum : 1;

  const surprises: string[] = [];
  const skills = { ...state.player.skills };

  // 錆（02 §7）：猶予を超えて使っていないスキルは睡眠時に下がる
  if (cfg.rust) {
    const total = Object.values(skills).reduce((s, sk) => s + sk.value, 0);
    for (const [id, prev] of Object.entries(skills)) {
      const idle = state.time.day - prev.lastUsedDay;
      const decayed = rustedValue(prev.value, prev.peak, idle, total, cfg.rust);
      if (decayed < prev.value) {
        skills[id] = { ...prev, value: decayed };
        surprises.push(
          tplRust(cfg.rust.texts.rusted, {
            name: opts?.names?.[id] ?? id,
            loss: (prev.value - decayed).toFixed(1),
          }),
        );
      }
    }
  }

  for (const [id, prev0] of Object.entries(skills)) {
    const applied = (appliedMap.get(id) ?? 0) * scale;
    if (prev0.pending <= 0) continue;
    const carryover = (prev0.pending - applied) * cfg.carryoverRatio;
    const from = prev0.value;
    // peak 未満の再習得は relearnFactor 倍速い（身体が覚えている）。
    // peak に達した分で倍率を打ち切り、残りは1倍で継続する
    let to = from + applied;
    if (cfg.rust && applied > 0 && from < prev0.peak) {
      const room = prev0.peak - from;
      const gainInRoom = Math.min(applied * cfg.rust.relearnFactor, room);
      const remaining = applied - gainInRoom / cfg.rust.relearnFactor;
      to = from + gainInRoom + remaining;
      surprises.push(
        tplRust(cfg.rust.texts.relearning, {
          name: opts?.names?.[id] ?? id,
          loss: "",
        }),
      );
    }
    skills[id] = {
      ...prev0,
      value: to,
      peak: Math.max(prev0.peak, to),
      pending: carryover,
      potential: prev0.potential * Math.pow(1 - cfg.potentialDecayPerPoint, applied),
    };
    if (to > from) lines.push({ kind: "skill", id, from, to, delta: to - from });
  }

  // 伸びの小さい順（02 §3：最後に予想外の1行が来る並び）
  lines.sort((a, b) => a.delta - b.delta);

  return {
    state: { ...state, player: { ...state.player, skills } },
    report: {
      quality,
      inn,
      dinner,
      lines,
      surprises,
      tailwinds: [],
      fatigue: { from: state.player.fatigue, to: state.player.fatigue },
      overwork: { active: false, became: false },
      restDay: false,
    },
  };
}

/** stats 定着の行を追加する拡張点（T-08 の基礎能力が使う） */
export function statLine(id: StatId, from: number, to: number): WakeLine {
  return { kind: "stat", id, from, to, delta: to - from };
}
