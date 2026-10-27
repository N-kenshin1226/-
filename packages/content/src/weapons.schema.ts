import { z } from "zod";

/**
 * weapons.json — 武器の定義（K-01「武器持ち替え」）。
 * core/combat の WeaponDef に対応する。武器ごとに使う技能・威力・
 * 行動間隔係数・命中/会心補正が違い、戦闘中に持ち替えられる
 */
export const weaponSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "id は snake_case の英字始まり"),
    name: z.string().min(1),
    /** この武器が使う技能（skills.json の id。戦闘の攻撃・命中・会心に乗る） */
    skill: z.string().min(1),
    /** 攻撃力への加算 */
    power: z.number().nonnegative(),
    /** 行動間隔への係数（1=標準。大きいほど重くて遅い武器） */
    ctFactor: z.number().positive(),
    /** 会心率への加算（負も可：重い武器は急所を狙いにくい） */
    critBonus: z.number().min(-1).max(1),
    /** 命中率への加算（負も可） */
    hitBonus: z.number().min(-1).max(1),
    /**
     * 防御（防御コマンド）で受けるダメージをさらに減らす係数（0〜0.9）。
     * 盾系の武器に付ける。省略＝0
     */
    defendBonus: z.number().min(0).max(0.9).optional(),
    /** 武器屋での値段（G）。省略＝売り物に出さない（初期装備の素手など） */
    price: z.number().nonnegative().optional(),
    /** 店頭の説明文 */
    desc: z.string().min(1),
  })
  .strict();

export const weaponsFileSchema = z
  .object({
    weapons: z.array(weaponSchema).min(1),
    /** 新規ゲームで最初から持っている武器の id */
    initial: z.array(z.string().min(1)).min(1),
    /** 新規ゲームの初期装備武器（initial に含まれていること） */
    defaultWeapon: z.string().min(1),
  })
  .strict()
  .refine((f) => f.initial.includes(f.defaultWeapon), {
    message: "defaultWeapon は initial に含まれていること",
  })
  .refine(
    (f) => f.initial.every((id) => f.weapons.some((w) => w.id === id)),
    "initial の武器は weapons に定義されていること",
  );

export type WeaponJson = z.infer<typeof weaponSchema>;
export type WeaponsFile = z.infer<typeof weaponsFileSchema>;
