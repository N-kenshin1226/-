import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { titlesFileSchema, type TitlesFile } from "./titles.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../titles.json"), "utf8"));

const parsed = titlesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`titles.json がスキーマ違反: ${parsed.error.message}`);
}

export const titles: TitlesFile = parsed.data;
