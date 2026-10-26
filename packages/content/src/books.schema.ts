import { z } from "zod";
import { condSchema } from "./conditions.schema.js";
import { effectSchema } from "./effects.schema.js";

/**
 * books.json — 書物（docs/02_growth_system.md §8・§6、T-26）。
 * 買って所持し、読むと効果が付く「成長効果を持つアイテム」。
 * キー突合（対象スキル・敵IDの存在検査）は validate.ts 側で行う。
 */
export const bookSchema = z
  .object({
    id: z.string().regex(/^book\.[a-z0-9_]+$/),
    name: z.string().min(1),
    /** 書店での説明（1行。効果の概要を添える） */
    desc: z.string().min(1),
    /** 読了時に見せる本文（lore の atom.text と同じ役割） */
    readText: z.string().min(1),
    /** 書店での値段（G） */
    price: z.number().int().nonnegative(),
    /**
     * 読了後 durationDays 日間だけ有効な効果（T-35 語彙）。
     * gainVs は gain の M 項に、damageVs は戦闘の与ダメージに接続される
     */
    effect: effectSchema.optional(),
    /** effect の持続日数（読んだ当日を含む）。effect がある書物は必須 */
    durationDays: z.number().int().positive().optional(),
    /** 読了時に回復する素質（スキルID → ポイント。上限は potentialCap/potentialMax） */
    potentialRecover: z.record(z.string().min(1), z.number().positive()).optional(),
    /** 読了で立つ知識フラグ（条件DSLの flag で読める） */
    flag: z.string().min(1).optional(),
    /**
     * 書店の棚に並ぶ条件（条件DSL。省略時は常に並ぶ）。
     * 失われた書物（X-5）は {flag: "lostbook.<skillId>"} —— 転生時に立つ
     */
    condition: condSchema.optional(),
  })
  .strict()
  .refine(
    (b) => b.effect !== undefined || b.potentialRecover !== undefined || b.flag !== undefined,
    {
      message: "書物は効果（effect/potentialRecover/flag）を1つ以上持つこと",
    },
  )
  .refine((b) => b.effect === undefined || b.durationDays !== undefined, {
    message: "effect には durationDays が必要",
  });

export const booksFileSchema = z
  .object({
    version: z.literal(1),
    books: z.array(bookSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const b of file.books) {
      if (seen.has(b.id)) ctx.addIssue({ code: "custom", message: `書物 id の重複: ${b.id}` });
      seen.add(b.id);
    }
  });

export type Book = z.infer<typeof bookSchema>;
export type BooksFile = z.infer<typeof booksFileSchema>;
