/**
 * シード付きPRNG。ゲーム全体の乱数はここから決定論的に生成する
 * （docs/04_tech_and_devin.md §1）。外部ライブラリ不使用。
 *
 * アルゴリズム: xoshiro128**（状態4×uint32、周期2^128-1）。
 * 文字列シードは cyrb128 で4つの状態ワードにハッシュする。
 */

export interface RngState {
  algo: "xoshiro128**";
  s: [number, number, number, number];
}

export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** [min, max] の整数（両端を含む） */
  int(min: number, max: number): number;
  /** 確率 p で true */
  chance(p: number): boolean;
  /** 配列から一様に1要素 */
  pick<T>(items: readonly T[]): T;
  /** 重み付き抽選 */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  /**
   * ラベルから派生した独立した列。親の列は消費しない
   * （同じ親状態・同じラベルなら同じ子列）。
   */
  fork(label: string): Rng;
  /** シリアライズ可能な内部状態（save/restore 用） */
  state(): RngState;
}

/** cyrb128: 文字列 → 4×uint32。シード文字列を状態ワードに展開する */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function fromWords(s: [number, number, number, number]): Rng {
  const state = s.slice() as [number, number, number, number];

  function nextU32(): number {
    const t = (state[1] << 9) | 0;
    let r = Math.imul(state[0], 5);
    r = Math.imul((r << 7) | (r >>> 25), 9);
    state[2] = (state[2] ^ state[0]) >>> 0;
    state[3] = (state[3] ^ state[1]) >>> 0;
    state[1] = (state[1] ^ state[2]) >>> 0;
    state[0] = (state[0] ^ state[3]) >>> 0;
    state[2] = (state[2] ^ t) >>> 0;
    state[3] = ((state[3] << 11) | (state[3] >>> 21)) >>> 0;
    return r >>> 0;
  }

  return {
    next(): number {
      return nextU32() / 0x100000000;
    },
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError(`int(${min}, ${max}): 不正な範囲`);
      }
      return min + Math.floor(this.next() * (max - min + 1));
    },
    chance(p: number): boolean {
      if (p < 0 || p > 1) throw new RangeError(`chance(${p}): 0〜1 で指定`);
      return this.next() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick: 空の配列");
      const v = items[this.int(0, items.length - 1)];
      return v as T;
    },
    weighted<T>(items: readonly { item: T; weight: number }[]): T {
      if (items.length === 0) throw new RangeError("weighted: 空の配列");
      const total = items.reduce((acc, i) => acc + i.weight, 0);
      if (total <= 0) throw new RangeError("weighted: 重みの合計が 0 以下");
      let r = this.next() * total;
      for (const { item, weight } of items) {
        if (weight <= 0) continue;
        r -= weight;
        if (r < 0) return item;
      }
      // 浮動小数点の端数で最後まで来た場合は最後の有効要素
      const last = [...items].reverse().find((i) => i.weight > 0);
      return (last as { item: T }).item;
    },
    fork(label: string): Rng {
      // 親の状態＋ラベルから子シードを導出。親の列は消費しない。
      const words = cyrb128(`${label}:${state.join(",")}`);
      return fromWords(words);
    },
    state(): RngState {
      return { algo: "xoshiro128**", s: state.slice() as RngState["s"] };
    },
  };
}

export function createRng(seed: string | number): Rng {
  const words = cyrb128(String(seed));
  // cyrb128 が全ゼロを返す退化ケースを防ぐ（xoshiro は全ゼロ状態が不動点）
  if (words.every((w) => w === 0)) words[0] = 0x9e3779b9;
  return fromWords(words);
}

export function restoreRng(state: RngState): Rng {
  if (state?.algo !== "xoshiro128**" || !Array.isArray(state.s) || state.s.length !== 4) {
    throw new Error("restoreRng: 不正な RngState");
  }
  const s = state.s.map((w) => {
    if (!Number.isInteger(w) || w < 0 || w > 0xffffffff) {
      throw new Error("restoreRng: 状態ワードが uint32 の範囲外");
    }
    return w;
  }) as [number, number, number, number];
  return fromWords(s);
}
