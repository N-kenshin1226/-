import type { Cond } from "@trace/core";
import { z } from "zod";

/**
 * 条件DSLの zod スキーマ。core/src/conditions/index.ts の Cond に対応する。
 * `z.ZodType<Cond>` で注釈し、スキーマ出力が Cond と一致しない場合は
 * コンパイルエラーになる（二重管理のずれを検出するため）。
 */

const compare = {
  gte: z.number().optional(),
  lte: z.number().optional(),
  eq: z.number().optional(),
};

const STAT_IDS = ["strength", "endurance", "agility", "dexterity", "perception", "spirit"] as const;

export const condSchema: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.object({ counter: z.string().min(1), ...compare }).strict(),
    z.object({ flag: z.string().min(1), eq: z.boolean().optional() }).strict(),
    z.object({ skill: z.string().min(1), ...compare }).strict(),
    z.object({ stat: z.enum(STAT_IDS), ...compare }).strict(),
    z
      .object({
        work: z
          .object({
            kind: z.string().optional(),
            tierGte: z.number().optional(),
            count: z.object({ atLeast: z.number().int().positive() }).strict().optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        time: z
          .object({
            day: z.object(compare).strict().optional(),
            age: z.object(compare).strict().optional(),
            year: z.object(compare).strict().optional(),
            dayOfSeason: z.object(compare).strict().optional(),
            weekday: z.union([z.number().int(), z.array(z.number().int())]).optional(),
            season: z.number().int().optional(),
            moon: z.enum(["new", "waxing", "full", "waning"]).optional(),
            timeOfDay: z.enum(["morning", "noon", "evening", "night"]).optional(),
          })
          .strict(),
      })
      .strict(),
    z.object({ and: z.array(condSchema).min(1) }).strict(),
    z.object({ or: z.array(condSchema).min(1) }).strict(),
    z.object({ not: condSchema }).strict(),
    z
      .object({
        within: z
          .object({
            days: z.number().int().positive(),
            kind: z.string().min(1),
            target: z.string().min(1).optional(),
            atLeast: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
  ]),
);
