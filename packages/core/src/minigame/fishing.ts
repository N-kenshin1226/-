import { timingEngine, type TimingConfig, type TimingInput, type TimingState } from "./timing.js";
import type { MiniGame } from "./types.js";

/**
 * 釣りミニゲーム（タイミングエンジンの皮）。
 * 間のあるアタリ（拍）に合わせて竿を掛ける。
 * 命中率が catchMinHits に届かなければ魚は逃げる（品質0）。
 * 全アタリを掛けきれば「大物」。
 *
 * スキルの効き方（03 §2）：判定窓が広がるだけで、魚の出方は変わらない。
 */

export interface FishingConfig extends TimingConfig {
  /** 品質 = qualityBase + score × qualityScale（0〜100 でクランプ） */
  qualityBase: number;
  qualityScale: number;
  /** 釣り上げに必要な命中数。未満なら「逃がした」 */
  catchMinHits: number;
  /** 全アタリを掛けたときのフラグ */
  criticalFlag: string;
  /** 逃したときのフラグ */
  escapeFlag: string;
}

export interface FishingResult {
  /** 釣果の品質 0〜100。逃したときは 0 */
  quality: number;
  flags: string[];
  hits: number;
  total: number;
  /** 釣り上げられたか */
  caught: boolean;
}

export function fishingGame(cfg: FishingConfig): MiniGame<TimingInput, TimingState, FishingResult> {
  const engine = timingEngine(cfg);
  return {
    init: (ctx) => engine.init(ctx),
    tick: (s, i) => engine.tick(s, i),
    autoplay: (ctx) => engine.autoplay(ctx),
    result(state) {
      const r = engine.result(state);
      const caught = r.hits >= cfg.catchMinHits;
      const quality = caught
        ? Math.max(
            0,
            Math.min(100, Math.round((cfg.qualityBase + r.score * cfg.qualityScale) * 10) / 10),
          )
        : 0;
      const flags: string[] = [];
      if (caught && r.hits === r.total && r.total > 0) flags.push(cfg.criticalFlag);
      if (!caught) flags.push(cfg.escapeFlag);
      return { quality, flags, hits: r.hits, total: r.total, caught };
    },
  };
}
