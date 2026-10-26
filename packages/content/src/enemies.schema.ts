import { z } from "zod";

/** enemies.json — 敵の固定行動パターン（03 §4。プレイヤーが学習できる） */
export const enemySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 狩りの行き先エリア（text/cli.json display.huntAreas に表示名を置く） */
    area: z.string().min(1),
    hp: z.number().positive(),
    /** 敵の行動間隔（tick） */
    intervalTicks: z.number().positive(),
    /** gain の挑戦差に使う強さ */
    challenge: z.number().nonnegative(),
    /** 逃走の抵抗に使う敏捷相当値 */
    agility: z.number().nonnegative(),
    attack: z.object({ id: z.string(), name: z.string(), power: z.number().positive() }).strict(),
    /** 予兆を伴う大技の表 */
    moves: z.record(
      z.string(),
      z.object({ id: z.string(), name: z.string(), power: z.number().positive() }).strict(),
    ),
    /** 行動パターン（固定ループ） */
    pattern: z
      .array(
        z
          .object({
            type: z.enum(["attack", "telegraph"]),
            move: z.string().optional(),
            ticks: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const enemiesFileSchema = z.object({ enemies: z.array(enemySchema).min(1) }).strict();
export type EnemyJson = z.infer<typeof enemySchema>;
export type EnemiesFile = z.infer<typeof enemiesFileSchema>;
