import { describe, expect, it } from "vitest";
import { showdownOrderOf } from "./index.js";

/**
 * 「勝負所」注文の絞り込み（F-05、03 §2「使い所の原則」）。
 * 勝負所の印のある注文だけが勝負所として挙がり、1日最大1件（特別注文と
 * 合わせても2件以内）に収まる —— 日常の注文は簡易判定が標準、勝負所は
 * ここぞの場だけに使う
 */

const ORDERS = [
  { id: "o.nail", name: "釘", targetQuality: 20, rewardMoney: 12 },
  { id: "o.knife", name: "小振りのナイフ", targetQuality: 45, rewardMoney: 30 },
  { id: "o.ceremonial", name: "儀式用の剣", targetQuality: 70, rewardMoney: 60, showdown: true },
  { id: "o.heroic", name: "英雄の剣", targetQuality: 90, rewardMoney: 120, showdown: true },
];

describe("勝負所の注文（showdownOrderOf）", () => {
  it("勝負所の印のある注文からだけ選ばれる（日常の注文は勝負所にならない）", () => {
    for (let day = 0; day < 30; day++) {
      const pick = showdownOrderOf("w-sd", day, ORDERS);
      expect(pick).not.toBeNull();
      expect(["o.ceremonial", "o.heroic"]).toContain(pick!.id);
    }
  });

  it("印のある注文が無ければ勝負所は立たない", () => {
    const plain = ORDERS.filter((o) => o.showdown !== true);
    for (let day = 0; day < 10; day++) {
      expect(showdownOrderOf("w-sd-none", day, plain)).toBeNull();
    }
  });

  it("同じ日・同じ世界では同じ注文が挙がる（決定的）", () => {
    const a = showdownOrderOf("w-sd-det", 7, ORDERS);
    const b = showdownOrderOf("w-sd-det", 7, ORDERS);
    expect(a).toEqual(b);
    // 別の世界・別の日では挙がり方が変わりうる（少なくとも2種類が出る）
    const ids = new Set<string>();
    for (let day = 0; day < 40; day++) ids.add(showdownOrderOf("w-sd-var", day, ORDERS)!.id);
    expect(ids.size).toBe(2);
  });

  it("印のある注文が1件だけならその注文が挙がる", () => {
    const one = [ORDERS[0]!, ORDERS[2]!];
    for (let day = 0; day < 10; day++) {
      expect(showdownOrderOf("w-sd-one", day, one)!.id).toBe("o.ceremonial");
    }
  });
});
