import raw from "../text/narration.json";
import { narrationSchema, type NarrationText } from "./narration.schema.js";

const parsed = narrationSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`text/narration.json がスキーマ違反: ${parsed.error.message}`);
}
export const narration: NarrationText = parsed.data;
