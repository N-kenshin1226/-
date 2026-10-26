import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enemiesFileSchema, type EnemiesFile } from "./enemies.schema.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "../enemies.json");
const parsed = enemiesFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
if (!parsed.success) {
  throw new Error(`enemies.json がスキーマ違反: ${parsed.error.message}`);
}
export const enemies: EnemiesFile = parsed.data;
