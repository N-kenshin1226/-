import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliTextSchema, type CliText } from "./cli-text.schema.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "../text/cli.json");
const parsed = cliTextSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
if (!parsed.success) {
  throw new Error(`text/cli.json がスキーマ違反: ${parsed.error.message}`);
}
export const cliText: CliText = parsed.data;
