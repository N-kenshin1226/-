import type { Rng } from "../rng/index.js";
import { createRng } from "../rng/index.js";

/**
 * MiniGame<Input, State, Result> — すべてのミニゲームの共通型（03 §2）。
 *
 * - init(ctx)   : コンテキストから初期状態を作る。乱数は seed から fork する
 * - tick(s, in) : 入力を1つ受けて次の状態を返す純関数。State はシリアライズ可能なプレーン値
 * - result(s)   : 終了状態から結果（作品・勝敗など）を取り出す
 * - autoplay    : 入力列の自動生成。リプレイ・テスト・簡易判定に使う。
 *                 「上手い人の入力」を返す（簡易判定の係数を掛けるのは呼び出し側）
 */
export interface MiniGameCtx {
  /** 主スキルの値（判定窓・ヒント・手札などの「快適さ」を決める） */
  skill: number;
  /** 派生・関連スキルの値（オプション） */
  skills?: Record<string, number>;
  /** 材料・装備などのコンテキスト */
  materials?: Record<string, unknown>;
  /** 注文条件（kind 依存） */
  order?: unknown;
  /** ゲーム内の抽選用シード */
  seed: string;
}

export interface MiniGame<Input, State, Result> {
  init(ctx: MiniGameCtx): State;
  tick(state: State, input: Input): State;
  result(state: State): Result;
  autoplay(ctx: MiniGameCtx): Input[];
}

/** ctx.seed から用途別の乱数を fork する */
export function ctxRng(ctx: MiniGameCtx, label: string): Rng {
  return createRng(ctx.seed).fork(label);
}
