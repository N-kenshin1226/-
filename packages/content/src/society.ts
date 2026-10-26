import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { societyFileSchema, type SocietyJson } from "./society.schema.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "../society.json");
const parsed = societyFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
if (!parsed.success) {
  throw new Error(`society.json がスキーマ違反: ${parsed.error.message}`);
}
export const society: SocietyJson = parsed.data;
