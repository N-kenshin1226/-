import { z } from "zod";

/**
 * balance.json のスキーマ。
 * ゲームの数値はすべて balance.json に置く（AGENTS.md 絶対ルール）。
 * フィールドを増やすときは、このスキーマも必ず更新する。
 */
export const balanceSchema = z
  .object({
    version: z.number().int().positive(),
    /** docs/03_world_systems.md §5、core/time の TimeConfig に対応 */
    time: z
      .object({
        actionsPerDay: z.number().int().positive(),
        timeOfDay: z.array(z.enum(["morning", "noon", "evening", "night"])).min(1),
        daysPerWeek: z.number().int().positive(),
        daysPerSeason: z.number().int().positive(),
        seasonsPerYear: z.number().int().positive(),
        moonCycleDays: z.number().int().positive(),
        moonPhaseWindowDays: z.number().int().nonnegative(),
        startAge: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
