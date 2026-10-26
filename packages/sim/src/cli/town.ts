import { specialOrderOf as coreSpecialOrderOf } from "@trace/core";
import { balance, orders, type Order } from "@trace/content";

/**
 * 街の日替わりイベント（T-20）。
 * 判定は core/src/town（CLIとWebで共有）。コンテンツの注入はここで行う。
 */

export interface SpecialOrder extends Order {
  /** 特別注文の経験・報酬係数 */
  expFactor: number;
  special: true;
}

/** その日の特別注文（あれば1件）。確率と係数は balance.town */
export function specialOrderOf(seed: string, day: number): SpecialOrder | null {
  return coreSpecialOrderOf(seed, day, orders.orders, {
    chance: balance.town.specialOrderChance,
    expFactor: balance.town.specialOrderExpFactor,
    rewardFactor: balance.town.specialOrderRewardFactor,
    qualityFactor: balance.town.specialOrderQualityFactor,
  }) as SpecialOrder | null;
}
