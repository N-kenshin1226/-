import { z } from "zod";

/**
 * arts.json — 武技・パッシブの定義（K-02「武技・資源・構成」、docs/09 §1〜3、§5〜6）。
 * core/arts の ArtDef に対応する。武器種ごとの攻撃技・予兆への対応技・
 * 補助技と、構成の別枠に入るパッシブの一覧。
 * 数値の肝（コスト・威力・持続）はここに置き、全体のバランス係数は
 * balance.json の arts 節に置く
 */

import { evolveSchema } from "./evolve.schema.js";

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
const artKind = z.enum(["attack", "response", "support", "passive"]);
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

export const artSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "id は snake_case の英字始まり"),
    name: z.string().min(1),
    /** 由来技能（skills.json の id。武技は武器技能） */
    skill: z.string().min(1),
    /**
     * 習得条件（§7.1）：技能の熟練度が主軸。at を省略した技は技能値では
     * 覚えない —— 進化・合成・ユニーク（K-03、09 §7）のように特別な経路で
     * だけ得られる技の印。at の無い learn に傾き・旗・反復の条件は付けられない
     */
    learn: z
      .object({
        at: z.number().nonnegative().optional(),
        tag: z.string().min(1).optional(),
        share: z.number().min(0).max(1).optional(),
        flag: z.string().min(1).optional(),
        counter: z
          .object({ key: z.string().min(1), gte: z.number().positive() })
          .strict()
          .optional(),
      })
      .strict(),
    kind: artKind,
    /* ── 攻撃技 ── */
    power: z.number().positive().optional(),
    dtype: damageType.optional(),
    part: bodyPart.optional(),
    hits: z.number().int().min(1).max(5).optional(),
    hitBonus: z.number().min(-1).max(1).optional(),
    status: z
      .object({
        id: statusId,
        chance: z.number().min(0).max(1),
        ticks: z.number().int().positive(),
        power: z.number().nonnegative(),
      })
      .strict()
      .optional(),
    /** 崩し中の敵への会心特効（§5「崩し→大技」） */
    heavy: z.literal(true).optional(),
    /** 耐性を貫く */
    pierceArmor: z.literal(true).optional(),
    /* ── 対応技 ── */
    response: responseKind.optional(),
    /* ── コスト・拍 ── */
    ki: z.number().nonnegative(),
    ct: z.number().positive(),
    range: artRange.optional(),
    /** パッシブの効果（kind:"passive" のとき必須） */
    effect: z.object({ hook: passiveHook, value: z.number() }).strict().optional(),
    /**
     * 進化の分岐（K-03、09 §7.1）。Lv10 に達したとき、使用記録と最も合う
     * 分岐へ進化する。進化形は分岐の mod からローダーが派生定義を作る
     */
    evolve: evolveSchema.optional(),
    desc: z.string().min(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    const bad = (msg: string) => ctx.addIssue({ code: "custom", message: `${a.id}: ${msg}` });
    // at の無い learn は特別な経路の印 —— 傾き・旗・反復は読まれないので付けられない
    if (
      a.learn.at === undefined &&
      (a.learn.tag !== undefined ||
        a.learn.share !== undefined ||
        a.learn.flag !== undefined ||
        a.learn.counter !== undefined)
    )
      bad("learn.at を持たない技に tag/share/flag/counter は付けられない");
    if (a.kind === "attack" && a.dtype === undefined) bad("attack には dtype が要る");
    if (a.kind === "response" && a.response === undefined) bad("response には response 種別が要る");
    if (a.kind === "support" && a.status === undefined) bad("support には状態（status）が要る");
    if (a.kind === "passive" && a.effect === undefined) bad("passive には effect が要る");
    // hits・heavy は attack 専用（対応技は連撃・崩し特効を持たない）
    if (a.kind !== "attack" && (a.hits !== undefined || a.heavy !== undefined))
      bad("hits/heavy は attack 専用");
    if (a.kind === "passive" && (a.power !== undefined || a.status !== undefined))
      bad("passive に power/status は付けられない");
    // 状態を掛けるのは attack・support・対応の割り込みだけ（parry/evade/guard は掛けない）
    if (a.status !== undefined && a.kind === "response" && a.response !== "interrupt")
      bad("割り込み以外の対応技には status を付けられない");
  });

export const artsFileSchema = z
  .object({
    version: z.number().int(),
    arts: z.array(artSchema).min(1),
  })
  .strict()
  .refine((f) => new Set(f.arts.map((a) => a.id)).size === f.arts.length, {
    message: "art の id は一意であること",
  });

export type ArtJson = z.infer<typeof artSchema>;
export type ArtsFile = z.infer<typeof artsFileSchema>;
