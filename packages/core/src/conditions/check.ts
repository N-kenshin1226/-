import type { Cond } from "./index.js";

/**
 * 条件の静的検査（docs/02 §9「CIで到達可能かを検査する」の第一歩）。
 *
 * 現段階では「明らかな矛盾」の検出に絞る：
 * `and` の中で同じ対象（counter:x 等）に、交わらない数値範囲が
 * 課されている条件は、どんな state でも真にならない。
 * （例: counter.a ≥ 10 かつ counter.a ≤ 5）
 *
 * not の内部や within の回数上限までは追わない（保守的に見逃す側）。
 */

interface Interval {
  lo: number;
  hi: number;
}

/** 条件木の中で、この and 配列に直接含まれる数値比較を対象キーごとに集める */
function collectRanges(conds: Cond[], out: Map<string, Interval>): void {
  for (const c of conds) {
    if ("and" in c) {
      collectRanges(c.and, out);
      continue;
    }
    if ("or" in c || "not" in c || "within" in c || "work" in c || "flag" in c) continue;

    const merge = (key: string, cmp: { gte?: number; lte?: number; eq?: number }) => {
      const prev = out.get(key) ?? { lo: -Infinity, hi: Infinity };
      const lo = Math.max(prev.lo, cmp.gte ?? -Infinity, cmp.eq ?? -Infinity);
      const hi = Math.min(prev.hi, cmp.lte ?? Infinity, cmp.eq ?? Infinity);
      out.set(key, { lo, hi });
    };

    if ("counter" in c) merge(`counter:${c.counter}`, c);
    else if ("skill" in c) merge(`skill:${c.skill}`, c);
    else if ("stat" in c) merge(`stat:${c.stat}`, c);
    else if ("money" in c) merge("money", c.money);
    else if ("time" in c) {
      const t = c.time;
      if (t.day) merge("time:day", t.day);
      if (t.age) merge("time:age", t.age);
      if (t.year) merge("time:year", t.year);
      if (t.dayOfSeason) merge("time:dayOfSeason", t.dayOfSeason);
    }
  }
}

/**
 * cond が「どんな state でも真になり得ない」構造的矛盾を含むか。
 * or 分岐は「全部の枝が矛盾」している場合だけ矛盾とみなす。
 */
export function isContradiction(cond: Cond): boolean {
  if ("and" in cond) {
    const ranges = new Map<string, Interval>();
    collectRanges(cond.and, ranges);
    for (const { lo, hi } of ranges.values()) {
      if (lo > hi) return true;
    }
    // 子の and/or も再帰的に見る（and に含まれる or 枝が全部矛盾なら矛盾）
    return cond.and.some((c) => ("or" in c || "and" in c) && isContradiction(c));
  }
  if ("or" in cond) {
    if (cond.or.length === 0) return true;
    return cond.or.every((c) => isContradiction(c));
  }
  if ("not" in cond) return false; // 否定の内部までは追わない
  return false;
}

/** 称号リストのうち矛盾した条件を持つものの id を返す */
export function findContradictions(defs: readonly { id: string; condition: Cond }[]): string[] {
  return defs.filter((d) => isContradiction(d.condition)).map((d) => d.id);
}
