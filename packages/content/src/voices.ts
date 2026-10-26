import raw from "../voices.json";
import { voicesFileSchema, type VoicesFile } from "./voices.schema.js";

const parsed = voicesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`voices.json がスキーマ違反: ${parsed.error.message}`);
}
export const voices: VoicesFile = parsed.data;
