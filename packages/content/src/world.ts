import raw from "../world.json";
import { bundledLandmarks } from "./landmarks.js";
import { worldFileSchema, type WorldFile } from "./world.schema.js";

const parsed = worldFileSchema.safeParse({ ...raw, landmarks: bundledLandmarks });
if (!parsed.success) {
  throw new Error(`world.json がスキーマ違反: ${parsed.error.message}`);
}
export const world: WorldFile = parsed.data;
