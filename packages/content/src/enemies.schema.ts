import { z } from "zod";
import { ENEMY_FAMILIES, type EnemyMove } from "@trace/core";

/**
 * enemies.json — 敵の固定行動パターン（03 §4。プレイヤーが学習できる）
 *
 * G-04（docs/10_world_generation.md §11）で加わった節：
 *   family   … 系統（獣・人・不死・魔物・精霊・竜種）。獣には beast 系の
 *              技能リンクが乗り、使用記録は foe.<family> で数える
 *   drops    … 撃破の戦利品（モンスター素材。step の抽選で items.json の品を得る）
 *   biomes   … バイオーム適応の係数表（地域型の id → 亜種への差分）
 *   variants … 亜種（基の種 × バイオーム）。`<base>__<biome>` の id で
 *              enemies 配列に展開される（地域型と系統の掛け合わせで作る地方亜種）
 */

const resistSchema = z.partialRecord(
  z.enum(["slash", "pierce", "blunt", "magic"]),
  z.number().positive(),
);
const statusResistSchema = z.partialRecord(
  z.enum(["bleed", "stun", "stagger", "slow", "poison", "wet", "oil", "frozen", "burn", "shock"]),
  z.number().min(0).max(2),
);

/** 撃破の戦利品（モンスター素材）：確率 chance で個数 n[min..max] を落とす */
const dropSchema = z
  .object({
    /** items.json の品物 id */
    item: z.string().min(1),
    /** 落とす確率（0 < chance <= 1） */
    chance: z.number().positive().max(1),
    /** 個数の範囲 [min, max]（等確率） */
    n: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .refine(([a, b]) => a <= b, "drops の個数範囲が逆転"),
  })
  .strict();

const enemyObjectSchema = z
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
    /**
     * 系統（G-04）：beast=獣 / human=人 / undead=不死 / demon=魔物 /
     * spirit=精霊 / dragon=竜種。獣には beast.attack / beast.exp の技能リンクが
     * 乗り、K-02 の使用タグ記録は foe.<family> で数える
     */
    family: z.enum(ENEMY_FAMILIES),
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
     * 打撃の性質ごとの被ダメージ倍率（K-02、09 §3）：
     * 斬・突・打に対して <1=耐性・>1=弱点・省略=1（素通り）。
     * 同じ構成では全部の敵に勝てないよう、種ごとに利きを分ける
     */
    resist: resistSchema.optional(),
    /**
     * 状態異常への耐性（K-02/M-01）：付与率に掛ける倍率。
     * 0=効かない、1=通常、1より大＝弱く掛かりやすい（弱点。
     * 例：氷の精は燃焼に弱い）。最終の付与率は戦闘側で1に丸める
     */
    statusResist: statusResistSchema.optional(),
    /**
     * 壊せる部位（K-02。省略時は4部位すべて）。部位のある敵だけ
     * 部位破壊の蓄積が進む
     */
    parts: z
      .array(z.enum(["head", "body", "arms", "legs"]))
      .min(1)
      .optional(),
    /** 撃破の戦利品（G-04。item は items.json の id） */
    drops: z.array(dropSchema).optional(),
  })
  .strict();

/** パース済みの敵：family==="beast" には従来の beast 旗が立つ（EnemyDef と同じ読み方） */
export type EnemyJson = z.infer<typeof enemyObjectSchema> & { beast?: true };

/** 基となる種の差分として書くバイオーム適応（地域型の id がキー） */
const biomeSchema = z
  .object({
    /** 表示名の接頭辞（「雪原の」＋基の名前。name 指定で上書き可） */
    prefix: z.string().min(1),
    /** 挑戦差の加算 */
    challenge: z.number().int().optional(),
    /** HP への倍率 */
    hp: z.number().positive().optional(),
    /** 攻撃・大技の威力への倍率 */
    power: z.number().positive().optional(),
    /** 敏捷の加算 */
    agility: z.number().int().optional(),
    /** 耐性の上書き（基の表にマージする。バイオーム適応の皮膚・体質） */
    resist: resistSchema.optional(),
    /** 状態耐性の上書き（基の表にマージ） */
    statusResist: statusResistSchema.optional(),
  })
  .strict();
export type BiomeJson = z.infer<typeof biomeSchema>;

/** 亜種の定義：基の種 × バイオーム → `<base>__<biome>` で展開される */
const variantSchema = z
  .object({
    /** 基となる種（enemies 配列の id） */
    base: z.string().min(1),
    /** 適応したバイオーム（biomes のキー。基の area と同じにはできない） */
    biome: z.string().min(1),
    /** 表示名（省略時は prefix＋基の名前） */
    name: z.string().min(1).optional(),
  })
  .strict();
export type VariantJson = z.infer<typeof variantSchema>;

export const enemySchema = enemyObjectSchema.transform((e): EnemyJson => {
  const out: EnemyJson = { ...e };
  if (e.family === "beast") out.beast = true;
  return out;
});

export interface EnemiesFile {
  enemies: EnemyJson[];
  biomes?: Record<string, BiomeJson>;
  variants?: VariantJson[];
}

/** 基の種からバイオーム適応の亜種を作る（<base>__<biome>。ステータス・耐性・戦利品を継ぐ） */
function materializeVariant(base: EnemyJson, v: VariantJson, b: BiomeJson): EnemyJson {
  const scaleMove = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.max(1, Math.round(m.power * (b.power ?? 1))),
  });
  const resist = { ...base.resist, ...b.resist };
  const statusResist = { ...base.statusResist, ...b.statusResist };
  const out: EnemyJson = {
    id: `${v.base}__${v.biome}`,
    name: v.name ?? `${b.prefix}${base.name}`,
    area: v.biome,
    family: base.family,
    hp: Math.max(1, Math.round(base.hp * (b.hp ?? 1))),
    intervalTicks: base.intervalTicks,
    challenge: base.challenge + (b.challenge ?? 0),
    agility: Math.max(0, base.agility + (b.agility ?? 0)),
    attack: scaleMove(base.attack),
    moves: Object.fromEntries(Object.entries(base.moves).map(([k, m]) => [k, scaleMove(m)])),
    pattern: base.pattern,
    ...(base.beast === true ? { beast: true as const } : {}),
    ...(Object.keys(resist).length > 0 ? { resist } : {}),
    ...(Object.keys(statusResist).length > 0 ? { statusResist } : {}),
    ...(base.parts !== undefined ? { parts: [...base.parts] } : {}),
    ...(base.drops !== undefined ? { drops: [...base.drops] } : {}),
  };
  return out;
}

const enemiesFileObjectSchema = z
  .object({
    enemies: z.array(enemySchema).min(1),
    /** バイオーム適応の係数表（G-04。地域型の id → 亜種への差分） */
    biomes: z.record(z.string(), biomeSchema).optional(),
    /** 亜種の定義（基 × バイオーム → <base>__<biome> で enemies に展開） */
    variants: z.array(variantSchema).optional(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (const e of file.enemies) {
      if (ids.has(e.id)) ctx.addIssue({ code: "custom", message: `敵 id の重複: ${e.id}` });
      ids.add(e.id);
    }
    const made = new Set<string>();
    for (const v of file.variants ?? []) {
      const base = file.enemies.find((e) => e.id === v.base);
      const biome = file.biomes?.[v.biome];
      const id = `${v.base}__${v.biome}`;
      if (base === undefined) {
        ctx.addIssue({ code: "custom", message: `亜種 ${id}: 未定義の基 ${v.base}` });
        continue;
      }
      if (biome === undefined) {
        ctx.addIssue({ code: "custom", message: `亜種 ${id}: 未定義のバイオーム ${v.biome}` });
        continue;
      }
      if (ids.has(id) || made.has(id))
        ctx.addIssue({ code: "custom", message: `亜種 id の重複: ${id}` });
      made.add(id);
      if (v.biome === base.area)
        ctx.addIssue({
          code: "custom",
          message: `亜種 ${id}: 基と同じバイオームには適応できない`,
        });
    }
  });

export const enemiesFileSchema = enemiesFileObjectSchema.transform((file): EnemiesFile => {
  const biomes = file.biomes ?? {};
  const variants = file.variants ?? [];
  // 亜種はバイオーム（=縄張りエリア）ごとに、そのエリアの群の末尾へ挿す。
  // 「敵はエリアごとに連続して並ぶ」置き方を保つ（enemiesByArea の並びと一致）
  const byBiome = new Map<string, EnemyJson[]>();
  for (const v of variants) {
    const made = materializeVariant(
      file.enemies.find((e) => e.id === v.base)!,
      v,
      biomes[v.biome]!,
    );
    const list = byBiome.get(v.biome) ?? [];
    list.push(made);
    byBiome.set(v.biome, list);
  }
  const merged: EnemyJson[] = [];
  for (let i = 0; i < file.enemies.length; i++) {
    const e = file.enemies[i]!;
    merged.push(e);
    const nxt = file.enemies[i + 1];
    if (nxt === undefined || nxt.area !== e.area) {
      merged.push(...(byBiome.get(e.area) ?? []));
      byBiome.delete(e.area);
    }
  }
  for (const rest of byBiome.values()) merged.push(...rest);
  return { ...file, enemies: merged };
});
