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
      z
        .object({
          id: z.string(),
          name: z.string(),
          power: z.number().positive(),
          /**
           * 呪文として放つ大技（M-01）。spells.json の id。観察中に発動を
           * 見届けると見取り稽古でその呪文の見知り（spell.seen.<id>）を得られる
           */
          spell: z.string().min(1).optional(),
        })
        .strict(),
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
    /**
     * 獣の敵（K-01。狩猟・動物知識が効く相手。省略＝獣ではない）：
     * 獣には beast.attack / beast.exp の技能リンクが乗る。
     * K-02 の使用タグ記録では獣＝beast・それ以外＝human として数える
     */
    beast: z.literal(true).optional(),
    /**
     * 打撃の性質ごとの被ダメージ倍率（K-02、09 §3）：
     * 斬・突・打に対して <1=耐性・>1=弱点・省略=1（素通り）。
     * 同じ構成では全部の敵に勝てないよう、種ごとに利きを分ける
     */
    resist: z
      .partialRecord(z.enum(["slash", "pierce", "blunt", "magic"]), z.number().positive())
      .optional(),
    /**
     * 状態異常への耐性（K-02/M-01）：付与率に掛ける倍率。
     * 0=効かない、1=通常、1より大＝弱く掛かりやすい（弱点。
     * 例：氷の精は燃焼に弱い）。最終の付与率は戦闘側で1に丸める
     */
    statusResist: z
      .partialRecord(
        z.enum([
          "bleed",
          "stun",
          "stagger",
          "slow",
          "poison",
          "wet",
          "oil",
          "frozen",
          "burn",
          "shock",
        ]),
        z.number().min(0).max(2),
      )
      .optional(),
    /**
     * 壊せる部位（K-02。省略時は4部位すべて）。部位のある敵だけ
     * 部位破壊の蓄積が進む
     */
    parts: z
      .array(z.enum(["head", "body", "arms", "legs"]))
      .min(1)
      .optional(),
  })
  .strict();

export const enemiesFileSchema = z.object({ enemies: z.array(enemySchema).min(1) }).strict();
export type EnemyJson = z.infer<typeof enemySchema>;
export type EnemiesFile = z.infer<typeof enemiesFileSchema>;
