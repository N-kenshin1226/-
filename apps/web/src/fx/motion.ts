/**
 * F-03 ミニゲームの動き —— 表示層の純粋な計算だけを集める。
 * ルール（判定・品質・勝敗）は core が握る。ここにあるのは
 * 「core が返した状態をどう見せるか」のための算術だけ。
 * DOM・乱数には一切触れない（火花の向きも拍の番号から決める）。
 */
import type { BoardState, DealState } from "@trace/core";

/** 1拍ごとの成否（画面が覚える印。core は命中数だけを持つ） */
export type BeatMark = "hit" | "miss";

/** カーソル位置の拍の見え方 */
export interface BeatPhase {
  /** 判定対象の拍の時刻。全拍済みなら null */
  at: number | null;
  /** 時刻差 elapsed - at（押す側の誤差。+ は遅れ） */
  delta: number;
  /** 判定窓の内側（|delta| <= halfWidth） */
  armed: boolean;
  /** 窓を過ぎたのに未判定（遅れ気味。早押しの救済に見せる） */
  late: boolean;
  /** 窓に入るまでの残り時間（負なら窓を過ぎた） */
  until: number;
}

/**
 * 今の拍の局面（タイミング系）。判定は `|at - beat| <= halfWidth` と同じ形を
 * そのまま画面に見せる ―― 窓の内側・外れ・遅れを色で分けるための情報。
 */
export function beatPhase(
  elapsed: number,
  beats: readonly number[],
  halfWidth: number,
  cursor: number,
): BeatPhase {
  const at = beats[cursor] ?? null;
  if (at === null) return { at: null, delta: 0, armed: false, late: false, until: 0 };
  const delta = elapsed - at;
  const armed = Math.abs(delta) <= halfWidth;
  return {
    at,
    delta,
    armed,
    late: delta > halfWidth,
    until: at - halfWidth - elapsed,
  };
}

/**
 * 縮む輪の進行（0 → 1）。前の拍の時刻から今の拍の時刻までを一周とし、
 * 輪は 1（外側）から 0（的）へ収まる。範囲外はクランプする。
 */
export function ringProgress(elapsed: number, beatAt: number, prevAt: number): number {
  const span = beatAt - prevAt;
  if (span <= 0) return 1;
  const p = (elapsed - prevAt) / span;
  return Math.min(1, Math.max(0, p));
}

/** 末尾から数えた連続命中数（コンボ表示用） */
export function comboCount(marks: readonly BeatMark[]): number {
  let n = 0;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i] !== "hit") break;
    n++;
  }
  return n;
}

/**
 * 火花の飛ぶ向き（決定的）。拍の番号から固定表で取るので
 * 同じ拍にはいつも同じ散り方をする ―― 乱数は使わない。
 */
const SPARK_DIRS: readonly (readonly [number, number])[] = [
  [1, -0.9],
  [-1, -0.8],
  [0.6, -1.2],
  [-0.7, -1.1],
  [1.1, -0.3],
  [-1.1, -0.4],
];

export function sparkDirs(seedIndex: number): readonly (readonly [number, number])[] {
  // 拍ごとに表を回すだけ（3本ずつ・開始位置をずらす）
  const off = (seedIndex * 2) % SPARK_DIRS.length;
  return [0, 1, 2].map((k) => SPARK_DIRS[(off + k) % SPARK_DIRS.length]!);
}

/** 盤面：直前の開けとの差分（アニメーション対象のセル番号） */
export function revealedIndex(prev: BoardState | null, next: BoardState): number | null {
  if (prev === null) return null;
  for (let i = 0; i < next.cells.length; i++) {
    if (next.cells[i]!.revealed && !prev.cells[i]!.revealed) return i;
  }
  return null;
}

/** 駆け引き：1手の応酬（与えた・受けた） */
export interface Clash {
  /** 相手に届いた量 */
  dealt: number;
  /** こちらが被った量 */
  taken: number;
}

export function clashDelta(prev: DealState, next: DealState): Clash {
  return {
    dealt: Math.max(0, prev.opponentHp - next.opponentHp),
    taken: Math.max(0, prev.playerHp - next.playerHp),
  };
}

/** 交渉相手の顔色（押し合いの局面 → シルエットの表情） */
export type NegoMood =
  /** 立ち上がり・互角 */
  | "even"
  /** こちらが押している（相手は焦る） */
  | "ahead"
  /** あいてが押している（相手はにやり） */
  | "behind"
  /** 決着：折れた */
  | "beaten"
  /** 決着：ほくそ笑む */
  | "smug";

export function negoMood(
  playerHp: number,
  opponentHp: number,
  maxHp: number,
  done: boolean,
  won: boolean | null,
): NegoMood {
  if (done) return won === true ? "beaten" : "smug";
  const edge = maxHp <= 0 ? 0 : (playerHp - opponentHp) / maxHp;
  if (edge >= 0.25) return "ahead";
  if (edge <= -0.25) return "behind";
  return "even";
}

/** 時刻 → レール上の位置（%）。BeatRail と浮き文字の差し位置を同じ尺で取る */
export function railXPct(t: number, beats: readonly number[]): number {
  const interval = beats.length > 1 ? beats[1]! - beats[0]! : (beats[0] ?? 600);
  const span = (beats[beats.length - 1] ?? interval) + interval * 0.5;
  return Math.min(100, Math.max(0, (t / span) * 100));
}
