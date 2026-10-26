import {
  dealEngine,
  type DealConfig,
  type DealInput,
  type DealState,
  type DealTopic,
} from "./deal.js";
import type { MiniGame } from "./types.js";

/**
 * 交渉ミニゲーム（駆け引きエンジンの皮）。
 * 論点カードを出し合う口論・商談。論点には三すくみの相性がある。
 *
 * スキルの効き方（03 §2）：
 * 手札上限と「相手の次の論点の予告数」が増える。勝率の直接倍率は付けない
 * （予告 = 戦闘の予兆と同じ見せ方）。
 */

export interface NegotiationTopic extends DealTopic {
  /** 表示名（「値段」「納期」「品質」など） */
  name: string;
}

export interface NegotiationConfig extends Omit<DealConfig, "topics"> {
  topics: NegotiationTopic[];
  /** 完勝（耐久を失わず勝つ）ときのフラグ */
  criticalFlag: string;
  /** 敗北時のフラグ */
  failFlag: string;
}

export interface NegotiationResult {
  quality: number;
  flags: string[];
  won: boolean;
  rounds: number;
}

export function negotiationGame(
  cfg: NegotiationConfig,
): MiniGame<DealInput, DealState, NegotiationResult> {
  const engine = dealEngine(cfg);
  return {
    init: (ctx) => engine.init(ctx),
    tick: (s, i) => engine.tick(s, i),
    autoplay: (ctx) => engine.autoplay(ctx),
    result(state) {
      const r = engine.result(state);
      // 品質：勝敗 50点 + 削った量 30点 + 残った耐久 20点
      const dealt = 1 - Math.max(0, r.opponentHp) / cfg.hp;
      const kept = Math.max(0, r.playerHp) / cfg.hp;
      const quality = Math.max(
        0,
        Math.min(100, Math.round((r.won ? 50 : 10) + dealt * 30 + kept * 20)),
      );
      const flags: string[] = [];
      if (r.won && r.playerHp === cfg.hp) flags.push(cfg.criticalFlag);
      if (!r.won) flags.push(cfg.failFlag);
      return { quality, flags, won: r.won, rounds: r.rounds };
    },
  };
}
