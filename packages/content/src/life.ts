import raw from "../life.json";
import { lifeFileSchema, type LifeFile } from "./life.schema.js";

const parsed = lifeFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`life.json がスキーマ違反: ${parsed.error.message}`);
}
export const life: LifeFile = parsed.data;
