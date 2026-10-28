import { z } from "zod";
import { condSchema } from "../src/conditions.schema.js";
import { evolveModSchema } from "../src/evolve.schema.js";

/**
 * K-03「技の進化・合成・ユニークスキル」のファイル形式（docs/09 §7「なろう系」）。
 *
 * - `k03/sample.json`：公開サンプル（テスト・e2e・フォールバック用。誰が読んでもいい）
 * - `hidden/k03/k03.json`：本番の隠し要素（合成レシピ・ユニークの条件・隠し分岐。
 *   オーナーは読まない —— 07_story.md §5。検証の出力には件数だけを出す）
 *
 * 技の定義そのものは各エントリに埋め込む（進化形は分岐の mod から派生するが、
 * 合成・ユニークの技は独立した定義）。learn.at を持たない定義は技能値では
 * 覚えない —— レシピ・ユニーク・隠し分岐だけが手に入れる経路になる
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
const k03Kind = z.enum(["attack", "response", "support", "heal", "passive", "life"]);
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

/**
 * 合成・ユニークの技の定義（武技＋呪文の合冊。core/arts の ArtDef に対応）。
 * learn.at を持たせない：特別な経路でだけ得られる技なので技能値では覚えない
 */
export const k03DefSchema = z
  .object({
    id: z.string().regex(/^x_[a-z0-9_]+$/, "K-03 の技の id は x_ 始まりの snake_case"),
    name: z.string().min(1),
    /** 由来技能（熟練の母になる技能。skills.json の id） */
    skill: z.string().min(1),
    kind: k03Kind,
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
    heavy: z.literal(true).optional(),
    pierceArmor: z.literal(true).optional(),
    /* ── 対応技 ── */
    response: responseKind.optional(),
    /* ── コスト・拍 ── */
    ki: z.number().nonnegative(),
    ct: z.number().positive(),
    range: artRange.optional(),
    /** パッシブの効果（kind:"passive" のとき必須） */
    effect: z.object({ hook: passiveHook, value: z.number() }).strict().optional(),
    /** 呪文の側面（呪文として振る舞う技に付ける） */
    spell: z
      .object({
        element: magicElement,
        tier: spellTier,
        mana: z.number().nonnegative(),
        cast: z.number().positive(),
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
    desc: z.string().min(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    const bad = (msg: string) =>
      ctx.addIssue({ code: "custom", message: `K-03 の技の定義: ${msg}` });
    if (a.kind === "attack" && a.power === undefined) bad("attack には power が要る");
    if (a.kind === "attack" && a.spell === undefined && a.dtype === undefined)
      bad("attack（武技側）には dtype が要る");
    if (a.kind === "response" && a.response === undefined) bad("response には response 種別が要る");
    if (a.kind === "support" && a.status === undefined) bad("support には status が要る");
    if (a.kind === "passive" && a.effect === undefined) bad("passive には effect が要る");
    if (a.kind === "heal" && a.spell?.heal === undefined) bad("heal には spell.heal が要る");
    if (a.kind === "life" && a.spell?.life === undefined) bad("life には spell.life が要る");
    if (a.kind === "passive" && a.spell !== undefined) bad("passive に spell 側面は付けられない");
    if (a.kind !== "passive" && a.kind !== "attack" && a.kind !== "life" && a.kind !== "heal") {
      // response/support は呪文面を持っても持たなくてもよい（武技側・呪文側両方ありうる）
    }
    if (a.status !== undefined && a.kind === "response" && a.response !== "interrupt")
      bad("割り込み以外の対応技には status を付けられない");
  });
export type K03DefJson = z.infer<typeof k03DefSchema>;

/** ユニークスキル（その世界で一人だけ持てる技） */
export const k03UniqueSchema = z
  .object({
    /** 得られる技（定義は埋め込み。learn.at を持たないのでこれだけが経路） */
    def: k03DefSchema,
    /** 条件（条件DSL。厳しめ —— 偉業・極端な積み重ね） */
    condition: condSchema,
    /**
     * ライバルの先取り（任意）：dayMin 日以降、終わった日ごとに世界シード
     * 由来の抽選で chance の確率で先に取られる。省略時はライバルは狙わない
     */
    rival: z
      .object({
        dayMin: z.number().int().nonnegative(),
        chance: z.number().gt(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type K03UniqueJson = z.infer<typeof k03UniqueSchema>;

/** 合成レシピ（技能・技の組み合わせで生まれる技。条件は伏せる） */
export const k03RecipeSchema = z
  .object({
    /** 生まれる技（定義は埋め込み） */
    def: k03DefSchema,
    /** 条件（条件DSL。全部満たすと技が生まれる） */
    condition: condSchema,
    /** 噂・書物に載るヒントの文（条件そのものは明かさない） */
    hint: z.string().min(1).optional(),
  })
  .strict();
export type K03RecipeJson = z.infer<typeof k03RecipeSchema>;

/** 隠し分岐（公開のどの分岐にも合わない極端な使い方だけが通る） */
export const k03HiddenBranchSchema = z
  .object({
    /** 元の技（arts.json / spells.json の id。この技の進化にぶら下がる） */
    from: z.string().min(1),
    tilt: z.string().min(1),
    reason: z.string().min(1),
    weights: z.record(z.string().min(1), z.number().positive()),
    mod: evolveModSchema,
  })
  .strict();
export type K03HiddenBranchJson = z.infer<typeof k03HiddenBranchSchema>;

export const k03FileSchema = z
  .object({
    version: z.number().int(),
    uniques: z.array(k03UniqueSchema).default([]),
    recipes: z.array(k03RecipeSchema).default([]),
    hiddenBranches: z.array(k03HiddenBranchSchema).default([]),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = [...f.uniques.map((u) => u.def.id), ...f.recipes.map((r) => r.def.id)];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "K-03 の技の id は一意であること" });
    // 同じ技を指すユニークは1つだけ（一人だけ制約の整合）
    const uids = f.uniques.map((u) => u.def.id);
    if (new Set(uids).size !== uids.length)
      ctx.addIssue({ code: "custom", message: "同じ技のユニークは1つだけであること" });
  });
export type K03File = z.infer<typeof k03FileSchema>;
