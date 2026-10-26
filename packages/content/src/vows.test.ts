import { describe, expect, it } from "vitest";
import { vows } from "./vows.js";
import { vowsFileSchema } from "./vows.schema.js";
import { titles } from "./titles.js";

/**
 * vows.json（T-46、docs/06 §3C）：誓約は難度修飾子5個から。
 * 各誓約は WorldMods 1効果ずつで、対応する称号が titles.json にある
 */
describe("vows.json", () => {
  it("5個の誓約が定義されている", () => {
    expect(vows.vows).toHaveLength(5);
  });

  it("各誓約は1効果ずつ持ち、対応する称号が titles.json に存在する", () => {
    const titleIds = new Set(titles.titles.map((t) => t.id));
    for (const v of vows.vows) {
      expect(Object.keys(v.mods)).toHaveLength(1);
      expect(titleIds.has(v.title)).toBe(true);
    }
  });

  it("効果のない誓約はスキーマ違反になる", () => {
    const bad = {
      version: 1,
      vows: [{ id: "vow.x", name: "x", desc: "x", mods: {}, title: "title.y" }],
    };
    expect(vowsFileSchema.safeParse(bad).success).toBe(false);
  });

  it("誓約IDの重複はスキーマ違反になる", () => {
    const v = vows.vows[0]!;
    const bad = { version: 1, vows: [v, v] };
    expect(vowsFileSchema.safeParse(bad).success).toBe(false);
  });
});
