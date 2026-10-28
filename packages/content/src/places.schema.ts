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
 *   journey/to … 行き先の町 id（P-02。life.json towns の id。数日かかる旅）
 *   それ以外   … type だけを持つ（hunt/fish/abyss/book/news/lore/…）
 *
 * P-02「行動の種類を増やす」で加わった行動：
 *   stroll  散策（歩いて起きる小さな出来事。life.json stroll の表）
 *   gather  採集（場所ごとの採集表 life.json gather。品物が手に入る）
 *   market  市場売買（品物の売り買い。行動は消費しない）
 *   cook    料理（レシピから品を作る。行動を消費する）
 *   gamble  賭け事（酒場のサイコロ。行動を消費する）
 *   social  人と過ごす（話す・飲む・贈る。仲の値が育つ）
 *   board   依頼掲示板（納品系の日々の頼み。life.json errands）
 *   pray    祈る／寄付（祈りは行動・寄付はお金。世界の備えにも足せる）
 *   eat     食事（持ち物の料理・宿の食事。次の眠りの質に効く）
 *   shelf   持ち物棚（持ち物の一覧。行動は消費しない）
 */

/** 場所でできる行動の種類 */
export const PLACE_ACTION_TYPES = [
  "work",
  "train",
  "hunt",
  "fish",
  "abyss",
  /** 武器屋（K-01。weapons.json の売り物を並べ、購入と持ち替えができる） */
  "arms",
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
  /** 以下 P-02「行動の種類を増やす」 */
  "stroll",
  "gather",
  "market",
  "cook",
  "gamble",
  "social",
  "board",
  "pray",
  "eat",
  "shelf",
  "journey",
  /** 魔法（M-01）：生活魔法の使用と武器への付与（エンチャント）の窓 */
  "magic",
  /** 地域の中の小さな地点への立ち寄り（G-01。world.json の生成が付ける） */
  "spot",
] as const;

export type PlaceActionType = (typeof PLACE_ACTION_TYPES)[number];

export const placeActionSchema = z
  .object({
    type: z.enum(PLACE_ACTION_TYPES),
    /** work のみ：この場所に届く注文の技能（skills.json の id） */
    kinds: z.array(z.string().min(1)).optional(),
    /** work のみ：どこにも割り当たっていない注文をここで受ける */
    default: z.literal(true).optional(),
    /** travel は行き先の場所 id、journey は行き先の町 id（P-02） */
    to: z.string().min(1).optional(),
    /** spot のみ：立ち寄る地点の id（world.json の生成で付く） */
    spot: z.string().min(1).optional(),
    /** コマンドの表示名（spot などデータ由来の名が要る行動） */
    label: z.string().min(1).optional(),
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
    if (a.type === "journey" && a.to === undefined) {
      ctx.addIssue({ code: "custom", message: "journey の行動には to（行き先の町）が必要" });
    }
    if (a.type === "spot" && a.spot === undefined) {
      ctx.addIssue({ code: "custom", message: "spot の行動には spot（地点 id）が必要" });
    }
    if (a.type !== "work" && (a.kinds !== undefined || a.default !== undefined)) {
      ctx.addIssue({ code: "custom", message: "kinds/default は work の行動にだけ使う" });
    }
    if (a.type !== "travel" && a.type !== "journey" && a.to !== undefined) {
      ctx.addIssue({ code: "custom", message: "to は travel/journey の行動にだけ使う" });
    }
    if (a.type !== "spot" && a.spot !== undefined) {
      ctx.addIssue({ code: "custom", message: "spot は spot の行動にだけ使う" });
    }
    if (a.type !== "spot" && a.label !== undefined) {
      ctx.addIssue({ code: "custom", message: "label は spot の行動にだけ使う" });
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
    /**
     * 属する町（P-02、life.json towns の id。省略時は基点の町 "ardi"）。
     * 町の場所はその町の見取り図にだけ並び、街の外の地域はその町の門から出る
     */
    town: z.string().min(1).optional(),
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
