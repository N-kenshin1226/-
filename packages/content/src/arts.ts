import raw from "../arts.json";
import { artsFileSchema, type ArtJson, type ArtsFile } from "./arts.schema.js";

const parsed = artsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`arts.json がスキーマ違反: ${parsed.error.message}`);
}
export const arts: ArtsFile = parsed.data;

/** 技の定義表（id → 定義。combat の ArtDef として注入する解決済みマップ） */
export const artDefs: Record<string, ArtJson> = Object.fromEntries(arts.arts.map((a) => [a.id, a]));
