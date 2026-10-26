import { z } from "zod";
import { condSchema } from "./conditions.schema.js";
import { effectSchema } from "./effects.schema.js";

/** society.json — 立場・職業・人生目標（03 §1）。条件は条件DSLの条件式 */
export const standingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    order: z.number().int().nonnegative(),
    condition: condSchema.optional(),
    note: z.string().optional(),
  })
  .strict();

export const professionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    condition: condSchema,
    /** 認定の効果（T-35：対応スキルの経験係数・報酬の値段変化。語彙は effects.schema.ts） */
    effect: effectSchema.optional(),
    note: z.string().optional(),
  })
  .strict();

export const lifeGoalSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    condition: condSchema,
    reward: z.object({ pendingBySkill: z.record(z.string(), z.number()).optional() }).strict(),
    /** 成長シミュレーションの到達性検査の対象か。訓練系ボットでは満たせない条件（戦闘・仕事・打診・読了など）なら false */
    simReachable: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();

export const societyFileSchema = z
  .object({
    standings: z.array(standingSchema).min(1),
    professions: z.array(professionSchema).min(1),
    lifeGoals: z.array(lifeGoalSchema).min(1),
  })
  .strict();

export type SocietyJson = z.infer<typeof societyFileSchema>;
