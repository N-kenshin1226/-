import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * 技能の分野（K-01、docs/02 §1）。ステータス画面の分野別表示と
 * コンテンツ検査（分野ごとの行動・効果の偏り検出）に使う。
 * derived は派生技能（前提を満たすと開く複合技能）の分類。
 */
export const SKILL_CATEGORIES = [
  "combat",
  "body",
  "craft",
  "gather",
  "knowledge",
  "social",
  "prayer",
  "magic",
  "derived",
] as const;

export const skillCategorySchema = z.enum(SKILL_CATEGORIES);
export type SkillCategory = z.infer<typeof skillCategorySchema>;

export const skillSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "id は snake_case の英字始まり"),
    name: z.string().min(1),
    /** 技能の分野（SKILL_CATEGORIES）。派生技能は "derived" */
    category: skillCategorySchema,
    /**
     * 解放条件（派生技能・隠し技能）。省略＝最初から鍛えられる。
     * unlock がある技能は解放まで「？？？」と伏せて表示する
     */
    unlock: condSchema.optional(),
  })
  .strict()
  .refine((s) => s.category !== "derived" || s.unlock !== undefined, {
    message: "category=derived（派生技能）には unlock（前提条件）が必要",
  });

export const skillsFileSchema = z
  .object({
    skills: z.array(skillSchema).min(1),
  })
  .strict();

export type Skill = z.infer<typeof skillSchema>;
export type SkillsFile = z.infer<typeof skillsFileSchema>;
