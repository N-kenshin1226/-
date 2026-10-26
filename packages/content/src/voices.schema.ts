import { z } from "zod";

/**
 * voices.json — NPCの口調テンプレ差分（03 §1「NPCの態度の変化で成り上がりを見せる」）。
 * {name} はプレイヤー名、{deed} は直近の話題に置換される。
 * 形は narration の npcWord テンプレと同じ（greet/respect＋立場ごとの差分）
 */
export const voiceLinesSchema = z
  .object({
    /** 話題が無いときの挨拶（{name}） */
    greet: z.array(z.string()).min(1),
    /** 直近の話題に触れる一言（{name}/{deed}） */
    respect: z.array(z.string()).min(1),
    /** 立場ID（society.json standings）ごとの口調差分。未定義の立場は greet/respect に戻る */
    byStanding: z
      .record(
        z.string(),
        z
          .object({
            greet: z.array(z.string()).min(1).optional(),
            respect: z.array(z.string()).min(1).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const voiceNpcSchema = z
  .object({
    /** canon.json figures の id（例: npc.sado） */
    id: z.string().min(1),
    name: z.string().min(1),
    /** 役割（門番・宿屋の主・受付 など） */
    role: z.string().min(1),
    lines: voiceLinesSchema,
  })
  .strict();

export const voicesFileSchema = z
  .object({
    npcs: z.array(voiceNpcSchema).min(1),
  })
  .strict();

export type VoiceLines = z.infer<typeof voiceLinesSchema>;
export type VoiceNpc = z.infer<typeof voiceNpcSchema>;
export type VoicesFile = z.infer<typeof voicesFileSchema>;
