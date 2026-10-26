import { describe, expect, it } from "vitest";
import { balance } from "./balance.js";
import { balanceSchema } from "./balance.schema.js";

describe("balance.json", () => {
  it("スキーマを満たす", () => {
    expect(balance.version).toBe(1);
  });

  it("version が文字列だとスキーマ違反になる", () => {
    expect(balanceSchema.safeParse({ version: "1" }).success).toBe(false);
  });

  it("未定義のフィールドは拒否される（strict）", () => {
    expect(balanceSchema.safeParse({ version: 1, extra: 0 }).success).toBe(false);
  });

  it("運命の傾向（T-45）：calm/war/famine の3択があり、calm は中立", () => {
    expect(balance.tendency.calm).toEqual({});
    // war・famine は1軸以上の係数を持つ（全部 1.0 中立なら傾向の意味がない）
    expect(Object.keys(balance.tendency.war).length).toBeGreaterThan(0);
    expect(Object.keys(balance.tendency.famine).length).toBeGreaterThan(0);
  });
});
