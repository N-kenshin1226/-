import raw from "../audio.json";
import { audioFileSchema, type AudioFile } from "./audio.schema.js";

const parsed = audioFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`audio.json がスキーマ違反: ${parsed.error.message}`);
}
export const audio: AudioFile = parsed.data;
