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
    /**
     * 勝負所の注文の候補（F-05、03 §2「使い所の原則」）。この印のある注文から
     * 日替わりで1件だけ「勝負所」の札が付く —— 一覧が勝負所だらけにならないように
     * （釘の束のような日常の注文は簡易判定が標準）
     */
    showdown: z.literal(true).optional(),
    /**
     * 注文の出る町（P-02、life.json towns の id。省略時は基点の町 "ardi"）。
     * 町ごとに注文が違う —— ベルンにはベルンの仕事だけが届く
     */
    town: z.string().min(1).optional(),
  })
  .strict();

export const ordersFileSchema = z.object({ orders: z.array(orderSchema).min(1) }).strict();
export type Order = z.infer<typeof orderSchema>;
export type OrdersFile = z.infer<typeof ordersFileSchema>;
