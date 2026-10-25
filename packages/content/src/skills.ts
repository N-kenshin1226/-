import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillsFileSchema, type SkillsFile } from "./skills.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../skills.json"), "utf8"));

const parsed = skillsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`skills.json がスキーマ違反: ${parsed.error.message}`);
}

export const skills: SkillsFile = parsed.data;
