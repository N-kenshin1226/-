import { timingEngine, type TimingConfig, type TimingInput, type TimingState } from "./timing.js";
import type { MiniGame } from "./types.js";

/**
 * 鍛冶ミニゲーム（タイミングエンジンの皮）。
 * 槌の拍に合わせて打つ。全部入れば会心作。
 *
 * スキルの効き方（03 §2）：判定窓が広がるだけで、勝率の直接倍率は付けない。
 * Lv20 での温度帯可視化・Lv40 の順序候補表示は皮の演出側にあたり、
 * ここでは unlocks として閾値だけ保持する。
 */

export interface SmithingConfig extends TimingConfig {
  /** 品質 = qualityBase + score × qualityScale（0〜100 でクランプ） */
  qualityBase: number;
  qualityScale: number;
  /** 全打ち命中で「会心」フラグ */
  criticalFlag: string;
  /** 命中率がこの値未満なら「失敗作」フラグ */
  failBelowScore: number;
  failFlag: string;
  /** 将来の解放要素（温度帯可視化・順序候補）のスキル閾値 */
  unlocks: { seeTemperatureAt: number; seeOrderHintsAt: number };
}

export interface SmithingResult {
  /** 作品の品質 0〜100 */
  quality: number;
  flags: string[];
  hits: number;
  total: number;
}

export function smithingGame(
  cfg: SmithingConfig,
  order?: { id: string },
): MiniGame<TimingInput, TimingState, SmithingResult> {
  const engine = timingEngine(cfg);
  void order;
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

/**
 * 簡易判定（03 §2）：手動で遊ばない仕事の品質。
 * 直近5回の同種作品の中央値 × 0.8。実績が無いときはスキル由来の見込み値。
 * （会心・称号・世界初は手動のときだけ —— 呼び出し側が flags を落とす）
 */
export function simpleJudgmentQuality(recentQualities: number[], skill: number): number {
  if (recentQualities.length === 0) {
    // 実績なしの見込み品質（M1 仮値。実績が溜まれば中央値に置き換わる）
    return Math.min(100, Math.round((20 + skill * 0.5) * 0.8 * 10) / 10);
  }
  const sorted = [...recentQualities].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(median * 0.8 * 10) / 10;
}
