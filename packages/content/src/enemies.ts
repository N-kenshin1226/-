import raw from "../enemies.json";
import { enemiesFileSchema, type EnemiesFile } from "./enemies.schema.js";

const parsed = enemiesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`enemies.json がスキーマ違反: ${parsed.error.message}`);
}
export const enemies: EnemiesFile = parsed.data;
