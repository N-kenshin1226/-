import raw from "../text/cli.json";
import { cliTextSchema, type CliText } from "./cli-text.schema.js";

const parsed = cliTextSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`text/cli.json がスキーマ違反: ${parsed.error.message}`);
}
export const cliText: CliText = parsed.data;
