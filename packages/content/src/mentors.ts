import raw from "../mentors.json";
import { mentorsFileSchema, type MentorsFile } from "./mentors.schema.js";

const parsed = mentorsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`mentors.json がスキーマ違反: ${parsed.error.message}`);
}
export const mentors: MentorsFile = parsed.data;
