import raw from "../occasions.json";
import { occasionsFileSchema, type OccasionsFile } from "./occasions.schema.js";

const parsed = occasionsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`occasions.json がスキーマ違反: ${parsed.error.message}`);
}
export const occasions: OccasionsFile = parsed.data;
