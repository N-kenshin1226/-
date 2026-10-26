import type { GameState } from "../state/types.js";

/**
 * 称号・認定職の効果（docs/03_world_systems.md §7、T-35）。
 *
 * 「データ保持のみ」だった effect を、gain の M 項（02 §2、上限は
 * computeGain 側の modifierCap）・戦闘の与ダメージ・仕事の報酬に接続する。
 * 語彙は packages/content/src/effects.schema.ts の zod スキーマと 1:1 対応。
 * 数値はすべてコンテンツJSON側に置き、ここでは掛け合わせるだけにする。
 */

export interface Effect {
  /**
   * gain の M 項への係数。キーは行動種別（train/work/combat 等の kind）
   * または対象ID（スキルID・敵ID・仕事の kind）。一致したキーの積が効く
   * （例: {"train": 1.05} は全訓練に、{"smithing": 1.1} は鍛冶の全経験に）
   */
  gainVs?: Record<string, number>;
  /** 戦闘での与ダメージ倍率。キーは敵ID（enemies.json） */
  damageVs?: Record<string, number>;
  /** 仕事の報酬倍率（認定による値段変化）。キーは仕事の kind（スキルID） */
  priceVs?: Record<string, number>;
  /** 機械的効果を持たない旨・意図の注記（フレーバー。計算には使わない） */
  note?: string;
}

/** 効果を持ちうる定義の最小形（称号・認定職どちらもこの形を満たす） */
export interface EffectBearer {
  id: string;
  effect?: Effect;
}

/** 効果表から keys に一致する倍率の積を返す（該当なしは 1.0） */
function productOf(
  effects: readonly Effect[],
  pick: (e: Effect) => Record<string, number> | undefined,
  keys: readonly (string | undefined)[],
): number {
  let m = 1;
  for (const e of effects) {
    const table = pick(e);
    if (table === undefined) continue;
    for (const k of keys) {
      if (k === undefined) continue;
      const f = table[k];
      if (f !== undefined) m *= f;
    }
  }
  return m;
}

/**
 * 現在有効な効果の一覧：獲得済み称号＋認定済みの職業。
 * 打診中（pendingOffers）や未獲得の称号は効かない
 */
export function activeEffects(
  state: GameState,
  titles: readonly EffectBearer[],
  professions: readonly EffectBearer[],
): Effect[] {
  const owned = new Set(state.titles);
  const list: Effect[] = [];
  for (const t of titles) {
    if (t.effect !== undefined && owned.has(t.id)) list.push(t.effect);
  }
  if (state.society.profession !== null) {
    const p = professions.find((x) => x.id === state.society.profession);
    if (p?.effect !== undefined) list.push(p.effect);
  }
  return list;
}

/**
 * gain の M 項に入れる称号・認定職の修正の積（上限は computeGain がかける）。
 * kind は行動種別、targets はその行動の対象（スキルID・敵ID 等）
 */
export function gainModifier(
  effects: readonly Effect[],
  kind: string,
  ...targets: (string | undefined)[]
): number {
  return productOf(effects, (e) => e.gainVs, [kind, ...targets]);
}

/** 敵 enemyId への与ダメージ倍率（称号《百狼斬り》など） */
export function damageFactor(effects: readonly Effect[], enemyId: string): number {
  return productOf(effects, (e) => e.damageVs, [enemyId]);
}

/** 仕事 kind の報酬倍率（認定による値段変化） */
export function priceFactor(effects: readonly Effect[], kind: string): number {
  return productOf(effects, (e) => e.priceVs, [kind]);
}
