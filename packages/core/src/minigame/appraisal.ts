import { boardEngine, type BoardConfig, type BoardInput, type BoardState } from "./board.js";
import type { MiniGame } from "./types.js";

/**
 * 鑑定ミニゲーム（盤面推理エンジンの皮）。
 * 棚に並んだ品（盤面）から真品（鉱脈相当）を見極める。
 * 贋作（岩相当）を掴むと信用が崩れて鑑定は終わる（品質 × missPenaltyFactor）。
 *
 * スキルの効き方（03 §2）：手がかり（ヒント）の半径が広がるだけで、
 * 真贋の配置は変わらない。
 */

export interface AppraisalConfig extends BoardConfig {
  /** 全ての真品を見極め、贋作に手を出さなかったときのフラグ */
  criticalFlag: string;
  /** 贋作を掴んだときのフラグ */
  failFlag: string;
  /** 贋作を掴んだときの品質係数（0.5 で半減、0 で没収） */
  missPenaltyFactor: number;
}

export interface AppraisalResult {
  quality: number;
  flags: string[];
  /** 見極めた真品の数 */
  found: number;
  foundTotal: number;
  /** 掴んでしまった贋作の数 */
  fakes: number;
  cleared: boolean;
}

export function appraisalGame(
  cfg: AppraisalConfig,
): MiniGame<BoardInput, BoardState, AppraisalResult> {
  const engine = boardEngine(cfg);
  return {
    init: (ctx) => engine.init(ctx),
    tick: (s, i) => engine.tick(s, i),
    autoplay: (ctx) => engine.autoplay(ctx),
    result(state) {
      const r = engine.result(state);
      // 品質：見極めた真品の割合を 0〜100 に。贋作を掴むと係数分だけ落ちる
      const ratio = r.ores / Math.max(1, r.oresTotal);
      const base = Math.max(0, Math.min(100, Math.round(ratio * 100 * 10) / 10));
      const missed = r.rocksHit > 0;
      const flags: string[] = [];
      if (r.cleared) flags.push(cfg.criticalFlag);
      if (missed) flags.push(cfg.failFlag);
      return {
        quality: missed ? Math.round(base * cfg.missPenaltyFactor * 10) / 10 : base,
        flags,
        found: r.ores,
        foundTotal: r.oresTotal,
        fakes: r.rocksHit,
        cleared: r.cleared,
      };
    },
  };
}
