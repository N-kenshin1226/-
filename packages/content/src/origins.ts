import raw from "../origins.json";
import { originsFileSchema, type OriginsFile } from "./origins.schema.js";

const parsed = originsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`origins.json がスキーマ違反: ${parsed.error.message}`);
}
export const origins: OriginsFile = parsed.data;
