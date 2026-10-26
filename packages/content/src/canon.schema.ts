import { z } from "zod";

/** canon.json — 正史（docs/07_story.md §4）。アトムが参照できるIDの唯一の正本 */
export const canonSchema = z
  .object({
    era: z.object({ name: z.string().min(1), year: z.number().int(), note: z.string() }).strict(),
    setting: z.object({ town: z.string().min(1), note: z.string() }).strict(),
    events: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            summary: z.string().min(1),
            /** つながりの報酬：facts が全て判明すると flag が立つ（隠し依頼の入口） */
            reward: z
              .object({ facts: z.array(z.string().min(1)).min(1), flag: z.string().min(1) })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .min(1),
    places: z.array(
      z.object({ id: z.string().min(1), name: z.string().min(1), summary: z.string() }).strict(),
    ),
    figures: z.array(
      z.object({ id: z.string().min(1), name: z.string().min(1), role: z.string() }).strict(),
    ),
    /** 断言できる事実の一覧。アトムの reveals はここにあるIDだけ */
    facts: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()),
    /** 文体lintの規則（lore:check が読む。style.md は人向けの説明） */
    styleLint: z
      .object({
        maxTextLength: z.number().int().positive(),
        minTextLength: z.number().int().nonnegative(),
        forbidden: z.array(z.string().min(1)),
        /** fact アトムの本文に現れてはいけない推量表現 */
        factForbidden: z.array(z.string().min(1)),
        /** 似文の重複検出のしきい値（0〜1、文字bigramの一致率） */
        similarityThreshold: z.number().min(0.5).max(1),
      })
      .strict(),
  })
  .strict();

export type Canon = z.infer<typeof canonSchema>;
