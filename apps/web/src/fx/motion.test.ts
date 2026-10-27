/**
 * F-03 ミニゲームの動き —— 表示層の純粋計算のユニットテスト。
 * beatPhase（判定窓の見え方）・ringProgress（縮む輪）・comboCount・
 * negoMood・clashDelta・sparkDirs（決定的）を検証する。乱数・DOMは使わない
 */
import { describe, expect, it } from "vitest";
import type { BoardState, DealState } from "@trace/core";
import {
  beatPhase,
  clashDelta,
  comboCount,
  negoMood,
  revealedIndex,
  ringProgress,
  sparkDirs,
} from "./motion.js";

describe("beatPhase（タイミング系の見え方）", () => {
  const beats = [900, 1800, 2700];
  it("判定窓の内側は armed、外側は不発", () => {
    expect(beatPhase(900, beats, 100, 0).armed).toBe(true);
    expect(beatPhase(799, beats, 100, 0).armed).toBe(false);
    expect(beatPhase(1001, beats, 100, 0).armed).toBe(false);
    // 窓の縁は内側（判定と同じ <=）
    expect(beatPhase(800, beats, 100, 0).armed).toBe(true);
    expect(beatPhase(1000, beats, 100, 0).armed).toBe(true);
  });
  it("窓を過ぎて未判定なら late、窓までの残りは until", () => {
    const p = beatPhase(1050, beats, 100, 0);
    expect(p.late).toBe(true);
    expect(p.until).toBeLessThan(0);
    const early = beatPhase(500, beats, 100, 0);
    expect(early.late).toBe(false);
    expect(early.until).toBe(300);
  });
  it("全拍済み（cursor 越え）なら拍は無い", () => {
    const p = beatPhase(4000, beats, 100, 3);
    expect(p.at).toBeNull();
    expect(p.armed).toBe(false);
  });
});

describe("ringProgress（縮む輪）", () => {
  it("前の拍から今の拍へ 0 → 1 に収まる", () => {
    expect(ringProgress(0, 900, 0)).toBe(0);
    expect(ringProgress(450, 900, 0)).toBeCloseTo(0.5);
    expect(ringProgress(900, 900, 0)).toBe(1);
    expect(ringProgress(450, 1800, 900)).toBe(0);
    expect(ringProgress(1350, 1800, 900)).toBeCloseTo(0.5);
  });
  it("範囲外はクランプ（0 未満・1 超を出さない）", () => {
    expect(ringProgress(-50, 900, 0)).toBe(0);
    expect(ringProgress(950, 900, 0)).toBe(1);
  });
});

describe("comboCount（連続命中）", () => {
  it("末尾の連続 hit だけを数える", () => {
    expect(comboCount([])).toBe(0);
    expect(comboCount(["hit", "hit", "hit"])).toBe(3);
    expect(comboCount(["hit", "miss", "hit", "hit"])).toBe(2);
    expect(comboCount(["hit", "hit", "miss"])).toBe(0);
  });
});

describe("sparkDirs（火花の向きは拍の番号で決まる）", () => {
  it("同じ拍には同じ散り方を返す（乱数なし）", () => {
    expect(sparkDirs(3)).toEqual(sparkDirs(3));
    expect(sparkDirs(0)).not.toEqual(sparkDirs(1));
    for (const [dx, dy] of sparkDirs(2)) {
      expect(Number.isFinite(dx)).toBe(true);
      expect(Number.isFinite(dy)).toBe(true);
    }
  });
});

describe("revealedIndex（盤面の開け差分）", () => {
  const board = (revealed: number[]): BoardState => ({
    width: 2,
    height: 2,
    cells: [0, 1, 2, 3].map((i) => ({ kind: "empty", revealed: revealed.includes(i) })),
    hintRadius: 1,
    lastHint: null,
    ores: 0,
    oresTotal: 0,
    rocksHit: 0,
    done: false,
  });
  it("新しく開いたセルだけを拾う", () => {
    expect(revealedIndex(board([]), board([2]))).toBe(2);
    expect(revealedIndex(board([0]), board([0, 3]))).toBe(3);
    expect(revealedIndex(board([1]), board([1]))).toBeNull();
    expect(revealedIndex(null, board([0]))).toBeNull();
  });
});

describe("clashDelta・negoMood（駆け引きの見え方）", () => {
  const deal = (playerHp: number, opponentHp: number, extra?: Partial<DealState>): DealState => ({
    hand: [],
    opponentDeck: [],
    preview: [],
    playerHp,
    opponentHp,
    round: 0,
    done: false,
    won: null,
    ...extra,
  });
  it("削り・被弾は HP の差から取る", () => {
    expect(clashDelta(deal(10, 10), deal(8, 6))).toEqual({ dealt: 4, taken: 2 });
    // 増えた分は 0 に切る（回復表現はしない）
    expect(clashDelta(deal(8, 6), deal(10, 10))).toEqual({ dealt: 0, taken: 0 });
  });
  it("表情は押し合いの差で決まる", () => {
    expect(negoMood(10, 10, 10, false, null)).toBe("even");
    expect(negoMood(10, 6, 10, false, null)).toBe("ahead");
    expect(negoMood(6, 10, 10, false, null)).toBe("behind");
    expect(negoMood(9, 8, 10, false, null)).toBe("even");
    expect(negoMood(10, 0, 10, true, true)).toBe("beaten");
    expect(negoMood(0, 10, 10, true, false)).toBe("smug");
  });
});
