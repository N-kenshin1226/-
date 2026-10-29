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
    /** 所持金の比較（X-9 商王ルート／X-10 打診・行事の「身なり」条件） */
    z.object({ money: z.object(compare).strict() }).strict(),
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
    /** 今日の天候（X-13。weather.json の kind id の集合一致） */
    z
      .object({
        weather: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      })
      .strict(),
    /**
     * 世界の危機の進行（F-05、docs/08）：active は「進行中の危機がある」、
     * minStage は段階の下限（進行中の世界にだけ成立する）
     */
    z
      .object({
        crisis: z
          .object({
            active: z.boolean().optional(),
            minStage: z.number().int().nonnegative().optional(),
          })
          .strict(),
      })
      .strict(),
    /**
     * 習得済みの技（K-03、docs/09 §7）：player.arts にこのIDの技があるか。
     * 技×技・技能×技の組み合わせを読む条件（合成レシピ・ユニークの要求）に使う
     */
    z.object({ art: z.string().min(1) }).strict(),
    /**
     * 町から去った住人の数（X-31、docs/10 §13「人が去った町にだけ現れる場所」）。
     * town 省略時は評価中の場所の宿主町（env.town）を読む
     */
    z
      .object({
        npcGone: z
          .object({
            town: z.string().min(1).optional(),
            min: z.number().int().positive().optional(),
          })
          .strict(),
      })
      .strict(),
  ]),
);
