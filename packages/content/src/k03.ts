import raw from "../k03/sample.json";
import hiddenRaw from "../hidden/k03/k03.json";
import { k03FileSchema, type K03DefJson, type K03File } from "../k03/schema.js";
import type { ArtDef, EvolveBranch, EvolveMod, SynthesisRecipe, UniqueDef } from "@trace/core";
import { arts } from "./arts.js";
import { spells } from "./spells.js";
import type { ArtJson } from "./arts.schema.js";
import type { SpellJson } from "./spells.schema.js";

/**
 * K-03「技の進化・合成・ユニークスキル」のコンテンツ層（docs/09 §7）。
 *
 * - arts.json / spells.json の evolve 節から、分岐の mod を基底に畳み込んだ
 *   派生定義を materialize する（派生 id = `${元id}__e${分岐番号}`）
 * - hidden/k03（本番の隠し要素：合成レシピ・ユニーク・隠し分岐）は
 *   k03/sample.json（公開サンプル）と同じ形式。本番があればそちらを使い、
 *   無ければ公開サンプルに倒す（crisisTypes と同じ口）
 * - 隠し分岐の派生 id = `${元id}__h${分岐番号}`。合成・ユニークの技は
 *   ファイルに埋め込まれた定義（x_ 始まり）をそのまま定義表に足す
 *
 * ブラウザは fs を使えないので本番分は静的 import で同梱する（中身は読まない）
 */

const parsed = k03FileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`k03/sample.json がスキーマ違反: ${parsed.error.message}`);
}
export const k03Sample: K03File = parsed.data;

/** ビルドに同梱される本番の K-03 データ（中身は読まない） */
const hiddenParsed = k03FileSchema.safeParse(hiddenRaw);
if (!hiddenParsed.success) {
  throw new Error("hidden/k03/k03.json が K-03 のスキーマに合いません");
}
export const bundledK03: K03File = hiddenParsed.data;

/**
 * K-03 のデータ本体：明示されたものがあればそれ、なければ本番（hidden）、
 * それも無ければ公開サンプルに倒す（crisisTypes と同じ口）
 */
export function k03File(extra?: K03File): K03File {
  if (extra !== undefined) return extra;
  const hasContent =
    bundledK03.uniques.length > 0 ||
    bundledK03.recipes.length > 0 ||
    bundledK03.hiddenBranches.length > 0;
  return hasContent ? bundledK03 : k03Sample;
}

/** 埋め込み定義（x_ 始まり）→ ArtDef。learn を持たないので技能値では覚えない */
function k03DefToArtDef(j: K03DefJson): ArtDef {
  const { id, name, skill, kind, ki, ct, desc, ...rest } = j;
  const def: ArtDef = { id, name, skill, kind, ki, ct, desc, learn: {} };
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) (def as unknown as Record<string, unknown>)[k] = v;
  }
  return def;
}

/**
 * 進化形の差分を基底に畳み込んで派生定義を作る。
 * 派生定義は終端（さらに分岐しない）・learn.at を持たない（進化だけの経路）
 */
export function applyEvolveMod(base: ArtDef, mod: EvolveMod, id: string): ArtDef {
  const d: ArtDef = {
    ...base,
    id,
    name: mod.name ?? base.name,
    desc: mod.desc ?? base.desc,
    learn: {},
    evolve: undefined,
  };
  for (const k of [
    "power",
    "dtype",
    "part",
    "hits",
    "hitBonus",
    "heavy",
    "pierceArmor",
    "response",
    "ki",
    "ct",
    "range",
    "effect",
  ] as const) {
    if (mod[k] !== undefined) (d as unknown as Record<string, unknown>)[k] = mod[k];
  }
  if (mod.status !== undefined) {
    if (mod.status === null) {
      delete d.status;
    } else {
      d.status = mod.status;
    }
  }
  // 呪文面：基底が呪文のときだけ畳み込む（element/tier は基底を継ぐ。
  // 呪文でない技に spell の差分が来た場合は無視 —— データ側の責任）
  if (mod.spell !== undefined && base.spell !== undefined) {
    const s = mod.spell;
    d.spell = {
      ...base.spell,
      mana: s.mana ?? base.spell.mana,
      cast: s.cast ?? base.spell.cast,
      ...(s.heal !== undefined ? { heal: s.heal } : {}),
      ...(s.drain !== undefined ? { drain: s.drain } : {}),
      ...(s.life !== undefined ? { life: s.life } : {}),
    };
  }
  return d;
}

/**
 * arts.json / spells.json の定義一覧 → 解決済みの定義表。
 * evolve 節の分岐ごとに派生定義を materialize して表に足し、分岐には
 * 派生 id（to）を刻む。戻り値は「元＋派生」の全定義を含む
 */
export function materializeArts(defs: readonly (ArtJson | SpellJson)[]): Record<string, ArtDef> {
  const out: Record<string, ArtDef> = {};
  for (const j of defs) {
    const { evolve, ...rest } = j;
    const base = rest as ArtDef;
    const branches: EvolveBranch[] = [];
    (evolve?.branches ?? []).forEach((b, i) => {
      const to = `${j.id}__e${i}`;
      out[to] = applyEvolveMod(base, b.mod, to);
      branches.push({ tilt: b.tilt, reason: b.reason, weights: b.weights, to });
    });
    out[j.id] = branches.length > 0 ? { ...base, evolve: { branches } } : base;
  }
  return out;
}

/**
 * K-03 のデータ全体を解決した形（StepConfig 注入用）。
 * defs は arts＋spells＋派生＋合成産物＋ユニークを全部含む ——
 * combat/arts 設定の defs と画面の名前解決はこの表を使う
 */
export interface K03Resolved {
  /** 全定義表（元＋進化形＋隠し分岐形＋合成産物＋ユニーク） */
  defs: Record<string, ArtDef>;
  /** 隠し分岐の表（元の技 id → 分岐列。EvolutionConfig.hidden にそのまま渡す） */
  hiddenBranches: Record<string, EvolveBranch[]>;
  /** 合成レシピ（core の SynthesisRecipe 形） */
  recipes: SynthesisRecipe[];
  /** ユニークの定義（core の UniqueDef 形） */
  uniques: UniqueDef[];
}

export function k03Resolve(file?: K03File): K03Resolved {
  const f = k03File(file);
  const defs = materializeArts([...arts.arts, ...spells.spells]);
  const hiddenBranches: Record<string, EvolveBranch[]> = {};
  for (const b of f.hiddenBranches) {
    const base = defs[b.from];
    if (base === undefined) continue; // 元の技が無い世界ではその分岐は無い
    const to = `${b.from}__h${(hiddenBranches[b.from] ?? []).length}`;
    defs[to] = applyEvolveMod(base, b.mod, to);
    (hiddenBranches[b.from] ??= []).push({
      tilt: b.tilt,
      reason: b.reason,
      weights: b.weights,
      to,
      hidden: true,
    });
  }
  const recipes: SynthesisRecipe[] = [];
  for (const r of f.recipes) {
    if (defs[r.def.id] !== undefined) continue; // id 衝突は後勝ちにしない
    defs[r.def.id] = k03DefToArtDef(r.def);
    recipes.push({
      to: r.def.id,
      condition: r.condition,
      ...(r.hint !== undefined ? { hint: r.hint } : {}),
    });
  }
  const uniques: UniqueDef[] = [];
  for (const u of f.uniques) {
    if (defs[u.def.id] !== undefined) continue;
    defs[u.def.id] = k03DefToArtDef(u.def);
    uniques.push({
      art: u.def.id,
      condition: u.condition,
      ...(u.rival !== undefined ? { rival: u.rival } : {}),
    });
  }
  return { defs, hiddenBranches, recipes, uniques };
}
