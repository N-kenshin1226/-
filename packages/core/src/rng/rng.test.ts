import { describe, expect, it } from "vitest";
import { createRng, restoreRng, type RngState } from "./index.js";

describe("rng", () => {
  it("同じシードから同じ列が出る", () => {
    const a = createRng("trace-test-seed");
    const b = createRng("trace-test-seed");
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("先頭10個と1000個の畳み込みが既知の値と一致する（実装の回帰検出）", () => {
    const r = createRng("trace-test-seed");
    const first10 = Array.from({ length: 10 }, () => r.next());
    expect(first10).toEqual([
      0.6368419360369444, 0.6596091452520341, 0.4192136093042791, 0.3411736518610269,
      0.9764438129495829, 0.5723936988506466, 0.45206180959939957, 0.08127393363974988,
      0.8960537288803607, 0.08307921467348933,
    ]);

    const r2 = createRng("trace-test-seed");
    let xor = 0;
    for (let i = 0; i < 1000; i++) xor = (xor ^ Math.floor(r2.next() * 0xffffffff)) >>> 0;
    expect(xor).toBe(2466944677);
  });

  it("数値シードも決定論的", () => {
    const a = createRng(42);
    expect(Array.from({ length: 3 }, () => a.next())).toEqual([
      0.09381739678792655, 0.7367907438892871, 0.8789717517793179,
    ]);
  });

  it("fork(a) と fork(b) は異なる列で、親の列を消費しない", () => {
    const parent = createRng("parent");
    const before = parent.next();

    const childA = parent.fork("a");
    const childB = parent.fork("b");
    const seqA = Array.from({ length: 5 }, () => childA.next());
    const seqB = Array.from({ length: 5 }, () => childB.next());
    expect(seqA).not.toEqual(seqB);

    // fork 後も親の列はずれない
    const parent2 = createRng("parent");
    expect(parent2.next()).toBe(before);
    expect(parent.next()).toBe(parent2.next());
  });

  it("同じラベルの fork は同じ子列（決定論）", () => {
    const p1 = createRng("s");
    const p2 = createRng("s");
    expect(Array.from({ length: 5 }, () => p1.fork("x").next())).toEqual(
      Array.from({ length: 5 }, () => p2.fork("x").next()),
    );
  });

  it("state → JSON → restoreRng で続きの列が一致する", () => {
    const r = createRng("roundtrip");
    for (let i = 0; i < 7; i++) r.next();
    const saved: RngState = JSON.parse(JSON.stringify(r.state()));
    const restored = restoreRng(saved);
    for (let i = 0; i < 100; i++) {
      expect(restored.next()).toBe(r.next());
    }
  });

  it("restoreRng は不正な状態を拒否する", () => {
    expect(() => restoreRng({ algo: "nope", s: [0, 0, 0, 0] } as unknown as RngState)).toThrow();
    expect(() => restoreRng({ algo: "xoshiro128**", s: [1, 2] } as unknown as RngState)).toThrow();
    expect(() =>
      restoreRng({ algo: "xoshiro128**", s: [0, 0, 0, -1] } as unknown as RngState),
    ).toThrow();
  });

  it("int は両端を含む範囲に収まる（10万回）", () => {
    const r = createRng("int-range");
    const seen = new Set<number>();
    for (let i = 0; i < 100_000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });

  it("weighted の出現率が重みに比例する（10万回、±5%相対）", () => {
    const r = createRng("weighted");
    const counts = { a: 0, b: 0, c: 0 };
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      counts[
        r.weighted([
          { item: "a" as const, weight: 1 },
          { item: "b" as const, weight: 2 },
          { item: "c" as const, weight: 7 },
        ])
      ]++;
    }
    expect(counts.a / n).toBeCloseTo(0.1, 1);
    expect(counts.b / n).toBeCloseTo(0.2, 1);
    expect(counts.c / n).toBeCloseTo(0.7, 1);
  });

  it("chance の境界と比率", () => {
    const r = createRng("chance");
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    const r2 = createRng("chance2");
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r2.chance(0.3)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
  });

  it("不正な引数は例外を投げる", () => {
    const r = createRng("bad-args");
    expect(() => r.int(5, 2)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(() => r.weighted([])).toThrow(RangeError);
    expect(() => r.weighted([{ item: 1, weight: 0 }])).toThrow(RangeError);
    expect(() => r.chance(-0.1)).toThrow(RangeError);
    expect(() => r.chance(1.1)).toThrow(RangeError);
  });
});
