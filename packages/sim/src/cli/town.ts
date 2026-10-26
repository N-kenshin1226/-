import { createRng } from "@trace/core";
import { balance, orders, type Order } from "@trace/content";

/**
 * 街の日替わりイベント（T-20）。
 * 「勝負所のイベント」はシード＋日付で決定的に抽選する：
 * 同じ日・同じ世界では同じ出来事が起きる（状態を持たないのでセーブ互換なし）
 */

export interface SpecialOrder extends Order {
  /** 特別注文の経験・報酬係数 */
  expFactor: number;
  special: true;
}

/** その日の特別注文（あれば1件）。確率と係数は balance.town */
export function specialOrderOf(seed: string, day: number): SpecialOrder | null {
  const rng = createRng(`${seed}:town:${day}`);
  if (rng.next() >= balance.town.specialOrderChance) return null;
  const list = orders.orders;
  const base = list[rng.int(0, list.length - 1)]!;
  return {
    ...base,
    id: `${base.id}#sp${day}`,
    name: `特別注文：${base.name}`,
    rewardMoney: Math.round(base.rewardMoney * balance.town.specialOrderRewardFactor),
    targetQuality: Math.round(base.targetQuality * 1.2),
    expFactor: balance.town.specialOrderExpFactor,
    special: true,
  };
}
