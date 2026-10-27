import { z } from "zod";

/**
 * places.json — 街の中の場所と街の外の地域（P-01、docs/03 §2）。
 *
 * 街の中の場所は見取り図（pos = 地図上の座標 %）から選び、場所ごとの
 * 景色（scene）・そこに居る人（npcs = voices.json の id）・そこでできる
 * 行動（actions）を持つ。街の外の地域（kind="region"）は門から出て
 * 行く先で、移動は行動を消費する（数値は balance.travel）。
 *
 * actions の意味は画面側（apps/web）が引く。ここでは「どこで何が
 * できるか」の対応だけを持つ：
 *   work/kinds … その場所に届く注文の技能（skills.json の id）。
 *                default=true ならどこにも割り当たっていない注文の受け皿
 *   travel/to  … 行き先の場所 id（街→地域・地域→地域・地域→門）
 *   それ以外   … type だけを持つ（hunt/fish/abyss/book/news/lore/…）
 */

/** 場所でできる行動の種類 */
export const PLACE_ACTION_TYPES = [
  "work",
  "train",
  "hunt",
  "fish",
  "abyss",
  "book",
  "news",
  "lore",
  "society",
  "records",
  "mentor",
  "sleep",
  "rest",
  "status",
  "settings",
  "incident",
  "crisis",
  "occasion",
  "retire",
  "reset",
  "travel",
] as const;

export type PlaceActionType = (typeof PLACE_ACTION_TYPES)[number];

export const placeActionSchema = z
  .object({
    type: z.enum(PLACE_ACTION_TYPES),
    /** work のみ：この場所に届く注文の技能（skills.json の id） */
    kinds: z.array(z.string().min(1)).optional(),
    /** work のみ：どこにも割り当たっていない注文をここで受ける */
    default: z.literal(true).optional(),
    /** travel のみ：行き先の場所 id */
    to: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.type === "work" && a.kinds === undefined && a.default !== true) {
      ctx.addIssue({
        code: "custom",
        message: "work の行動には kinds（届く注文の技能）か default が必要",
      });
    }
    if (a.type === "travel" && a.to === undefined) {
      ctx.addIssue({ code: "custom", message: "travel の行動には to（行き先）が必要" });
    }
    if (a.type !== "work" && (a.kinds !== undefined || a.default !== undefined)) {
      ctx.addIssue({ code: "custom", message: "kinds/default は work の行動にだけ使う" });
    }
    if (a.type !== "travel" && a.to !== undefined) {
      ctx.addIssue({ code: "custom", message: "to は travel の行動にだけ使う" });
    }
  });

/** 情景のキー（apps/web の SceneBackground が同じ名前で引く） */
export const PLACE_SCENES = [
  "town",
  "forge",
  "market",
  "tavern",
  "guild",
  "church",
  "inn",
  "gate",
  "home",
  "forest",
  "highway",
  "lake",
  "abyss",
] as const;

export type PlaceScene = (typeof PLACE_SCENES)[number];

export const placeSchema = z
  .object({
    /** 場所 id（画面・条件・記録のキー。地域は enemies.json の area と揃える） */
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 表示名 */
    name: z.string().min(1),
    /** town=街の中（見取り図から選ぶ。移動は行動を消費しない） / region=街の外（門から出る） */
    kind: z.enum(["town", "region"]),
    /** 背景の情景キー */
    scene: z.enum(PLACE_SCENES),
    /** 街の見取り図での位置（% 座標。街の場所だけ持つ） */
    pos: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
    /** その場所の情景の一行（会話窓・見取り図の案内に出す） */
    desc: z.string().min(1),
    /** そこに居る人（voices.json の npc id。師匠の居所の対応にも使う） */
    npcs: z.array(z.string().min(1)),
    /** そこでできる行動 */
    actions: z.array(placeActionSchema).min(1),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.kind === "town" && p.pos === undefined) {
      ctx.addIssue({ code: "custom", message: "街の場所には pos（見取り図の位置）が必要" });
    }
  });

export const placesFileSchema = z
  .object({
    version: z.literal(1),
    /** 街の名（見取り図の題字用） */
    town: z.string().min(1),
    places: z.array(placeSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (const p of file.places) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `場所 id の重複: ${p.id}` });
      ids.add(p.id);
    }
    for (const p of file.places) {
      for (const a of p.actions) {
        if (a.type === "travel" && a.to !== undefined && !ids.has(a.to)) {
          ctx.addIssue({
            code: "custom",
            message: `${p.id}: 行き先の場所 ${a.to} が未定義`,
          });
        }
      }
    }
    // どこにも割り当たっていない注文の受け皿（default）は高々1箇所
    const defaults = file.places.filter((p) =>
      p.actions.some((a) => a.type === "work" && a.default === true),
    );
    if (defaults.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `注文の受け皿（default）は1箇所まで: ${defaults.map((p) => p.id).join(",")}`,
      });
    }
  });

export type PlaceActionJson = z.infer<typeof placeActionSchema>;
export type PlaceJson = z.infer<typeof placeSchema>;
export type PlacesFile = z.infer<typeof placesFileSchema>;
