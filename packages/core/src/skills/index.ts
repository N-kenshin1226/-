import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 派生スキル（docs/02：素スキルが育つと派生が開花する）。
 * 解放は flags["skill.unlock.<id>"] に記録する（GameState の形は不変）。
 */

export interface SkillUnlockDef {
  id: string;
  /** 解放条件（省略時は最初から鍛えられる素スキル） */
  condition?: Cond;
}

export const unlockFlag = (id: string): string => `skill.unlock.${id}`;

/** 鍛えられるか（解放条件なし、または解放フラグ済み） */
export function isSkillUnlocked(state: GameState, def: { id: string; condition?: Cond }): boolean {
  return def.condition === undefined || state.flags[unlockFlag(def.id)] === true;
}

/**
 * 条件を満たした派生スキルの解放フラグを立てる。
 * step() の称号判定の直後に呼ぶ（state は不変更新で返す）
 */
export function unlockSkills(
  state: GameState,
  defs: readonly SkillUnlockDef[],
  time: TimeConfig,
  env?: CondEnv,
): { state: GameState; unlocked: string[] } {
  const unlocked: string[] = [];
  let flags = state.flags;
  for (const def of defs) {
    if (def.condition === undefined || flags[unlockFlag(def.id)] === true) continue;
    if (evaluate(def.condition, state, time, env)) {
      if (flags === state.flags) flags = { ...state.flags };
      flags[unlockFlag(def.id)] = true;
      unlocked.push(def.id);
    }
  }
  return { state: flags === state.flags ? state : { ...state, flags }, unlocked };
}
