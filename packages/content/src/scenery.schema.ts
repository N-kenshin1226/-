import { z } from "zod";

/**
 * scenery.json — 情景の部品と型ごとの組み合わせ（G-05、docs/10 §8）。
 *
 * 背景は「情景の部品」（空・遠景・中景・前景・灯り）の組み合わせで描く。
 * 部品（parts）はローカル座標の形（シルエットの断片）で、町の型・地域の型・
 * ダンジョンの型ごとの「レシピ」が部品の配置（個数・xの区間・基線y・
 * 大きさ・左右反転）を決める。実際の配置は画面側が世界シードから決定論的に
 * 引く —— 同じシードなら同じ情景になる。
 *
 * 描き方の約束（apps/web のレンダラと共有の語彙）：
 *   部品のローカル座標 … 原点(0,0)=足場の左端・地表面。形は上へ（y<0）伸びる
 *   塗りの役割（f）      … s0=遠景 s1=中景 s2=前景・地面（型の配色で決まる）
 *                        acc=灯りの色 lamp=灯りの色×時間帯の灯り強度
 *                        ink=最前面の地面影 mist=霧・煙 snow=雪面
 *                        sky0..3=時間帯の空色 water=水面（配色で決まる）
 *   配置（レシピの項）   … p=部品id n=個数[min,max] x=配置区間 y=基線
 *                        j=y揺らぎ s=拡大縮小範囲 mirror=左右反転を許す o=不透明度
 *   層                  … far→mid→front→light→atmos の順に重ねる
 *   町の場所の差分       … town.<型>.places.<key> は基のレシピに層ごと追記される
 *   ダンジョン           … sky:false で空を描かず地下の闇にする
 */

/** 色（#rrggbb） */
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "色は #rrggbb 形式");
/** 不透明度（0〜1） */
const op = z.number().min(0).max(1);

/** 塗りの役割の語彙（レンダラが時間帯パレットと型の配色から解決する） */
export const SCENERY_FILLS = [
  "s0",
  "s1",
  "s2",
  "acc",
  "lamp",
  "ink",
  "mist",
  "snow",
  "sky0",
  "sky1",
  "sky2",
  "sky3",
  "water",
] as const;

const fillRole = { f: z.enum(SCENERY_FILLS), o: op.optional() };

/** 部品を構成する形（ローカル座標。w 指定のある形は塗りではなく線として描く） */
const shapeSchema = z.discriminatedUnion("k", [
  z
    .object({
      k: z.literal("path"),
      d: z.string().min(1),
      /** 線幅。指定すると塗りではなく線（stroke）として描く */
      w: z.number().positive().optional(),
      ...fillRole,
    })
    .strict(),
  z
    .object({
      k: z.literal("rect"),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      ...fillRole,
    })
    .strict(),
  z
    .object({ k: z.literal("circle"), cx: z.number(), cy: z.number(), r: z.number(), ...fillRole })
    .strict(),
  z
    .object({
      k: z.literal("ellipse"),
      cx: z.number(),
      cy: z.number(),
      rx: z.number(),
      ry: z.number(),
      ...fillRole,
    })
    .strict(),
  z
    .object({
      k: z.literal("ring"),
      cx: z.number(),
      cy: z.number(),
      rx: z.number(),
      ry: z.number(),
      /** 線幅 */
      w: z.number().positive().optional(),
      ...fillRole,
    })
    .strict(),
  z.object({ k: z.literal("poly"), pts: z.string().min(1), ...fillRole }).strict(),
  z
    .object({
      k: z.literal("line"),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      w: z.number().positive().optional(),
      ...fillRole,
    })
    .strict(),
]);

/** 情景の部品（レシピから参照されるシルエットの断片） */
export const sceneryPartSchema = z
  .object({
    /** 足場の幅（px。配置の x はこの幅の左端・左右反転もこの幅で折り返す） */
    w: z.number().positive(),
    /** 形のバリエーション（配置ごとにシードから1つ選ばれる） */
    variants: z.array(z.object({ shapes: z.array(shapeSchema).min(1) }).strict()).min(1),
  })
  .strict();

/** レシピの配置項（1つの部品を層にどう並べるか） */
export const sceneryEntrySchema = z
  .object({
    /** 部品 id（parts のキー） */
    p: z.string().regex(/^[a-z0-9_]+$/),
    /** 置く個数：固定の数または範囲 [min,max]（省略時 1。[0,n] なら出ないこともある） */
    n: z
      .union([z.number().int().min(0), z.tuple([z.number().int().min(0), z.number().int().min(1)])])
      .optional(),
    /** 配置の x：点（数値）または区間 [min,max]（部品の左端） */
    x: z.union([z.number(), z.tuple([z.number(), z.number()])]),
    /** 基線の y（地表面。この高さに足場が着く） */
    y: z.number(),
    /** y の散らし幅（±。省略時 0） */
    j: z.number().min(0).optional(),
    /** 拡大縮小：固定の倍率または範囲 [min,max]（省略時 1） */
    s: z
      .union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])])
      .optional(),
    /** 左右反転を許す */
    mirror: z.literal(true).optional(),
    /** バリエーションの固定（省略時はシードで選ぶ） */
    v: z.number().int().min(0).optional(),
    /** この項全体の不透明度の係数 */
    o: op.optional(),
  })
  .strict();

/** 層ごとの配置リスト */
const layers = {
  /** 遠景（稜線・峰・水平線） */
  far: z.array(sceneryEntrySchema).optional(),
  /** 中景（建物・木・構造物） */
  mid: z.array(sceneryEntrySchema).optional(),
  /** 前景（地面・水面・手前の影） */
  front: z.array(sceneryEntrySchema).optional(),
  /** 灯り（窓・灯籠・火・蛍 —— 時間帯の灯り強度で点滅する） */
  light: z.array(sceneryEntrySchema).optional(),
  /** 空気（霧・煙・鳥 —— 灯りの上・天候の下） */
  atmos: z.array(sceneryEntrySchema).optional(),
};

/** 場所ごとの差分レシピ（基のレシピに層ごと追記される。palette は上書き） */
const subRecipeSchema = z.object({ palette: z.string().min(1).optional(), ...layers }).strict();

/** 型ごとの情景レシピ（町の型・地域の型・ダンジョンの型） */
export const sceneryRecipeSchema = z
  .object({
    /** 配色（palettes のキー。省略時は時間帯の既定の影色） */
    palette: z.string().min(1).optional(),
    /** false なら空を描かない（地下のダンジョン用） */
    sky: z.literal(false).optional(),
    ...layers,
    /** 町の場所ごとの差分（key=場所テンプレートの key。基のレシピに追記される） */
    places: z.record(z.string().regex(/^[a-z0-9_]+$/), subRecipeSchema).optional(),
  })
  .strict();

/** 型の配色（時間帯パレットに乗る差分） */
export const sceneryPaletteSchema = z
  .object({
    /** 遠・中・前景の影色（null の層は時間帯の既定を使う） */
    sil: z.array(hex.nullable()).length(3).optional(),
    /** 灯りの色（既定 #f1c27d） */
    acc: hex.optional(),
    /** 空のグラデーションの上書き（各 stop。null は時間帯のまま） */
    sky: z.array(hex.nullable()).length(4).optional(),
    /** 水面の色（water の塗り。既定は遠景の影色） */
    water: hex.optional(),
    /** 雪面の色（snow の塗り。既定は固定的な白） */
    snow: hex.optional(),
    /** 空気感の霞（灯り・天候の間に掛かる薄い層） */
    veil: z
      .object({ color: hex, op: z.number().min(0).max(0.5) })
      .strict()
      .optional(),
  })
  .strict();

export const sceneryFileSchema = z
  .object({
    version: z.literal(1),
    /** 情景の部品の図鑑 */
    parts: z.record(z.string().regex(/^[a-z0-9_]+$/), sceneryPartSchema),
    /** 配色の図鑑 */
    palettes: z.record(z.string().regex(/^[a-z0-9_]+$/), sceneryPaletteSchema),
    /** 町の型のレシピ（world.json townTypes の id で引く） */
    town: z.record(z.string().regex(/^[a-z0-9_]+$/), sceneryRecipeSchema),
    /** 地域の型のレシピ（world.json areaTypes の id で引く） */
    region: z.record(z.string().regex(/^[a-z0-9_]+$/), sceneryRecipeSchema),
    /** ダンジョンの型のレシピ（深層・将来のダンジョン生成の型） */
    dungeon: z.record(z.string().regex(/^[a-z0-9_]+$/), sceneryRecipeSchema),
    /** 固定マップ（?world=legacy）での型の当て方 */
    legacy: z
      .object({
        /** 町 id → 町の型（アルディ=宿場街・ベルン=港町） */
        towns: z.record(z.string(), z.string()),
        /** 地域（場所 id）→ 地域の型のレシピ */
        regions: z.record(z.string(), z.string()),
      })
      .strict(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const partIds = new Set(Object.keys(file.parts));
    const palIds = new Set(Object.keys(file.palettes));
    const checkLayers = (r: z.infer<typeof subRecipeSchema>, where: string) => {
      if (r.palette !== undefined && !palIds.has(r.palette)) {
        ctx.addIssue({ code: "custom", message: `${where}: 未定義の配色 ${r.palette}` });
      }
      for (const layer of ["far", "mid", "front", "light", "atmos"] as const) {
        for (const [i, e] of (r[layer] ?? []).entries()) {
          if (!partIds.has(e.p)) {
            ctx.addIssue({
              code: "custom",
              message: `${where}.${layer}[${i}]: 未定義の部品 ${e.p}`,
            });
          }
          if (Array.isArray(e.n) && e.n[0] > e.n[1]) {
            ctx.addIssue({ code: "custom", message: `${where}.${layer}[${i}]: n の範囲が逆` });
          }
          if (Array.isArray(e.s) && e.s[0] > e.s[1]) {
            ctx.addIssue({ code: "custom", message: `${where}.${layer}[${i}]: s の範囲が逆` });
          }
          if (Array.isArray(e.x) && e.x[0] > e.x[1]) {
            ctx.addIssue({ code: "custom", message: `${where}.${layer}[${i}]: x の範囲が逆` });
          }
        }
      }
    };
    const checkRecipe = (r: z.infer<typeof sceneryRecipeSchema>, where: string) => {
      checkLayers(r, where);
      for (const [key, sub] of Object.entries(r.places ?? {})) {
        checkLayers(sub, `${where}.places.${key}`);
      }
    };
    for (const [id, r] of Object.entries(file.town)) checkRecipe(r, `town.${id}`);
    for (const [id, r] of Object.entries(file.region)) checkRecipe(r, `region.${id}`);
    for (const [id, r] of Object.entries(file.dungeon)) checkRecipe(r, `dungeon.${id}`);
    // 固定マップの当て先は実在する型
    for (const [town, type] of Object.entries(file.legacy.towns)) {
      if (!(type in file.town)) {
        ctx.addIssue({ code: "custom", message: `legacy.towns.${town}: 未定義の町の型 ${type}` });
      }
    }
    for (const [place, type] of Object.entries(file.legacy.regions)) {
      if (!(type in file.region)) {
        ctx.addIssue({
          code: "custom",
          message: `legacy.regions.${place}: 未定義の地域の型 ${type}`,
        });
      }
    }
  });

export type SceneryShape = z.infer<typeof shapeSchema>;
export type SceneryPart = z.infer<typeof sceneryPartSchema>;
export type SceneryEntry = z.infer<typeof sceneryEntrySchema>;
export type ScenerySubRecipe = z.infer<typeof subRecipeSchema>;
export type SceneryRecipe = z.infer<typeof sceneryRecipeSchema>;
export type SceneryPalette = z.infer<typeof sceneryPaletteSchema>;
export type SceneryFile = z.infer<typeof sceneryFileSchema>;
