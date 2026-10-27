import raw from "../places.json";
import { placesFileSchema, type PlacesFile } from "./places.schema.js";

const parsed = placesFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`places.json がスキーマ違反: ${parsed.error.message}`);
}
export const places: PlacesFile = parsed.data;
