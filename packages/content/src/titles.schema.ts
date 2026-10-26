import { z } from "zod";
import { condSchema } from "./conditions.schema.js";
import { effectSchema } from "./effects.schema.js";

/** packages/content/titles.json。docs/03 §7 の称号定義 */
export const titleSchema = z
  .object({
    id: z.string().regex(/^title\.[a-z0-9_.]+$/),
    name: z.string().min(1),
    /** 通知ランク（docs/03 §6） */
    rank: z.enum(["S", "A", "B"]),
    /** 隠し称号は true。サンプルはすべて false（隠し要素は hidden/ 側） */
    hidden: z.boolean(),
    /** 成長シミュレーションの到達性検査の対象か。訓練系ボットでは到達できない条件（戦闘・台帳など）なら false */
    simReachable: z.boolean().optional(),
    condition: condSchema,
    /** 効果（T-35：gain の M 項・与ダメージ・報酬に接続。語彙は effects.schema.ts） */
    effect: effectSchema,
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
