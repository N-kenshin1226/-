import raw from "../rivals.json";
import { rivalsFileSchema, type RivalsFile } from "./rivals.schema.js";

const parsed = rivalsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`rivals.json がスキーマ違反: ${parsed.error.message}`);
}
export const rivals: RivalsFile = parsed.data;
