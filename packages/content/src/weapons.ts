import raw from "../weapons.json";
import { weaponsFileSchema, type WeaponsFile } from "./weapons.schema.js";

const parsed = weaponsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`weapons.json がスキーマ違反: ${parsed.error.message}`);
}
export const weapons: WeaponsFile = parsed.data;
