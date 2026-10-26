import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { narrationSchema, type NarrationText } from "./narration.schema.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "../text/narration.json");
const parsed = narrationSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
if (!parsed.success) {
  throw new Error(`text/narration.json がスキーマ違反: ${parsed.error.message}`);
}
export const narration: NarrationText = parsed.data;
