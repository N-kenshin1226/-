import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

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
    note: z.string().optional(),
  })
  .strict();

export const lifeGoalSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    condition: condSchema,
    reward: z.object({ pendingBySkill: z.record(z.string(), z.number()).optional() }).strict(),
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
