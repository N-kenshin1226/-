import type { GameState, Work } from "../state/types.js";
import { reachedPinnacles, type PinnacleRouteDef } from "../pinnacle/index.js";

/**
 * 伝記の素材（T-37、docs/06_endgame.md §1）。
 * 引退・死亡時に NarrationProvider へ渡す構造化データを GameState から摘む。
 * 表示名への変換はコンテンツを持つ呼び出し側（CLI/Web）の仕事
 */

export interface BiographyMaterial {
  name: string;
  days: number;
  /** 行動の総数（action.total カウンタ） */
  deeds: number;
  titleIds: string[];
  originId: string;
  standingId: string;
  professionId: string | null;
  achievedGoalIds: string[];
  /** 代表作：最高ティア、同点なら高品質。台帳が空なら null */
  bestWork: Work | null;
  /** 最も伸びたスキル（最高到達値基準） */
  peakSkill: { id: string; value: number } | null;
  /** 死亡回数（蘇生込みの通算） */
  deaths: number;
  /** 頂点に至ったルートID（T-41。routes を渡したときだけ摘む） */
  pinnacleIds: string[];
}

export function biographyMaterial(
  state: GameState,
  pinnacleRoutes?: readonly PinnacleRouteDef[],
): BiographyMaterial {
  const bestWork = state.ledger.reduce<Work | null>(
    (best, w) =>
      best === null || w.tier > best.tier || (w.tier === best.tier && w.quality > best.quality)
        ? w
        : best,
    null,
  );
  let peakSkill: { id: string; value: number } | null = null;
  for (const [id, s] of Object.entries(state.player.skills)) {
    if (peakSkill === null || s.peak > peakSkill.value) peakSkill = { id, value: s.peak };
  }
  return {
    name: state.player.name,
    days: state.time.day,
    deeds: state.counters["action.total"] ?? 0,
    titleIds: [...state.titles],
    originId: state.player.origin,
    standingId: state.society.standing,
    professionId: state.society.profession,
    achievedGoalIds: [...state.society.achievedGoals],
    bestWork,
    peakSkill,
    deaths: state.counters["death.count"] ?? 0,
    pinnacleIds: pinnacleRoutes !== undefined ? reachedPinnacles(state, pinnacleRoutes) : [],
  };
}
