import raw from "../discoveries.json";
import { discoveriesFileSchema, type DiscoveriesFile } from "./discoveries.schema.js";

const parsed = discoveriesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`discoveries.json がスキーマ違反: ${parsed.error.message}`);
}
export const discoveries: DiscoveriesFile = parsed.data;
