/**
 * 技能の効果の結線（K-01、balance.links）。
 *
 * 「技能がどこに効くか」をコードの枝分かれではなくデータで持つための薄い層。
 * balance.json の links 節をそのまま受け取り、各システム（戦闘・仕事・睡眠・
 * 移動・読書・危機・師匠）が自分のフック名で引く：
 *
 *   係数系フック … Σ(技能値 × 係数) を cap で頭打ちした値を効果の係数として返す
 *                 （例: combat.evade の 0.0025×軽業 で回避に最大 cap だけ上乗せ）
 *   定数系フック … skills 表の値そのものを、行動時に加える未定着経験として返す
 *                 （例: travel.gain の footwork=1.5 で移動ごとに健脚 +1.5）
 *
 * 新しい結線は balance.json にフックを足し、読む側のシステムで linkSum/linkFlat
 * を呼ぶだけにする —— 技能個別の分岐を増やさないための約束
 */

/** フック1件の定義：頭打ちの上限と、技能id→係数（または定数値）の表 */
export interface SkillLinkDef {
  cap: number;
  skills: Record<string, number>;
}

/** balance.links 全体（フック名 → 定義） */
export type SkillLinks = Record<string, SkillLinkDef>;

/**
 * 係数系フック：Σ(技能値 × 係数) を cap で頭打ちして返す。
 * 未定義のフック・技能は 0 として数えない（効果は単純に乗らない）
 */
export function linkSum(
  links: SkillLinks | undefined,
  hook: string,
  skills: Record<string, { value: number }>,
): number {
  const def = links?.[hook];
  if (def === undefined) return 0;
  let sum = 0;
  for (const [id, per] of Object.entries(def.skills)) {
    sum += (skills[id]?.value ?? 0) * per;
  }
  return Math.min(def.cap, sum);
}

/**
 * 定数系フック：skills 表をそのまま返す（技能id → 行動時の経験量）。
 * cap は経験の合計上限として呼び出し側で使える
 */
export function linkFlat(links: SkillLinks | undefined, hook: string): Record<string, number> {
  return links?.[hook]?.skills ?? {};
}

/** 定数系フックの合計上限（cap が 0 なら制限なし＝無限として扱う） */
export function linkFlatCap(links: SkillLinks | undefined, hook: string): number {
  return links?.[hook]?.cap ?? 0;
}
