import { createRng } from "../rng/index.js";

/**
 * 街の日替わりイベント（T-20「勝負所」）。
 * シード＋日付で決定的に抽選する：同じ日・同じ世界では同じ出来事が起きる。
 * 状態を持たないのでセーブ互換の影響はない。
 *
 * コンテンツ（注文一覧・確率・係数）は呼び出し側から注入する
 * （core は content に依存しない。CLI と Web で同じ判定を共有するためにここに置く）
 */

/** 特別注文として必要な最小フィールド（Order の部分型） */
export interface OrderLike {
  id: string;
  name: string;
  targetQuality: number;
  rewardMoney: number;
}

export type SpecialOrderOf<O extends OrderLike> = O & {
  /** 特別注文の経験係数 */
  expFactor: number;
  special: true;
};

export interface SpecialOrderSpec {
  /** 1日に特別注文が来る確率 */
  chance: number;
  /** 経験係数の上乗せ */
  expFactor: number;
  /** 報酬の上乗せ */
  rewardFactor: number;
  /** 目標品質の上乗せ（固定値は平衡ゲートに影響するためここでは係数固定…ではなく注入に近い形で定数） */
  qualityFactor: number;
}

export function specialOrderOf<O extends OrderLike>(
  seed: string,
  day: number,
  orders: readonly O[],
  spec: SpecialOrderSpec,
): SpecialOrderOf<O> | null {
  const rng = createRng(`${seed}:town:${day}`);
  if (rng.next() >= spec.chance || orders.length === 0) return null;
  const base = orders[rng.int(0, orders.length - 1)]!;
  return {
    ...base,
    id: `${base.id}#sp${day}`,
    name: `特別注文：${base.name}`,
    rewardMoney: Math.round(base.rewardMoney * spec.rewardFactor),
    targetQuality: Math.round(base.targetQuality * spec.qualityFactor),
    expFactor: spec.expFactor,
    special: true,
  };
}
