import raw from "../titles.json";
import { titlesFileSchema, type TitlesFile } from "./titles.schema.js";

const parsed = titlesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`titles.json がスキーマ違反: ${parsed.error.message}`);
}
export const titles: TitlesFile = parsed.data;
