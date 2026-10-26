import type { EnemyDef, EnemyMove } from "../combat/index.js";
import type { GameState } from "../state/types.js";

/**
 * 運命の傾向（T-45）と誓約（T-46）—— 世界の難度修飾（docs/06_endgame.md §3C）。
 *
 * - 傾向は周の開始時の3択（穏やか calm／戦乱 war／飢饉 famine）。変数は1軸だけ
 * - 誓約は難度を上げる条件を自分で積む修飾子（最初は5個。Hades の誓約が参考）
 *
 * どちらも同じ修飾語彙（WorldMods）に載る。傾向の係数は balance.json の
 * tendency 節、誓約は vows.json に書き、ここでは掛け合わせるだけにする
 * （数値をコードに直書きしない。AGENTS.md 絶対ルール）。
 */

/**
 * 世界修飾の語彙。各フィールドは倍率（省略時 = 1・従来どおり）。
 * content 側は world-mods.schema.ts の zod スキーマと 1:1 対応
 */
export interface WorldMods {
  /** 敵HP倍率（狩りで戦う敵。戦闘開始時に EnemyDef へ適用） */
  enemyHpFactor?: number;
  /** 敵の攻撃力倍率（通常攻撃・大技とも。EnemyDef の各 move.power に乗る） */
  enemyPowerFactor?: number;
  /** 戦闘（狩り）の経験係数。gain の M 項に乗る */
  combatGainFactor?: number;
  /** 仕事の報酬倍率 */
  rewardFactor?: number;
  /** 宿代倍率 */
  innCostFactor?: number;
  /** 休養日の素質回復倍率 */
  restPotentialFactor?: number;
  /** true なら翌日の追い風（tailwind 方向）が出ない。逆風は出る */
  noTailwind?: boolean;
}

/** 傾向の定義一覧（balance.json tendency 節。キーは TendencyId） */
export type TendencyDefs = Record<string, WorldMods>;

/** 誓約の定義（vows.json。core は mods だけを読む。名前・称号は表示側） */
export interface VowDef {
  id: string;
  mods?: WorldMods;
}

/** WorldMods の倍率フィールド（noTailwind を除く） */
const FACTOR_KEYS = [
  "enemyHpFactor",
  "enemyPowerFactor",
  "combatGainFactor",
  "rewardFactor",
  "innCostFactor",
  "restPotentialFactor",
] as const;

/**
 * その周に効いている世界修飾の合算（傾向1軸 × 積んだ誓約）。
 * 係数は積で重なり、noTailwind は OR。傾向が未定義（"calm" や未知値）なら中立
 */
export function worldMods(
  state: Pick<GameState, "tendency" | "vows">,
  tendencyDefs?: TendencyDefs,
  vowDefs?: readonly VowDef[],
): WorldMods {
  const out: WorldMods = {};
  const apply = (m: WorldMods | undefined) => {
    if (m === undefined) return;
    for (const k of FACTOR_KEYS) {
      const f = m[k];
      if (f !== undefined) out[k] = (out[k] ?? 1) * f;
    }
    if (m.noTailwind === true) out.noTailwind = true;
  };
  apply(tendencyDefs?.[state.tendency]);
  const taken = new Set(state.vows ?? []);
  for (const v of vowDefs ?? []) {
    if (taken.has(v.id)) apply(v.mods);
  }
  return out;
}

/** 修飾のうち1つの係数を取り出す（未定義は 1.0） */
export function worldFactor(mods: WorldMods, key: (typeof FACTOR_KEYS)[number]): number {
  return mods[key] ?? 1;
}

/**
 * 世界修飾を敵に適用する（戦闘開始前に呼ぶ）。
 * HP と各技の威力を倍率で丸める。パターン・間隔はそのまま
 */
export function withWorldMods(def: EnemyDef, mods: WorldMods): EnemyDef {
  const hpF = mods.enemyHpFactor ?? 1;
  const pF = mods.enemyPowerFactor ?? 1;
  if (hpF === 1 && pF === 1) return def;
  const scale = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.max(1, Math.round(m.power * pF)),
  });
  return {
    ...def,
    hp: Math.max(1, Math.round(def.hp * hpF)),
    attack: scale(def.attack),
    moves: Object.fromEntries(Object.entries(def.moves).map(([k, m]) => [k, scale(m)])),
  };
}
