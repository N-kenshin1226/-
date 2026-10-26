import { evaluate, type Cond } from "../conditions/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 立場×職業と人生目標（docs/03 §1、01 の柱4）。
 *
 * - 立場 = 「何ができるか」（入れる場所・会える人）。戦闘力は与えない
 * - 職業 = 「何をするか」の認定。条件を満たすと打診が来て、受諾で認定される
 * - 人生目標 = プレイヤーが序盤に宣言する目標。達成で報酬（pending）が入る
 *
 * 認定・立場の条件は条件DSL（T-10）で表現する。データは content/。
 */

export interface StandingDef {
  id: string;
  name: string;
  /** 序列（大きいほど上位） */
  order: number;
  /** この立場に上がる条件（最下位は条件なし） */
  condition?: Cond;
}

export interface ProfessionDef {
  id: string;
  name: string;
  condition: Cond;
  note?: string;
}

export interface LifeGoalDef {
  id: string;
  name: string;
  condition: Cond;
  /** 達成報酬：指定スキルの pending に加える */
  reward: { pendingBySkill?: Record<string, number> };
  note?: string;
}

export interface SocietyDefs {
  standings: readonly StandingDef[];
  professions: readonly ProfessionDef[];
  lifeGoals: readonly LifeGoalDef[];
}

/** 条件を満たしたオファー（まだ持っていない・打診中でないもの）を返す */
export function newOffers(
  state: GameState,
  defs: SocietyDefs,
  time: TimeConfig,
): { kind: "standing" | "profession"; id: string }[] {
  const offers: { kind: "standing" | "profession"; id: string }[] = [];
  const standing = defs.standings.find((s) => s.id === state.society.standing);
  const order = standing?.order ?? 0;
  for (const s of defs.standings) {
    if (s.order <= order || s.condition === undefined) continue;
    if (state.society.pendingOffers.includes(s.id)) continue;
    if (evaluate(s.condition, state, time)) offers.push({ kind: "standing", id: s.id });
  }
  if (state.society.profession === null) {
    for (const p of defs.professions) {
      if (state.society.pendingOffers.includes(p.id)) continue;
      if (evaluate(p.condition, state, time)) offers.push({ kind: "profession", id: p.id });
    }
  }
  return offers;
}

/** オファーを受諾する（pendingOffers に入っている必要） */
export function acceptOffer(
  state: GameState,
  defs: SocietyDefs,
  id: string,
): { state: GameState; ok: boolean } {
  if (!state.society.pendingOffers.includes(id)) return { state, ok: false };
  const society = {
    ...state.society,
    pendingOffers: state.society.pendingOffers.filter((o) => o !== id),
  };
  if (defs.standings.some((s) => s.id === id)) society.standing = id;
  else if (defs.professions.some((p) => p.id === id)) society.profession = id;
  else return { state, ok: false };
  return { state: { ...state, society }, ok: true };
}

/** 宣言した目標が達成されたか（報酬適用は step 側） */
export function goalAchieved(
  state: GameState,
  defs: SocietyDefs,
  time: TimeConfig,
): LifeGoalDef | null {
  const id = state.society.goal;
  if (!id) return null;
  if (state.society.achievedGoals.includes(id)) return null;
  const goal = defs.lifeGoals.find((g) => g.id === id);
  if (!goal) return null;
  return evaluate(goal.condition, state, time) ? goal : null;
}

/**
 * 「いま手が届く目標」上位 n 件。
 * 未達成・未宣言の目標を近さ（数値条件の割合）で並べる
 */
export function suggestGoals(state: GameState, defs: SocietyDefs, n: number): LifeGoalDef[] {
  const done = new Set([...state.society.achievedGoals, state.society.goal]);
  const scored = defs.lifeGoals
    .filter((g) => g.id !== null && !done.has(g.id))
    .map((g) => ({ g, closeness: closeness(g.condition, state) }))
    .sort((a, b) => b.closeness - a.closeness);
  return scored.slice(0, n).map((s) => s.g);
}

function closeness(cond: Cond, state: GameState): number {
  if ("counter" in cond) {
    const t = cond.gte ?? cond.eq;
    return t ? (state.counters[cond.counter] ?? 0) / t : 0;
  }
  if ("skill" in cond) {
    const t = cond.gte ?? cond.eq;
    return t ? (state.player.skills[cond.skill]?.value ?? 0) / t : 0;
  }
  if ("and" in cond) return cond.and.reduce((m, c) => Math.min(m, closeness(c, state)), 1);
  if ("or" in cond) return cond.or.reduce((m, c) => Math.max(m, closeness(c, state)), 0);
  return 0;
}
