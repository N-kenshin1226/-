import raw from "../spells.json";
import { spellsFileSchema, type SpellJson, type SpellsFile } from "./spells.schema.js";

const parsed = spellsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`spells.json がスキーマ違反: ${parsed.error.message}`);
}
export const spells: SpellsFile = parsed.data;

/**
 * 呪文・魔法パッシブの定義表（id → 定義）。
 * core/arts の ArtDef にそのまま渡せる解決済みマップ —— 武技と呪文は
 * 同じ定義型を共有する（M-01）
 */
export const spellDefs: Record<string, SpellJson> = Object.fromEntries(
  spells.spells.map((a) => [a.id, a]),
);
