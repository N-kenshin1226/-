import { z } from "zod";

/**
 * 進化・合成・ユニークスキルの JSON 部品（K-03、docs/09 §7「なろう系」）。
 * arts.json / spells.json の evolve 節と k03 の定義で共有する。
 *
 * - 分岐は「どんな使い方に向いているか」の重み（使用タグ → 重み）と、
 *   進化形の差分（mod）。mod だけが基底の定義を上書きする
 * - 分岐の進化先は書かない —— ローダーが基底＋mod から派生定義を
 *   materialize して id を振る（進化形の実体は生成物）
 */

const damageType = z.enum(["slash", "pierce", "blunt", "magic"]);
const bodyPart = z.enum(["head", "body", "arms", "legs"]);
const statusId = z.enum([
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
]);
const responseKind = z.enum(["interrupt", "parry", "evade", "guard"]);
const artRange = z.enum(["near", "mid", "far"]);
const passiveHook = z.enum([
  "hit",
  "crit",
  "evade",
  "defend",
  "counter",
  "attack",
  "dmg.slash",
  "dmg.pierce",
  "dmg.blunt",
  "dmg.magic",
  "status",
  "kiRegen",
  "kiMax",
  "manaMax",
  "castSpeed",
  "instantCast",
  "manaRegen",
]);
const lifeHook = z.enum([
  "cookBonus",
  "smithBonus",
  "farmBonus",
  "alchemyBonus",
  "gatherBonus",
  "campBonus",
  "heal",
  "preserve",
]);

/**
 * 進化形の性能差分（core/arts の EvolveMod に対応）。
 * 書いたフィールドだけが基底を置き換える。name は必須（進化形は別の名を持つ）
 */
export const evolveModSchema = z
  .object({
    /** 進化形の名（必須。例：旋風薙ぎ） */
    name: z.string().min(1),
    /** 進化形の説明文（省略時は基底の説明＋理由からローダーが組み立てる） */
    desc: z.string().min(1).optional(),
    /* ── 攻撃技 ── */
    power: z.number().positive().optional(),
    dtype: damageType.optional(),
    part: bodyPart.optional(),
    hits: z.number().int().min(1).max(5).optional(),
    hitBonus: z.number().min(-1).max(1).optional(),
    /** 状態付与を変える（null で外す） */
    status: z
      .object({
        id: statusId,
        chance: z.number().min(0).max(1),
        ticks: z.number().int().positive(),
        power: z.number().nonnegative(),
      })
      .strict()
      .nullable()
      .optional(),
    heavy: z.literal(true).optional(),
    pierceArmor: z.literal(true).optional(),
    /* ── 対応技 ── */
    response: responseKind.optional(),
    /* ── コスト・拍 ── */
    ki: z.number().nonnegative().optional(),
    ct: z.number().positive().optional(),
    range: artRange.optional(),
    /** パッシブの効果 */
    effect: z.object({ hook: passiveHook, value: z.number() }).strict().optional(),
    /** 呪文面の変更（呪文の進化だけが使う。element/tier は基底を継ぐ） */
    spell: z
      .object({
        mana: z.number().nonnegative().optional(),
        cast: z.number().positive().optional(),
        heal: z.number().positive().optional(),
        drain: z.number().min(0).max(1).optional(),
        life: z
          .object({
            hook: lifeHook,
            value: z.number(),
            transform: z
              .object({
                from: z.string().min(1),
                to: z.string().min(1),
                n: z.number().int().positive(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type EvolveModJson = z.infer<typeof evolveModSchema>;

/**
 * 進化の分岐（arts.json / spells.json / k03 の隠し分岐で同じ形）。
 * 分岐スコア = Σ weight × share(使用タグ)。Lv10 で最も合う分岐へ進化する
 */
export const evolveBranchSchema = z
  .object({
    /** 傾きの軸の表示名（「群れ」「一点」。ステータスの傾きメーターのラベル） */
    tilt: z.string().min(1),
    /** 進化理由の語り片（「群れへ放ち続けた」） */
    reason: z.string().min(1),
    /** どんな使い方に向いているか（使用タグ → 重み） */
    weights: z.record(z.string().min(1), z.number().positive()),
    /** 進化形の性能差分（進化先はローダーが materialize する） */
    mod: evolveModSchema,
  })
  .strict();

export type EvolveBranchJson = z.infer<typeof evolveBranchSchema>;

/** evolve 節（分岐は2〜4つ —— どの分岐にも合わない使い方は最も近い分岐へ） */
export const evolveSchema = z
  .object({
    branches: z.array(evolveBranchSchema).min(2).max(4),
  })
  .strict();
