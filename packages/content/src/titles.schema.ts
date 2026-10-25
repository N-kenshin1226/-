import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/** packages/content/titles.json。docs/03 §7 の称号定義 */
export const titleSchema = z
  .object({
    id: z.string().regex(/^title\.[a-z0-9_.]+$/),
    name: z.string().min(1),
    /** 通知ランク（docs/03 §6） */
    rank: z.enum(["S", "A", "B"]),
    /** 隠し称号は true。サンプルはすべて false（隠し要素は hidden/ 側） */
    hidden: z.boolean(),
    condition: condSchema,
    /** 効果（M1 で gain の M 項へ接続。今はデータとして保持するだけ） */
    effect: z.record(z.string(), z.unknown()),
    /** システムメッセージ書式：「――」「《》」（AGENTS.md 文体） */
    message: z
      .string()
      .regex(/^――.+《.+》.+。$/, "システムメッセージ書式（――…《…》…。）に従うこと"),
  })
  .strict();

export const titlesFileSchema = z
  .object({
    titles: z.array(titleSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const t of file.titles) {
      if (seen.has(t.id)) ctx.addIssue({ code: "custom", message: `称号 id の重複: ${t.id}` });
      seen.add(t.id);
    }
  });

export type Title = z.infer<typeof titleSchema>;
export type TitlesFile = z.infer<typeof titlesFileSchema>;
