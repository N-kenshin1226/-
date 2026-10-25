import { z } from "zod";

/**
 * balance.json のスキーマ。
 * ゲームの数値はすべて balance.json に置く（AGENTS.md 絶対ルール）。
 * フィールドを増やすときは、このスキーマも必ず更新する。
 */
export const balanceSchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
