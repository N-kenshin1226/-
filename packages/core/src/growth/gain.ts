/**
 * 経験獲得式（docs/02_growth_system.md §2）。
 *
 *   gain = B × C(Δ) × N × P × F × W × M
 *   実効gain = gain × (1 − skill/110)^1.5   （高値帯の逓減）
 *
 * 各項は別の純関数。係数はすべて balance.json の gain 節（GainConfig）。
 */

export interface GainConfig {
  /** B: 行動種別ごとの基礎量 */
  base: Record<string, number>;
  /** C(Δ) の制御点 [Δ, 値]。昇順。両端の外側は端点の値でクランプ */
  challengePoints: readonly (readonly [number, number])[];
  /** 訓練時の挑戦係数の上限（02 §8：安全だが上限0.6） */
  challengeTrainCap: number;
  /** N = 1 / (1 + noveltyK × 直近の反復回数) */
  noveltyK: number;
  /** 新規性を数える窓（直近N行動） */
  noveltyWindow: number;
  /** 失敗した行動は成功時のこの倍率 */
  failMultiplier: number;
  /** M（認定職・称号・師匠・書物の積）の上限 */
  modifierCap: number;
  /** 高値帯逓減: (1 − skill/diminishBase)^diminishExponent */
  diminishBase: number;
  diminishExponent: number;
  /** F = 1 − (fatigue/100)^2 × fatigueScale */
  fatigueScale: number;
}

/** Δ = 難度 − 現在のスキル値。区分線形＋端点クランプ */
export function challenge(
  delta: number,
  points: readonly (readonly [number, number])[],
  cap?: number,
): number {
  if (points.length === 0) return 0;
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  let c: number;
  if (delta <= first[0]) {
    c = first[1];
  } else if (delta >= last[0]) {
    c = last[1];
  } else {
    c = last[1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1] as readonly [number, number];
      const [x2, y2] = points[i] as readonly [number, number];
      if (delta <= x2) {
        c = y1 + ((delta - x1) / (x2 - x1)) * (y2 - y1);
        break;
      }
    }
  }
  return cap !== undefined ? Math.min(c, cap) : c;
}

/** N: 同じ相手・同じ行動の短時間の反復で減衰 */
export function novelty(repeats: number, k: number): number {
  return 1 / (1 + k * Math.max(0, repeats));
}

/** F: 疲労係数 */
export function fatigueFactor(fatigue: number, scale: number): number {
  const f = Math.min(Math.max(fatigue, 0), 100) / 100;
  return 1 - f * f * scale;
}

/** 高値帯の逓減。skill >= diminishBase で 0 */
export function diminishing(skill: number, cfg: GainConfig): number {
  const base = 1 - skill / cfg.diminishBase;
  if (base <= 0) return 0;
  return Math.pow(base, cfg.diminishExponent);
}

/** 行動種別ごとの基礎量 B（未定義の種別は 0） */
export function baseGain(kind: string, cfg: GainConfig): number {
  return cfg.base[kind] ?? 0;
}

export interface GainTerms {
  delta: number;
  repeats: number;
  potential: number;
  fatigue: number;
  /** W: 今日の追い風（T-07 で実装。今は常に 1.0） */
  wind?: number;
  /** M: 修正の積（上限 modifierCap） */
  modifiers?: number;
  /** 失敗した行動か */
  failed?: boolean;
  /** 訓練か（挑戦係数に challengeTrainCap がかかる） */
  isTraining?: boolean;
  /** 現在のスキル値（逓減に使う） */
  skill: number;
  /** 行動種別（B を引く） */
  kind: string;
}

export interface GainResult {
  /** pending に加える量 */
  amount: number;
  /** 各項の内訳（起床ログ・デバッグ用） */
  terms: {
    base: number;
    challenge: number;
    novelty: number;
    potential: number;
    fatigue: number;
    wind: number;
    modifiers: number;
    diminishing: number;
    fail: number;
  };
}

export function computeGain(input: GainTerms, cfg: GainConfig): GainResult {
  const base = baseGain(input.kind, cfg);
  const c = challenge(
    input.delta,
    cfg.challengePoints,
    input.isTraining ? cfg.challengeTrainCap : undefined,
  );
  const n = novelty(input.repeats, cfg.noveltyK);
  const p = Math.max(0, input.potential) / 100;
  const f = fatigueFactor(input.fatigue, cfg.fatigueScale);
  const w = input.wind ?? 1;
  const m = Math.min(input.modifiers ?? 1, cfg.modifierCap);
  const fail = input.failed ? cfg.failMultiplier : 1;
  const dim = diminishing(input.skill, cfg);

  const amount = base * c * n * p * f * w * m * fail * dim;
  return {
    amount,
    terms: {
      base,
      challenge: c,
      novelty: n,
      potential: p,
      fatigue: f,
      wind: w,
      modifiers: m,
      diminishing: dim,
      fail,
    },
  };
}

/** 直近 noveltyWindow 件の行動ログから、同じ kind×target の反復回数を数える */
export function recentRepeats(
  log: readonly { kind: string; target?: string }[],
  kind: string,
  target: string | undefined,
  window: number,
): number {
  const slice = window > 0 ? log.slice(-window) : log;
  return slice.filter((e) => e.kind === kind && e.target === target).length;
}
