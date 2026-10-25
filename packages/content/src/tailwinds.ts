import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tailwindsFileSchema, type TailwindsFile } from "./tailwinds.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../tailwinds.json"), "utf8"));

const parsed = tailwindsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`tailwinds.json がスキーマ違反: ${parsed.error.message}`);
}

export const tailwinds: TailwindsFile = parsed.data;
