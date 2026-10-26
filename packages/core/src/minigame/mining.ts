import { boardEngine, type BoardConfig, type BoardInput, type BoardState } from "./board.js";
import type { MiniGame } from "./types.js";

/**
 * 採掘ミニゲーム（盤面推理エンジンの皮）。
 * 採掘場の地面に隠れた鉱脈を、空地のヒントを頼りに掘り当てる。
 * 岩を穿つと盤面は崩れて採掘は終わる（品質半減）。
 *
 * スキルの効き方（03 §2）：ヒントの半径が広がるだけで、鉱脈位置は変わらない。
 */

export interface MiningConfig extends BoardConfig {
  /** 全鉱脈を掘り切って崩さなかったときのフラグ */
  criticalFlag: string;
  /** 岩に当たったときのフラグ */
  failFlag: string;
}

export interface MiningResult {
  quality: number;
  flags: string[];
  ores: number;
  oresTotal: number;
  cleared: boolean;
}

export function miningGame(cfg: MiningConfig): MiniGame<BoardInput, BoardState, MiningResult> {
  const engine = boardEngine(cfg);
  return {
    init: (ctx) => engine.init(ctx),
    tick: (s, i) => engine.tick(s, i),
    autoplay: (ctx) => engine.autoplay(ctx),
    result(state) {
      const r = engine.result(state);
      // 品質：掘り当てた割合（岩で半減済みの engine 値を oresTotal 規格で 0〜100 に）
      const quality = Math.max(
        0,
        Math.min(100, Math.round((r.ores / Math.max(1, r.oresTotal)) * 100 * 10) / 10),
      );
      const halved = r.rocksHit > 0;
      const flags: string[] = [];
      if (r.cleared) flags.push(cfg.criticalFlag);
      if (halved) flags.push(cfg.failFlag);
      return {
        quality: halved ? Math.round((quality / 2) * 10) / 10 : quality,
        flags,
        ores: r.ores,
        oresTotal: r.oresTotal,
        cleared: r.cleared,
      };
    },
  };
}
