import { z } from "zod";

/** orders.json — ミニゲームが出る「勝負所」の注文（03 §2 作業化を防ぐ） */
export const orderSchema = z
  .object({
    id: z.string().min(1),
    /** 対応する技能ID（skills.json の id） */
    kind: z.string().min(1),
    name: z.string().min(1),
    /** 求められる品質。手動ミニゲームの目標になる */
    targetQuality: z.number().min(0).max(100),
    /** 成功時の報酬（所持金は M1 途中まで表示のみ） */
    rewardMoney: z.number().int().nonnegative(),
    note: z.string().optional(),
  })
  .strict();

export const ordersFileSchema = z.object({ orders: z.array(orderSchema).min(1) }).strict();
export type Order = z.infer<typeof orderSchema>;
export type OrdersFile = z.infer<typeof ordersFileSchema>;
