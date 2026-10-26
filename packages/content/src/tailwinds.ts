import raw from "../tailwinds.json";
import { tailwindsFileSchema, type TailwindsFile } from "./tailwinds.schema.js";

const parsed = tailwindsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`tailwinds.json がスキーマ違反: ${parsed.error.message}`);
}
export const tailwinds: TailwindsFile = parsed.data;
