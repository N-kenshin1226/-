/**
 * hidden/crises/*.json の読み込み（docs/08 §9。本番の危機の型は隠し要素）。
 * node の fs を使うので src/index.ts（ブラウザ経路）には含めず、
 * sim などの node 側から "@trace/content/hidden" でだけ import する。
 *
 * 中身は読まない：ここではファイル名の列挙・JSONパース・スキーマ適合だけを扱い、
 * 検証メッセージにはファイル名（ID相当）だけを出す（07_story.md §5）
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crisesFileSchema, type CrisisTypeJson } from "../crises/schema.js";

/** hidden/crises ディレクトリの既定位置（パッケージルート/hidden/crises） */
function defaultDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../hidden/crises");
}

/**
 * hidden/crises/*.json をファイル名順に読み、危機の型の一覧にして返す。
 * ディレクトリが無い・空なら空配列（呼び出し側は公開サンプルに倒す）。
 * スキーマに合わないファイルはエラーにする（中身は出力しない）
 */
export function loadHiddenCrises(dir?: string): CrisisTypeJson[] {
  const base = dir ?? defaultDir();
  const names = existsSync(base)
    ? readdirSync(base)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  const out: CrisisTypeJson[] = [];
  for (const name of names) {
    const parsed = crisesFileSchema.safeParse(
      JSON.parse(readFileSync(join(base, name), "utf8")) as unknown,
    );
    if (!parsed.success) {
      throw new Error(`hidden/crises/${name} が危機の型のスキーマに合いません`);
    }
    out.push(...parsed.data.crises);
  }
  return out;
}

// K-03：合成レシピ・ユニーク・隠し分岐（同じ隠し要素の口 ——
// node 側から "./hidden" でだけ import する。中身は読まない）
export { loadHiddenK03 } from "./hidden-k03.js";
