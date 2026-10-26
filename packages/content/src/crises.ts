import raw from "../crises/sample.json";
import { crisesFileSchema, type CrisesFile, type CrisisTypeJson } from "../crises/schema.js";

const parsed = crisesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`crises/sample.json がスキーマ違反: ${parsed.error.message}`);
}
export const crises: CrisesFile = parsed.data;

/** 公開サンプルの危機の型（docs/08 §9。テスト用・本番データが無いときのフォールバック） */
export const sampleCrises: readonly CrisisTypeJson[] = crises.crises;

/**
 * 世界の危機の型の一覧（docs/08 §3）。
 * hidden/crises の型があればそれを使い、無ければ公開サンプルに倒す。
 * hidden/ は node 側の src/hidden-crises.ts から読む（ブラウザ経路では sample のみ）
 */
export function crisisTypes(extra?: readonly CrisisTypeJson[]): readonly CrisisTypeJson[] {
  return extra !== undefined && extra.length > 0 ? extra : sampleCrises;
}
