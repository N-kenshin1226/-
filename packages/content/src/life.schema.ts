import { z } from "zod";

/**
 * life.json — 日々の営み（P-02「行動の種類を増やす」）の定義表。
 *
 * 散策・採集・料理・賭け事・人との時間・市場・依頼掲示板・旅の
 * 「何が起きるか・何が取れるか・何と引き換えるか」をここに持つ。
 * 各係数（効き具合・確率・回数）は balance.json の life 節が持ち、
 * core が両方をまとめて LifeConfig として受け取る。
 *
 * 散策の出来事は incidents（F-05）の会話ではなく「歩いて起きた小さなこと」：
 * 一文の地の文＋小さな効果（拾い物・出会い・見聞・経験・疲労）。
 * 抽選は世界シード×日付×回目の独立した乱数列で決定的に行う。
 */

/** 散策・道中の出来事1件：結末の文と小さな効果 */
export const lifeOutcomeSchema = z
  .object({
    /** 結果の抽選の重み */
    weight: z.number().positive(),
    /** 結末の一文（記録の行。「――」始まりの地の文） */
    text: z.string().min(1),
    /** 動く金（G。負の値で損失。所持金は 0 未満にならない） */
    money: z.number().optional(),
    /** 拾い物（items.json の id → 個数） */
    items: z.record(z.string().min(1), z.number().positive()).optional(),
    /** 出会った人（voices.json の npc id。仲の値が育つ） */
    npc: z.string().min(1).optional(),
    /** 仲の値の増分（npc と一緒に。省略時は小さな値） */
    bond: z.number().positive().optional(),
    /** 見聞録に記すアトムの id（手がかり系の結果。lore/atoms の id） */
    atom: z.string().min(1).optional(),
    /** 未定着経験（skill は skills.json の id） */
    gain: z
      .object({ skill: z.string().min(1), amount: z.number() })
      .strict()
      .optional(),
    /** 疲労の増減（負の値で回復） */
    fatigue: z.number().optional(),
    /** 立つ旗印（縁・手がかりの刻印。条件DSLが読める） */
    flag: z.string().min(1).optional(),
    /** 祈りの刻印（祠などの地点の出来事。その日の眠りが少し深くなる） */
    pray: z.literal(true).optional(),
    /**
     * 噂話（G-02、docs/10 §7）：聞き覚えのある町・地域が1つ増える
     * （旅人・行商人の口から届く名。地図の霧が晴れる）
     */
    reveal: z.literal(true).optional(),
  })
  .strict();

/** 採集の品1件：取れる品とその条件（季節・天候で出る物が変わる） */
export const gatherEntrySchema = z
  .object({
    /** 品物の id（items.json の id） */
    item: z.string().min(1),
    /** 抽選の重み */
    weight: z.number().positive(),
    /** 1回に取れる数の幅（min〜max） */
    n: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    /** 取れる季節（季節インデックス。省略時は通年） */
    seasons: z.array(z.number().int().nonnegative()).min(1).optional(),
    /** 取れる天候（weather.json の kind id。省略時はどんな空でも） */
    weather: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

/** 採集の表（場所ごと）：育つ技能と取れる品 */
export const gatherTableSchema = z
  .object({
    /** 採集で育つ技能（skills.json の id。森=採集・湖=釣り・畑=農耕・露頭=採掘） */
    skill: z.string().min(1),
    /** 採集の難度（経験の挑戦差の基準。低い場所は初心者でも採れる） */
    difficulty: z.number().min(0).max(100),
    entries: z.array(gatherEntrySchema).min(1),
  })
  .strict();

/** 料理のレシピ：材料・仕上がり・技能 */
export const recipeSchema = z
  .object({
    /** レシピの id（台帳の order 欄に記す） */
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 料理の名（出来た品物と同じ名でよい） */
    name: z.string().min(1),
    /** 材料（items.json の id → 個数） */
    inputs: z.record(z.string().min(1), z.number().int().positive()),
    /** できる品物（items.json の id。meal であること） */
    out: z.string().min(1),
    /** 作る技能（skills.json の id。料理なら cooking、薬膳なら medicinal_meal） */
    skill: z.string().min(1),
    /** 作るのの難度（経験の挑戦差の基準。品質はミニゲーム・まかせ判定が決める） */
    difficulty: z.number().min(0).max(100),
  })
  .strict();

/** 掲示板の依頼1件：納める品と報酬 */
export const errandSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 依頼の名 */
    name: z.string().min(1),
    /** 依頼の一句（掲示板に出る文） */
    text: z.string().min(1),
    /** 出る町（life.json towns の id。省略時はどの町の掲示板にも出る） */
    town: z.string().min(1).optional(),
    /** 納める品（items.json の id → 個数） */
    need: z.record(z.string().min(1), z.number().int().positive()),
    /** 報酬 */
    reward: z
      .object({
        money: z.number().int().nonnegative().optional(),
        /** 仲の深まり（voices.json の npc id → 増分） */
        bond: z
          .object({ npc: z.string().min(1), amount: z.number().positive() })
          .strict()
          .optional(),
        /** 未定着経験 */
        gain: z
          .object({ skill: z.string().min(1), amount: z.number() })
          .strict()
          .optional(),
        /** 品物の報酬（items.json の id → 個数） */
        items: z.record(z.string().min(1), z.number().int().positive()).optional(),
      })
      .strict(),
  })
  .strict();

export const lifeFileSchema = z
  .object({
    version: z.literal(1),
    /**
     * 町と町（町 id → 表示名・地図の位置）。name は見取り図の題字に、
     * pos は地方の地図での町の位置（% 座標。G-02）に使う
     */
    towns: z.record(
      z.string().min(1),
      z
        .object({
          name: z.string().min(1),
          pos: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
        })
        .strict(),
    ),
    /**
     * 町と町の間の道（from/to は町 id、双方向に使う。days = 道中に要する日数）。
     * G-02 の道の刻印：danger は道中の遭遇の濃さ、kind は街道/山道/海路
     * （危機の closeRoads・船の通い方が読む）、checkpoint は関所の通行料、
     * closedSeasons は季節の通行止め（季節インデックス）、enemies は道中の敵
     */
    journeys: z
      .array(
        z
          .object({
            from: z.string().min(1),
            to: z.string().min(1),
            days: z.number().int().positive(),
            danger: z.number().min(0).max(10).optional(),
            kind: z.enum(["highway", "mountain", "sea"]).optional(),
            checkpoint: z.object({ fee: z.number().int().nonnegative() }).strict().optional(),
            closedSeasons: z.array(z.number().int().min(0).max(3)).min(1).optional(),
            enemies: z
              .array(z.object({ id: z.string().min(1), weight: z.number().positive() }).strict())
              .min(1)
              .optional(),
          })
          .strict(),
      )
      .min(1),
    /**
     * 散策・道中の出来事の表（表のキー → 重み表）。
     * 街の中 "town"・街の外 "region"・旅の道中 "road" を持つ
     */
    stroll: z.record(z.string().min(1), z.array(lifeOutcomeSchema).min(1)),
    /** 採集の表（場所 id → 取れる品と技能） */
    gather: z.record(z.string().min(1), gatherTableSchema),
    /** 料理のレシピ */
    recipes: z.array(recipeSchema).min(1),
    /** 市場（品物の売り買い） */
    market: z
      .object({
        /** 店に並ぶ品（素材・食料品。towns で町ごとの品揃え） */
        stock: z
          .array(
            z
              .object({
                id: z.string().min(1),
                towns: z.array(z.string().min(1)).min(1).optional(),
              })
              .strict(),
          )
          .min(1),
        /** 売るときの相場係数（品の基準値×この値＋町係数が売値の基準） */
        sellFactor: z.number().min(0).max(1),
        /** 買うときの相場係数 */
        buyFactor: z.number().min(1),
        /** 町ごとの品目別の相場（町id → 品idか"*" → 係数） */
        townFactor: z.record(z.string().min(1), z.record(z.string().min(1), z.number().positive())),
      })
      .strict(),
    /** 賭け事（酒場のサイコロ・カード） */
    gamble: z
      .object({
        /** 張れる掛け金の段（G） */
        stakes: z.array(z.number().positive()).min(1),
        /** 勝ったとき掛け金に対して戻る倍率（賭け金＋増分） */
        winFactor: z.number().min(1),
      })
      .strict(),
    /** 祈る／寄付（教会の行動。施しの額の段） */
    pray: z
      .object({
        /** 納められる施しの額の段（G） */
        alms: z.array(z.number().positive()).min(1),
      })
      .strict(),
    /** 人と過ごす（話す・飲む・贈る）の基準値 */
    social: z
      .object({
        talk: z.object({ bond: z.number().positive() }).strict(),
        drink: z
          .object({ cost: z.number().int().nonnegative(), bond: z.number().positive() })
          .strict(),
        gift: z
          .object({ bondPerPrice: z.number().positive(), cap: z.number().positive() })
          .strict(),
      })
      .strict(),
    /** 掲示板の依頼（納品系の日々の頼み） */
    errands: z.array(errandSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const towns = new Set(Object.keys(file.towns));
    for (const j of file.journeys) {
      if (!towns.has(j.from))
        ctx.addIssue({ code: "custom", message: `道の起点 ${j.from} が未定義の町` });
      if (!towns.has(j.to))
        ctx.addIssue({ code: "custom", message: `道の行き先 ${j.to} が未定義の町` });
      if (j.from === j.to) ctx.addIssue({ code: "custom", message: `道の両端が同じ町 ${j.from}` });
    }
    for (const [table, entries] of Object.entries(file.stroll)) {
      for (const o of entries) {
        if (o.weight <= 0)
          ctx.addIssue({ code: "custom", message: `stroll ${table}: 重みのない結果` });
      }
    }
    if (file.stroll.town === undefined) {
      ctx.addIssue({ code: "custom", message: "stroll に town の表が必要" });
    }
    if (file.stroll.road === undefined) {
      ctx.addIssue({ code: "custom", message: "stroll に road の表が必要" });
    }
  });

export type LifeOutcomeJson = z.infer<typeof lifeOutcomeSchema>;
export type GatherEntryJson = z.infer<typeof gatherEntrySchema>;
export type GatherTableJson = z.infer<typeof gatherTableSchema>;
export type RecipeJson = z.infer<typeof recipeSchema>;
export type ErrandJson = z.infer<typeof errandSchema>;
export type LifeFile = z.infer<typeof lifeFileSchema>;
