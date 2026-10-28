import raw from "../world.json";
import { worldFileSchema, type WorldFile } from "./world.schema.js";

const parsed = worldFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`world.json がスキーマ違反: ${parsed.error.message}`);
}
export const world: WorldFile = parsed.data;
