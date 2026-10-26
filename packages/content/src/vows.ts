import raw from "../vows.json";
import { vowsFileSchema, type VowsFile } from "./vows.schema.js";

const parsed = vowsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`vows.json がスキーマ違反: ${parsed.error.message}`);
}
export const vows: VowsFile = parsed.data;
