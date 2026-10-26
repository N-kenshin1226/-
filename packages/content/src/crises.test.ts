import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crises, crisisTypes, sampleCrises } from "./crises.js";
import { loadHiddenCrises } from "./hidden-crises.js";
import { crisesFileSchema } from "../crises/schema.js";

/**
 * 世界の危機のコンテンツ層（W-01、docs/08 §9）。
 * 公開サンプルの検証・ローダーと hidden/crises のフォールバックを確かめる。
 * hidden/ の中身は読まない（存在しない・空なら公開サンプルに倒す）
 */

describe("crises/sample.json（公開サンプル）", () => {
  it("スキーマに適合し、危機の型が1つ以上ある", () => {
    expect(sampleCrises.length).toBeGreaterThanOrEqual(1);
    for (const c of sampleCrises) {
      expect(c.stages.length).toBeGreaterThanOrEqual(1);
      expect(c.finales.length).toBeGreaterThanOrEqual(1);
      expect(c.finales.length).toBeLessThanOrEqual(3);
      expect(c.factions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("crises エクスポートはパース済みのファイル（既定値が埋まる）", () => {
    expect(crises.crises.length).toBe(sampleCrises.length);
    for (const c of crises.crises) {
      for (const s of c.stages) {
        // effects の各配列は既定値で埋まる
        expect(Array.isArray(s.effects.closeAreas)).toBe(true);
        expect(Array.isArray(s.effects.price)).toBe(true);
        expect(Array.isArray(s.effects.enemy)).toBe(true);
        expect(Array.isArray(s.effects.npc)).toBe(true);
        expect(Array.isArray(s.effects.features)).toBe(true);
      }
    }
  });

  it("不正な危機ファイルはスキーマで弾かれる（id・段階・場面の構造）", () => {
    expect(crisesFileSchema.safeParse({ crises: [{ id: "bad", name: "x" }] }).success).toBe(false);
    // 段階や場面のid重複も弾く
    const dup = {
      crises: [
        {
          id: "crisis.x",
          name: "x",
          weight: 1,
          factions: [{ id: "f", name: "f", speed: { min: 1, max: 1 } }],
          stages: [
            { id: "s", name: "s", seasons: 1 },
            { id: "s", name: "s2", seasons: 1 },
          ],
          finales: [{ id: "f1", name: "f", atBoundary: 1, fields: ["might"], required: 0 }],
        },
      ],
    };
    expect(crisesFileSchema.safeParse(dup).success).toBe(false);
    // atBoundary は昇順必須
    const unordered = {
      crises: [
        {
          id: "crisis.x",
          name: "x",
          weight: 1,
          factions: [{ id: "f", name: "f", speed: { min: 1, max: 1 } }],
          stages: [{ id: "s", name: "s", seasons: 1 }],
          finales: [
            { id: "f2", name: "f2", atBoundary: 2, fields: ["might"], required: 0 },
            { id: "f1", name: "f1", atBoundary: 1, fields: ["might"], required: 0 },
          ],
        },
      ],
    };
    expect(crisesFileSchema.safeParse(unordered).success).toBe(false);
  });
});

describe("crisisTypes / hidden ローダー（fallback）", () => {
  it("hidden が無ければ公開サンプルに倒れる", () => {
    expect(crisisTypes()).toBe(sampleCrises);
    expect(crisisTypes([])).toBe(sampleCrises);
    const extra = [{ ...sampleCrises[0]!, id: "crisis.other", name: "別" }];
    expect(crisisTypes(extra)).toBe(extra);
  });

  it("hidden/crises ディレクトリが無い・空なら空配列（呼び出し側がサンプルに倒す）", () => {
    expect(loadHiddenCrises("/nonexistent-path")).toEqual([]);
    expect(loadHiddenCrises(mkdtempSync(join(tmpdir(), "crises-")))).toEqual([]);
    // 実リポジトリの hidden/crises は現状ファイルなし（README のみ）
    expect(loadHiddenCrises()).toEqual([]);
  });
});
