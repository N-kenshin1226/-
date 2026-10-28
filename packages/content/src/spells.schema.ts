import { z } from "zod";

/**
 * spells.json — 呪文と魔法パッシブの定義（M-01「魔法の仕組みと呪文」、docs/09 §6）。
 * core/arts の ArtDef に対応する攻撃技・補助・回復・生活・パッシブの一覧。
 * 武技（arts.json）と同じ形をしているが、kind:"passive" 以外は `spell`
 * 側面（属性・詠唱拍・消費魔力）を持つ。数値の肝（消費・威力・拍）はここに置き、
 * 全体のバランス係数は balance.json の magic 節に置く
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
const spellKind = z.enum(["attack", "support", "heal", "passive", "life"]);
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
const magicElement = z.enum([
  "fire",
  "water",
  "wind",
  "earth",
  "light",
  "dark",
  "void",
  "life",
  "cure",
]);
const spellTier = z.enum(["novice", "adept", "expert"]);
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

export const spellSchema = z
  .object({
    id: z.string().regex(/^sp_[a-z0-9_]+$/, "呪文の id は sp_ 始まりの snake_case"),
    name: z.string().min(1),
    /** 由来技能（skills.json の魔法系 id） */
    skill: z.string().min(1),
    /**
     * 習得条件（§7.2）：技能の熟練度が主軸。flag（魔導書・師匠・見取りフラグ）や
     * counter（生活魔法の反復 spell.cast.<element>）で導線を絞れる
     */
    learn: z
      .object({
        at: z.number().nonnegative(),
        tag: z.string().min(1).optional(),
        share: z.number().min(0).max(1).optional(),
        flag: z.string().min(1).optional(),
        counter: z
          .object({ key: z.string().min(1), gte: z.number().positive() })
          .strict()
          .optional(),
      })
      .strict(),
    kind: spellKind,
    /* ── 攻撃呪文 ── */
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
    /** 耐性を貫く */
    pierceArmor: z.literal(true).optional(),
    /* ── コスト・拍（呪文は気力0・CT1固定。消費は spell.mana） ── */
    ki: z.number().nonnegative(),
    ct: z.number().positive(),
    range: artRange.optional(),
    /** パッシブの効果（kind:"passive" のとき必須） */
    effect: z.object({ hook: passiveHook, value: z.number() }).strict().optional(),
    /** 呪文の側面（kind:"passive" 以外では必須） */
    spell: z
      .object({
        element: magicElement,
        tier: spellTier,
        mana: z.number().nonnegative(),
        cast: z.number().positive(),
        /** kind:"heal" の回復量係数（spellPowerOf に掛かる） */
        heal: z.number().positive().optional(),
        /** 与ダメの何割をHPに還元するか（闇の吸収系） */
        drain: z.number().min(0).max(1).optional(),
        /** kind:"life" の生活効果 */
        life: z
          .object({
            hook: lifeHook,
            value: z.number(),
            /** hook:"preserve" の変換（from → to × n） */
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
    desc: z.string().min(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    const bad = (msg: string) => ctx.addIssue({ code: "custom", message: `${a.id}: ${msg}` });
    if (a.kind === "passive") {
      if (a.effect === undefined) bad("passive には effect が要る");
      if (a.spell !== undefined) bad("passive に spell 側面は付けない（使い切りではなく構成枠）");
      if (a.power !== undefined || a.status !== undefined)
        bad("passive に power/status は付けられない");
      return;
    }
    if (a.spell === undefined) bad("spell 側面（属性・消費・詠唱）が要る");
    if (a.kind === "attack" && a.power === undefined) bad("attack 呪文には power が要る");
    if (a.kind === "heal" && a.spell?.heal === undefined) bad("heal 呪文には spell.heal が要る");
    if (a.kind === "life" && a.spell?.life === undefined) bad("life 呪文には spell.life が要る");
    if (a.kind === "support" && a.status === undefined) bad("support 呪文には status が要る");
    if (a.kind !== "attack" && (a.hits !== undefined || a.pierceArmor !== undefined))
      bad("hits/pierceArmor は attack 専用");
    if (a.spell?.life?.hook === "preserve" && a.spell.life.transform === undefined)
      bad("preserve には transform が要る");
    if (a.spell?.heal !== undefined && a.kind !== "heal") bad("spell.heal は heal 専用");
    if (a.spell?.life !== undefined && a.kind !== "life") bad("spell.life は life 専用");
  });

export const spellsFileSchema = z
  .object({
    version: z.number().int(),
    spells: z.array(spellSchema).min(1),
  })
  .strict()
  .refine((f) => new Set(f.spells.map((a) => a.id)).size === f.spells.length, {
    message: "spell の id は一意であること",
  });

export type SpellJson = z.infer<typeof spellSchema>;
export type SpellsFile = z.infer<typeof spellsFileSchema>;
