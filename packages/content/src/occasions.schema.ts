import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * occasions.json — 勝負所の行事（X-10、docs/03 §2「勝負所でミニゲームが出る」）。
 *
 * 品評会・決闘・大取引のような「ここ一番の勝負」の表。打診が届く条件・
 * 話し手・勝負の器・勝敗の効果をここで組む（数値の調整自体は balance.json の
 * occasions 節）。vessel.skill はミニゲームの皮になる技能ID（smithing /
 * performance / fishing / mining / appraisal / eloquence）、vessel.ref は
 * 決闘の相手の敵ID（enemies.json）
 */

/** 打診を運ぶ者：街の住人（voices.json の id）か、名のあるライバル（抽選の index）か */
export const occasionSpeakerSchema = z.union([
  z.object({ kind: z.literal("npc"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("rival"), index: z.number().int().nonnegative() }).strict(),
]);

/** 勝負の器：既存のミニゲームの皮か、一騎打ちの戦闘か */
export const occasionVesselSchema = z.union([
  z
    .object({
      kind: z.literal("minigame"),
      skill: z.string().min(1),
      targetQuality: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat"),
      ref: z.string().min(1),
    })
    .strict(),
]);

/** 勝敗ごとの効果：賞金（負値なら掛け金の損失）・評判・旗印 */
export const occasionSideSchema = z
  .object({
    money: z.number().optional(),
    renown: z.number().optional(),
    flags: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export const occasionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    name: z.string().min(1),
    /** 同じ種類が続かない間隔の単位（例: exhibition / duel / deal / appraisal） */
    kind: z.string().regex(/^[a-z0-9_]+$/),
    speaker: occasionSpeakerSchema,
    /** 打診の台詞（会話窓に出す人物の言葉） */
    line: z.string().min(1),
    /** 提示条件（条件DSL。省略時は無条件） */
    require: condSchema.optional(),
    /** 周期開催：(day - offset) % days === 0 の日だけ候補になる */
    every: z
      .object({
        days: z.number().int().min(2),
        offset: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    /** 抽選の重み（省略時 1） */
    weight: z.number().positive().optional(),
    /** この行事が再び届くまでの最小間隔（日。省略時は balance の既定） */
    cooldownDays: z.number().int().nonnegative().optional(),
    vessel: occasionVesselSchema,
    win: occasionSideSchema.optional(),
    loss: occasionSideSchema.optional(),
  })
  .strict();

export const occasionsFileSchema = z
  .object({
    version: z.literal(1),
    occasions: z.array(occasionSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const o of file.occasions) {
      if (seen.has(o.id)) ctx.addIssue({ code: "custom", message: `行事 id の重複: ${o.id}` });
      seen.add(o.id);
    }
  });

export type OccasionJson = z.infer<typeof occasionSchema>;
export type OccasionsFile = z.infer<typeof occasionsFileSchema>;
