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
    /** docs/02_growth_system.md §3。core/growth/consolidate.ts の SleepConfig に対応 */
    sleep: z
      .object({
        nightlyCapPerSkill: z.number().positive(),
        carryoverRatio: z.number().min(0).max(1),
        innFactors: z
          .object({
            cheap: z.number().positive(),
            normal: z.number().positive(),
            good: z.number().positive(),
          })
          .strict(),
        dinnerFactors: z
          .object({
            withDinner: z.number().positive(),
            noDinner: z.number().positive(),
          })
          .strict(),
        qualityMin: z.number().positive(),
        qualityMax: z.number().positive(),
        potentialDecayPerPoint: z.number().min(0).max(1),
      })
      .strict(),
    /** docs/02_growth_system.md §5。core/growth/body.ts の BodyConfig に対応 */
    body: z
      .object({
        fatiguePerAction: z.record(z.string(), z.number().nonnegative()),
        fatigueDefaultPerAction: z.number().nonnegative(),
        fatigueRecover: z.number().positive(),
        statLoadPerAction: z.record(
          z.string(),
          z
            .object({
              strength: z.number().nonnegative().optional(),
              endurance: z.number().nonnegative().optional(),
              agility: z.number().nonnegative().optional(),
              dexterity: z.number().nonnegative().optional(),
              perception: z.number().nonnegative().optional(),
              spirit: z.number().nonnegative().optional(),
            })
            .strict(),
        ),
        statGainPerLoad: z.number().nonnegative(),
        overloadThreshold: z.number().nonnegative(),
        overworkStreakDays: z.number().int().positive(),
        overworkConsolidateFactor: z.number().min(0).max(1),
        restQuality: z.number().positive(),
        restPotentialRecover: z.number().nonnegative(),
        potentialMax: z.number().positive(),
      })
      .strict(),
    /** docs/02_growth_system.md §4。core/growth/tailwind.ts の TailwindConfig に対応 */
    tailwind: z
      .object({
        tailwindFactor: z.number().min(1).max(2),
        headwindFactor: z.number().min(0.5).max(1),
        recentDays: z.number().int().min(1).max(14),
        headwindBiasK: z.number().min(0).max(10),
        tailwindBoostK: z.number().min(0).max(10),
        drawMin: z.number().int().min(1),
        drawMax: z.number().int().min(1),
      })
      .strict()
      .refine((t) => t.drawMin <= t.drawMax, { message: "drawMin <= drawMax が必要" }),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
