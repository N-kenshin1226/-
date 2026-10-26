import type { Chronicle } from "../chronicle/index.js";

/**
 * 失われた書物（docs/06_endgame.md §2、X-5）。
 * 「前世の技が、次の世界の師匠NPCや失われた書物として現れる」の書物側：
 * 転生で別世界に生まれたとき、直前の人生（chronicle の最新の頁）の代表技能が
 * 閾値以上なら、その技能の「先達の手記」が次の世界の書店に並ぶ。
 *
 * GameState の形は増やさない：転生時に flags["lostbook.<skillId>"] を立て、
 * books.json 側の棚条件（condition: {flag: "lostbook.<skillId>"}）がそれを読む。
 * 師匠NPC化は未実装（チケットの実装メモ参照）。
 */

/** balance.json の lostBooks 節に対応する設定 */
export interface LostBookConfig {
  /** 手記が現れる代表技能の閾値（peakSkills の value がこの値以上） */
  skillThreshold: number;
  /** 1周に現れる手記の最大数（peakSkills 上位から） */
  maxBooks: number;
  /** 書店の棚条件が読むフラグの接頭辞（flag = flagPrefix + スキルID） */
  flagPrefix: string;
}

/**
 * 前世の代表技能 → 転生先で立てる失われた手記フラグの一覧（newGame の cfg.flags に渡す）。
 * 対象は chronicle の最新の頁。seed を渡すとその世界で最後に刻まれた頁を選ぶ
 * （転生の再入・再読み込みで、末尾が別の生になっていても直前の人生を確実に拾う）。
 * 閾値を超えた技能の上位から maxBooks 件。無ければ空配列。
 */
export function lostBookFlags(chronicle: Chronicle, cfg: LostBookConfig, seed?: string): string[] {
  const lives = chronicle.lives;
  for (let i = lives.length - 1; i >= 0; i--) {
    const life = lives[i]!;
    if (seed !== undefined && life.worldSeed !== seed) continue;
    return (life.peakSkills ?? [])
      .filter((s) => s.value >= cfg.skillThreshold)
      .slice(0, Math.max(0, cfg.maxBooks))
      .map((s) => `${cfg.flagPrefix}${s.id}`);
  }
  return [];
}

/**
 * 手記フラグが指す技能ID（flagPrefix を剥がす。通知文の技能名解決用）。
 * 接頭辞が合わない文字列には null を返す
 */
export function lostBookSkillId(flag: string, cfg: LostBookConfig): string | null {
  return flag.startsWith(cfg.flagPrefix) ? flag.slice(cfg.flagPrefix.length) : null;
}
