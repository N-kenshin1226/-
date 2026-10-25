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
    /** GameState 周りの保持上限など */
    state: z
      .object({
        actionLogMax: z.number().int().positive(),
      })
      .strict(),
    /** newGame の初期値 */
    player: z
      .object({
        initialPotential: z.number().positive(),
        initialStatValue: z.number().nonnegative(),
      })
      .strict(),
    /** docs/02_growth_system.md §2。core/growth/gain.ts の GainConfig に対応 */
    gain: z
      .object({
        base: z.record(z.string(), z.number().nonnegative()),
        challengePoints: z
          .array(z.tuple([z.number(), z.number()]))
          .min(2)
          .refine(
            (pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]),
            "挑戦係数の制御点は Δ の昇順で",
          ),
        challengeTrainCap: z.number().positive(),
        noveltyK: z.number().nonnegative(),
        noveltyWindow: z.number().int().positive(),
        failMultiplier: z.number().positive(),
        modifierCap: z.number().positive(),
        diminishBase: z.number().positive(),
        diminishExponent: z.number().positive(),
        fatigueScale: z.number().positive(),
      })
      .strict(),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
