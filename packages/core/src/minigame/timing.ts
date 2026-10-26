import type { MiniGame } from "./types.js";

/**
 * タイミングエンジン（03 §2「判定窓に合わせて押す」）。
 * 一定間隔で来る「拍」に対し、プレイヤーが押した時刻が判定窓内かを評価する。
 * 判定は時間ベースの数値窓（ms相当の数値）で、フレームには依存しない。
 */

export interface TimingConfig {
  /** 拍の数 */
  beats: number;
  /** 拍の間隔（ms 相当） */
  beatIntervalMs: number;
  /** 判定窓の半径 = windowBaseMs + windowPerSkillMs × skill */
  windowBaseMs: number;
  windowPerSkillMs: number;
}

export interface TimingInput {
  /** 押した時刻（ゲーム開始からの経過 ms 相当） */
  at: number;
}

export interface TimingState {
  /** 拍の中心時刻列 */
  beats: number[];
  /** 判定窓の半径 */
  halfWidth: number;
  /** 次に判定される拍の index */
  cursor: number;
  hits: number;
  done: boolean;
}

export interface TimingResult {
  hits: number;
  total: number;
  /** 0..1。全拍成功で 1 */
  score: number;
}

export function timingEngine(cfg: TimingConfig): MiniGame<TimingInput, TimingState, TimingResult> {
  return {
    init(ctx) {
      const beats = Array.from({ length: cfg.beats }, (_, i) => (i + 1) * cfg.beatIntervalMs);
      return {
        beats,
        halfWidth: cfg.windowBaseMs + cfg.windowPerSkillMs * ctx.skill,
        cursor: 0,
        hits: 0,
        done: false,
      };
    },
    tick(state, input) {
      if (state.done) return state;
      const beat = state.beats[state.cursor];
      if (beat === undefined) return { ...state, done: true };
      const hit = Math.abs(input.at - beat) <= state.halfWidth;
      const cursor = state.cursor + 1;
      return {
        ...state,
        cursor,
        hits: state.hits + (hit ? 1 : 0),
        done: cursor >= state.beats.length,
      };
    },
    result(state) {
      return {
        hits: state.hits,
        total: state.beats.length,
        score: state.beats.length === 0 ? 0 : state.hits / state.beats.length,
      };
    },
    autoplay(ctx) {
      // 上手い人の入力列：各拍の中心に、快適度に応じたズレを乗せる
      // （快適度 = min(1, skill/40)。素人は窓の縁ギリギリ、達人は正中）
      const s = this.init(ctx);
      const comfort = Math.min(1, Math.max(0, ctx.skill / 40));
      return s.beats.map((beat, i) => {
        const jitter = s.halfWidth * 0.6 * (1 - comfort) * (i % 2 === 0 ? 1 : -1);
        return { at: beat + jitter };
      });
    },
  };
}
