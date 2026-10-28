import { z } from "zod";

/**
 * items.json — 採集物・素材・料理の品目表（P-02「行動の種類を増やす」）。
 *
 * 行動の手間賃ではなく「物そのもの」の定義：採集で拾う、料理で作る、
 * 市場で売り買いする、食べる、贈り物にする。武器・書物のような
 * 固有の効果を持つ品ではなく、数で持てる消耗品だけをここに置く。
 *
 *   kind    … gather=採集物（素材としても使える）/ material=素材（市場で買う）/ meal=料理
 *   price   … 基準の価値（G）。売り買いの値段はこの値に市場係数が掛かる
 *   food    … 食べられる品の食事の質（0〜100）。料理は調理の出来で上書きされる
 *             （counters["meal.q.<id>"] が直近の出来を覚える）
 */

export const ITEM_KINDS = ["gather", "material", "meal"] as const;

export const itemSchema = z
  .object({
    /** 品物の id（持ち物のキー。小文字・数字・_・. で構成） */
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 表示名 */
    name: z.string().min(1),
    /** 品物の種類 */
    kind: z.enum(ITEM_KINDS),
    /** 基準の価値（G）。0 は売れない品 */
    price: z.number().nonnegative(),
    /** 食べられる品の食事の質（0〜100。省略時は食べられない） */
    food: z.number().min(0).max(100).optional(),
    /**
     * 買うと地方の地図の霧が晴れる（G-02、docs/10 §7「地図の購入で霧が
     * 晴れる」）。"map" は地方すべての町と地域の名を聞き覚えに書き込む
     */
    reveal: z.literal("map").optional(),
  })
  .strict();

export const itemsFileSchema = z
  .object({
    version: z.literal(1),
    items: z.array(itemSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (const i of file.items) {
      if (ids.has(i.id)) ctx.addIssue({ code: "custom", message: `品物 id の重複: ${i.id}` });
      ids.add(i.id);
    }
  });

export type ItemJson = z.infer<typeof itemSchema>;
export type ItemsFile = z.infer<typeof itemsFileSchema>;
