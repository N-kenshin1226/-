import raw from "../enemies.json";
import { enemiesFileSchema, type EnemiesFile, type EnemyJson } from "./enemies.schema.js";

const parsed = enemiesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`enemies.json がスキーマ違反: ${parsed.error.message}`);
}
export const enemies: EnemiesFile = parsed.data;

/**
 * 狩りメニュー用：敵を area ごとにまとめる（T-23）。
 * エリアの並びは enemies.json 内の出現順。敵の並びはファイル順を維持する。
 */
export function enemiesByArea(file: EnemiesFile = enemies): [string, EnemyJson[]][] {
  const byArea = new Map<string, EnemyJson[]>();
  for (const e of file.enemies) {
    const list = byArea.get(e.area);
    if (list) list.push(e);
    else byArea.set(e.area, [e]);
  }
  return [...byArea.entries()];
}
