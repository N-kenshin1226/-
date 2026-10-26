import raw from "../society.json";
import { societyFileSchema, type SocietyJson } from "./society.schema.js";

const parsed = societyFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`society.json がスキーマ違反: ${parsed.error.message}`);
}
export const society: SocietyJson = parsed.data;
