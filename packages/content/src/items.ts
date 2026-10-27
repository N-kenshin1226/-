import raw from "../items.json";
import { itemsFileSchema, type ItemsFile } from "./items.schema.js";

const parsed = itemsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`items.json がスキーマ違反: ${parsed.error.message}`);
}
export const items: ItemsFile = parsed.data;
