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
});
