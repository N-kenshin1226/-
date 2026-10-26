import { z } from "zod";

/**
 * rivals.json — ライバル・ランキング（簡易版、T-47。docs/05 M4・03 §5）の素材表。
 * ランキングに載るライバルの名と二つ名の母集団。どちらが選ばれるかは
 * 世界シードから決定論的に引く（core/src/rivals）。数値は balance.json の rivals 節。
 */
export const rivalsFileSchema = z
  .object({
    version: z.literal(1),
    /** 生成名の母集団（重複なし。ranking size 以上必要） */
    names: z.array(z.string().min(1)).min(1),
    /** 二つ名の母集団（新聞の噂・記録画面の装飾に使う） */
    epithets: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const n of file.names) {
      if (seen.has(n)) ctx.addIssue({ code: "custom", message: `ライバル名の重複: ${n}` });
      seen.add(n);
    }
  });

export type RivalsFile = z.infer<typeof rivalsFileSchema>;
