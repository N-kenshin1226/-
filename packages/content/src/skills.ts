import raw from "../skills.json";
import { skillsFileSchema, type SkillsFile } from "./skills.schema.js";

const parsed = skillsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`skills.json がスキーマ違反: ${parsed.error.message}`);
}
export const skills: SkillsFile = parsed.data;
