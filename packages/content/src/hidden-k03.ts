/**
 * hidden/k03/*.json の読み込み（K-03、docs/09 §7「なろう系」の隠し要素。
 * 合成レシピ・ユニークスキル・隠し分岐は隠し要素 —— 07_story.md §5）。
 * node の fs を使うので src/index.ts（ブラウザ経路）には含めず、
 * sim などの node 側から "@trace/content/hidden" でだけ import する。
 *
 * 中身は読まない：ここではファイル名の列挙・JSONパース・スキーマ適合だけを扱い、
 * 検証メッセージにはファイル名（ID相当）だけを出す
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { k03FileSchema, type K03File } from "../k03/schema.js";

/** hidden/k03 ディレクトリの既定位置（パッケージルート/hidden/k03） */
function defaultDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../hidden/k03");
}

/**
 * hidden/k03/*.json をファイル名順に読み、K-03 の隠し要素をまとめて返す。
 * ディレクトリが無い・空なら空の骨格（呼び出し側は公開サンプルに倒す）。
 * スキーマに合わないファイルはエラーにする（中身は出力しない）
 */
export function loadHiddenK03(dir?: string): K03File {
  const base = dir ?? defaultDir();
  const names = existsSync(base)
    ? readdirSync(base)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  const out: K03File = { version: 1, uniques: [], recipes: [], hiddenBranches: [] };
  for (const name of names) {
    const parsed = k03FileSchema.safeParse(
      JSON.parse(readFileSync(join(base, name), "utf8")) as unknown,
    );
    if (!parsed.success) {
      throw new Error(`hidden/k03/${name} が K-03 のスキーマに合いません`);
    }
    out.uniques.push(...parsed.data.uniques);
    out.recipes.push(...parsed.data.recipes);
    out.hiddenBranches.push(...parsed.data.hiddenBranches);
  }
  return out;
}
