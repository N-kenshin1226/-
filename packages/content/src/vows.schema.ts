import { z } from "zod";
import { worldModsSchema } from "./world-mods.schema.js";

/**
 * vows.json — 誓約（docs/06_endgame.md §3C、T-46）。
 * 難度を上げる条件をプレイヤーが自分で積む。1誓約 = 1効果（WorldMods 語彙）。
 * 誓約ごとに対応する称号（titles.json）があり、誓約を守って一季節（28日）を
 * 生きると解除される。称号との突き合わせは validate.ts 側で行う。
 */
export const vowSchema = z
  .object({
    id: z.string().regex(/^vow\.[a-z0-9_]+$/),
    /** 一覧での表示名 */
    name: z.string().min(1),
    /** 一覧での1行説明（何がきつくなるか） */
    desc: z.string().min(1),
    /** 難度修飾（WorldMods 語彙。1誓約につき1効果） */
    mods: worldModsSchema.refine((m) => Object.keys(m).length > 0, {
      message: "誓約の mods は1つ以上のキーを持つこと",
    }),
    /** 達成（誓約を守って一季節生きる）で解除される称号（titles.json の id） */
    title: z.string().regex(/^title\.[a-z0-9_.]+$/),
  })
  .strict();

export const vowsFileSchema = z
  .object({
    version: z.literal(1),
    vows: z.array(vowSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const v of file.vows) {
      if (seen.has(v.id)) ctx.addIssue({ code: "custom", message: `誓約 id の重複: ${v.id}` });
      seen.add(v.id);
    }
  });

export type Vow = z.infer<typeof vowSchema>;
export type VowsFile = z.infer<typeof vowsFileSchema>;
