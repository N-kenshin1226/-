import raw from "../scenery.json";
import { sceneryFileSchema, type SceneryFile } from "./scenery.schema.js";

const parsed = sceneryFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`scenery.json がスキーマ違反: ${parsed.error.message}`);
}
export const scenery: SceneryFile = parsed.data;
