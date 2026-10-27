import { describe, expect, it } from "vitest";
import { parseDifficulty } from "./render.js";

describe("parseDifficulty（難度入力：選択式＋直接指定）", () => {
  it("空・2 は推奨値になる", () => {
    expect(parseDifficulty("", 30)).toBe(30);
    expect(parseDifficulty("  ", 30)).toBe(30);
    expect(parseDifficulty("2", 30)).toBe(30);
  });

  it("1 は抑えめ（推奨-10、下限0）・3 は高み（推奨+10）", () => {
    expect(parseDifficulty("1", 30)).toBe(20);
    expect(parseDifficulty("3", 30)).toBe(40);
    expect(parseDifficulty("1", 5)).toBe(0);
  });

  it("その他の非負整数は直接指定として通る", () => {
    expect(parseDifficulty("55", 30)).toBe(55);
    expect(parseDifficulty("0", 30)).toBe(0);
    expect(parseDifficulty("120", 30)).toBe(120);
  });

  it("不正な入力は null（負数・非数値）", () => {
    expect(parseDifficulty("abc", 30)).toBeNull();
    expect(parseDifficulty("-5", 30)).toBeNull();
    expect(parseDifficulty("1.5.2", 30)).toBeNull();
  });
});
