import raw from "../pinnacles.json";
import { pinnaclesFileSchema, type PinnaclesFile } from "./pinnacles.schema.js";

const parsed = pinnaclesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`pinnacles.json がスキーマ違反: ${parsed.error.message}`);
}
export const pinnacles: PinnaclesFile = parsed.data;
