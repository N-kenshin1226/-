import { timingEngine, type TimingConfig, type TimingInput, type TimingState } from "./timing.js";
import type { MiniGame } from "./types.js";

/**
 * 演奏ミニゲーム（タイミングエンジンの皮）。
 * 楽曲の拍に合わせて音を重ねる。全部乗れば「名演」。
 *
 * スキルの効き方（03 §2）：判定窓が広がるだけで、勝率の直接倍率は付けない。
 * Lv20 での拍子可視化・Lv40 のフレーズ候補表示は皮の演出側にあたり、
 * ここでは unlocks として閾値だけ保持する。
 */

export interface PerformanceConfig extends TimingConfig {
  /** 品質 = qualityBase + score × qualityScale（0〜100 でクランプ） */
  qualityBase: number;
  qualityScale: number;
  /** 全拍を乗せきったときの「名演」フラグ */
  criticalFlag: string;
  /** 命中率がこの値未満なら失敗フラグ（演奏が成立しない） */
  failBelowScore: number;
  failFlag: string;
  /** 将来の解放要素（拍子可視化・フレーズ候補）のスキル閾値 */
  unlocks: { seeMeterAt: number; seePhraseAt: number };
}

export interface PerformanceResult {
  /** 演奏の品質 0〜100 */
  quality: number;
  flags: string[];
  hits: number;
  total: number;
}

export function performanceGame(
  cfg: PerformanceConfig,
): MiniGame<TimingInput, TimingState, PerformanceResult> {
  const engine = timingEngine(cfg);
  return {
    init: (ctx) => engine.init(ctx),
    tick: (s, i) => engine.tick(s, i),
    autoplay: (ctx) => engine.autoplay(ctx),
    result(state) {
      const r = engine.result(state);
      const quality = Math.max(
        0,
        Math.min(100, Math.round((cfg.qualityBase + r.score * cfg.qualityScale) * 10) / 10),
      );
      const flags: string[] = [];
      if (r.hits === r.total && r.total > 0) flags.push(cfg.criticalFlag);
      if (r.score < cfg.failBelowScore) flags.push(cfg.failFlag);
      return { quality, flags, hits: r.hits, total: r.total };
    },
  };
}
