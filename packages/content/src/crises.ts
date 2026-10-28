import raw from "../crises/sample.json";
import hiddenRaw from "../hidden/crises/types.json";
import { crisesFileSchema, type CrisesFile, type CrisisTypeJson } from "../crises/schema.js";

const parsed = crisesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`crises/sample.json がスキーマ違反: ${parsed.error.message}`);
}
export const crises: CrisesFile = parsed.data;

/** 公開サンプルの危機の型（docs/08 §9。テスト用・本番データが無いときのフォールバック） */
export const sampleCrises: readonly CrisisTypeJson[] = crises.crises;

/**
 * ビルドに同梱される本番の危機の型（docs/08 §9。ブラウザなど fs の無い経路用）。
 * 中身は読まない —— ここではスキーマ適合だけを扱い、検証メッセージにも中身を出さない
 */
const hiddenParsed = crisesFileSchema.safeParse(hiddenRaw);
if (!hiddenParsed.success) {
  throw new Error("hidden/crises/types.json が危機の型のスキーマに合いません");
}
export const bundledCrises: readonly CrisisTypeJson[] = hiddenParsed.data.crises;

/**
 * 世界の危機の型の一覧（docs/08 §3）。
 * 明示された型があればそれを使い、無ければ本番の危機の型（hidden/crises 同梱分）、
 * それも無ければ公開サンプルに倒す
 */
export function crisisTypes(extra?: readonly CrisisTypeJson[]): readonly CrisisTypeJson[] {
  if (extra !== undefined && extra.length > 0) return extra;
  return bundledCrises.length > 0 ? bundledCrises : sampleCrises;
}
