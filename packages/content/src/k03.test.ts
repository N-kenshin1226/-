import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEvolveMod,
  bundledK03,
  k03File,
  k03Resolve,
  k03Sample,
  materializeArts,
} from "./k03.js";
import { loadHiddenK03 } from "./hidden-k03.js";
import { arts } from "./arts.js";
import { spells } from "./spells.js";
import { k03FileSchema, type K03File } from "../k03/schema.js";
import { COMBAT_ART_KINDS } from "@trace/core";

/**
 * K-03「技の進化・合成・ユニークスキル」のコンテンツ層（docs/09 §7）。
 * 公開の進化分岐の materialize・k03 ファイルのフォールバック・
 * 派生/特別定義の形を確かめる。hidden/k03 の中身は読まない（件数と形だけ）
 */

const publicDefs = [...arts.arts, ...spells.spells];

describe("arts.json / spells.json の evolve 節", () => {
  it("戦闘で使える種類（attack/response/support/heal）の技は全て進化分岐を持つ", () => {
    for (const d of publicDefs) {
      if (!COMBAT_ART_KINDS.includes(d.kind)) continue;
      expect(d.evolve?.branches.length, `${d.id}（${d.kind}）`).toBeGreaterThanOrEqual(1);
    }
  });

  it("経験が積めない種類（passive/life）は進化分岐を持たない", () => {
    for (const d of publicDefs) {
      if (COMBAT_ART_KINDS.includes(d.kind)) continue;
      expect(d.evolve, `${d.id}（${d.kind}）`).toBeUndefined();
    }
  });

  it("分岐の傾き・理由・重みは全て埋まっていて、重みのタグは戦闘の使用タグの語彙", () => {
    for (const d of publicDefs) {
      for (const b of d.evolve?.branches ?? []) {
        expect(b.tilt.length).toBeGreaterThan(0);
        expect(b.reason.length).toBeGreaterThan(0);
        expect(Object.keys(b.weights).length).toBeGreaterThan(0);
        for (const w of Object.values(b.weights)) expect(w).toBeGreaterThan(0);
      }
    }
  });
});

describe("materializeArts（派生定義の生成）", () => {
  const defs = materializeArts(publicDefs);

  it("分岐ごとに `${元id}__e${番号}` の派生定義が表に足され、分岐の to に刻まれる", () => {
    let derived = 0;
    for (const d of publicDefs) {
      (d.evolve?.branches ?? []).forEach((_b, i) => {
        const id = `${d.id}__e${i}`;
        derived++;
        expect(defs[id], id).toBeDefined();
        // 基底の定義側の分岐に進化先 id が materialize されている
        expect(defs[d.id]?.evolve?.branches[i]?.to).toBe(id);
      });
    }
    expect(derived).toBeGreaterThan(0);
    // 元＋派生の総数
    expect(Object.keys(defs).length).toBe(publicDefs.length + derived);
  });

  it("派生定義は終端（evolve 無し）・learn.at を持たない（習得経路は進化だけ）", () => {
    for (const [id, def] of Object.entries(defs)) {
      if (!id.includes("__")) continue;
      expect(def.evolve, id).toBeUndefined();
      expect(def.learn.at, id).toBeUndefined();
    }
  });

  it("基底の mod 差分が畳み込まれる（name/威力・説明）", () => {
    const src = publicDefs.find((d) => (d.evolve?.branches.length ?? 0) > 0)!;
    const b = src.evolve!.branches[0]!;
    const d = defs[`${src.id}__e0`]!;
    expect(d.name).toBe(b.mod.name ?? src.name);
    expect(d.power).toBe(b.mod.power ?? src.power);
  });
});

describe("applyEvolveMod", () => {
  it("指定のある差分だけ上書きし、learn/evolve は終端に潰す", () => {
    const base = materializeArts(publicDefs)["s_slash"];
    const target = base ?? Object.values(materializeArts(publicDefs))[0]!;
    const d = applyEvolveMod(target, { name: "別名", power: 9 }, "x_test");
    expect(d.id).toBe("x_test");
    expect(d.name).toBe("別名");
    expect(d.power).toBe(9);
    expect(d.learn).toEqual({});
    expect(d.evolve).toBeUndefined();
    // 差分に無い項目は基底のまま
    expect(d.skill).toBe(target.skill);
  });
});

describe("k03/sample.json（公開サンプル）", () => {
  it("スキーマに適合し、合成・ユニークの技IDは x_ 始まり", () => {
    expect(k03FileSchema.safeParse(k03Sample).success).toBe(true);
    for (const r of k03Sample.recipes) expect(r.def.id).toMatch(/^x_/);
    for (const u of k03Sample.uniques) expect(u.def.id).toMatch(/^x_/);
  });

  it("隠し分岐の from は公開の技を指す（公開サンプルは公開の世界だけで完結する）", () => {
    const ids = new Set(publicDefs.map((d) => d.id));
    for (const b of k03Sample.hiddenBranches) {
      expect(ids.has(b.from), b.from).toBe(true);
    }
  });

  it("不正な k03 ファイルはスキーマで弾かれる", () => {
    expect(k03FileSchema.safeParse({ uniques: [{ art: "x" }] }).success).toBe(false);
    // 条件の無いユニーク・to の無いレシピは弾く
    expect(
      k03FileSchema.safeParse({
        uniques: [
          { def: { id: "x_a", name: "x", skill: "s", kind: "attack", ki: 1, ct: 1, desc: "d" } },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("k03Resolve（解決済みデータ）", () => {
  it("公開サンプルのみの世界でもレシピ・ユニークの技は全定義表に足される", () => {
    const r = k03Resolve(k03Sample);
    for (const rec of k03Sample.recipes) {
      expect(r.defs[rec.def.id], rec.def.id).toBeDefined();
    }
    for (const u of k03Sample.uniques) {
      expect(r.defs[u.def.id], u.def.id).toBeDefined();
    }
    // サンプルの件数がそのまま出る
    expect(r.recipes.length).toBe(k03Sample.recipes.length);
    expect(r.uniques.length).toBe(k03Sample.uniques.length);
  });

  it("隠し分岐は `${from}__h${番号}` の派生定義を足し、表は from ごとの列になる", () => {
    const sample: K03File = {
      version: 1,
      uniques: [],
      recipes: [],
      hiddenBranches: [
        {
          from: "s_slash",
          tilt: "試し",
          reason: "試した",
          weights: { "foe.beast": 1 },
          mod: { name: "試しの形" },
        },
      ],
    };
    const r = k03Resolve(sample);
    expect(r.defs["s_slash__h0"]).toBeDefined();
    expect(r.defs["s_slash__h0"]?.name).toBe("試しの形");
    expect(r.hiddenBranches["s_slash"]).toHaveLength(1);
    expect(r.hiddenBranches["s_slash"]![0]!.to).toBe("s_slash__h0");
    expect(r.hiddenBranches["s_slash"]![0]!.hidden).toBe(true);
  });

  it("元の技が無い隠し分岐は捨てる（他の世界の技を指していても混入しない）", () => {
    const sample: K03File = {
      version: 1,
      uniques: [],
      recipes: [],
      hiddenBranches: [
        {
          from: "no_such_art",
          tilt: "x",
          reason: "x",
          weights: { a: 1 },
          mod: { name: "x" },
        },
      ],
    };
    const r = k03Resolve(sample);
    expect(r.hiddenBranches["no_such_art"]).toBeUndefined();
    expect(r.defs["no_such_art__h0"]).toBeUndefined();
  });

  it("特別な技（x_）の id 衝突は後勝ちにしない（公開の技を上書きしない）", () => {
    const first = publicDefs[0]!;
    const sample: K03File = {
      version: 1,
      uniques: [
        {
          def: {
            id: first.id,
            name: "衝突",
            skill: first.skill,
            kind: "attack",
            ki: 1,
            ct: 1,
            desc: "d",
          },
          condition: { flag: "x" },
        },
      ],
      recipes: [],
      hiddenBranches: [],
    };
    const r = k03Resolve(sample);
    expect(r.defs[first.id]?.name).toBe(first.name); // 公開の定義のまま
    expect(r.uniques).toHaveLength(0); // 採用されない
  });
});

describe("k03File / hidden ローダー（fallback）", () => {
  it("既定は本番（hidden 同梱分）があればそれ、明示したデータはそのまま使う", () => {
    // hidden の中身は読まない：件数の有無だけを確かめる
    const hasHidden =
      bundledK03.uniques.length + bundledK03.recipes.length + bundledK03.hiddenBranches.length > 0;
    if (hasHidden) {
      expect(k03File()).toBe(bundledK03);
    } else {
      expect(k03File()).toBe(k03Sample);
    }
    expect(k03File(k03Sample)).toBe(k03Sample);
  });

  it("hidden/k03 ディレクトリが無い・空なら既定の空ファイル（呼び出し側が倒す）", () => {
    const none = loadHiddenK03("/nonexistent-path");
    expect(none.uniques).toEqual([]);
    expect(none.recipes).toEqual([]);
    expect(none.hiddenBranches).toEqual([]);
    const empty = loadHiddenK03(mkdtempSync(join(tmpdir(), "k03-")));
    expect(empty.uniques).toEqual([]);
  });

  it("スキーマに合わない hidden ファイルは中身を出さずエラーにする", () => {
    const dir = mkdtempSync(join(tmpdir(), "k03bad-"));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ uniques: [{ art: 1 }] }));
    expect(() => loadHiddenK03(dir)).toThrow();
  });
});
