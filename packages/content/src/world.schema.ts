import { z } from "zod";
import { PLACE_SCENES, placeActionSchema } from "./places.schema.js";
import { gatherEntrySchema, lifeOutcomeSchema } from "./life.schema.js";

/**
 * world.json — シードごとの地方生成に使う「型」の定義（G-01、docs/10 §3〜5）。
 *
 * 町の型（townTypes）・地域の型（areaTypes）・小さな地点の型（spotKinds）は
 * 手で作り込むデータで、生成の数値ルール（町の数・道・危険度の伸び）は
 * balance.json の world 節が持つ。core はこの定義を受け取って
 * 決定論的に地方を組み立てる（生成結果は保存せず seed から導出する）。
 *
 * 生成の約束：
 *   町の場所 id … `<町id>.<key>`（例: t3.market）
 *   地域 id     … `<型id>` / `<型id>.<連番>`（同じ型が複数あると .2 .3 …）
 *   住人 id     … `npc.<町id>.<role>`
 *   師匠 id     … `mentor.<町id>.<role>`
 *   地点 id     … `<地域id>.spot.<連番>`
 *   町ごとの依頼 id … `err.<町id>.<key>`
 */

/** 町テンプレートの場所で宣言できる行動（travel/journey/spot は生成側が付ける） */
const townPlaceActionSchema = placeActionSchema.superRefine((a, ctx) => {
  if (a.type === "travel" || a.type === "journey") {
    ctx.addIssue({
      code: "custom",
      message: "町テンプレートに travel/journey は書かない（生成時に道・隣町から付く）",
    });
  }
  if (a.type === "spot") {
    ctx.addIssue({
      code: "custom",
      message: "町テンプレートに spot は書かない（地域の地点として生成する）",
    });
  }
});

/** 町の場所テンプレート（townBase.places / townTypes[].places） */
export const townPlaceSchema = z
  .object({
    /** 場所のキー（生成される場所 id の末尾。<町id>.<key> になる） */
    key: z.string().regex(/^[a-z0-9_]+$/, "key は小文字・数字・_ で構成する"),
    /** 表示名 */
    name: z.string().min(1),
    /** 背景の情景キー（places.json と同じ語彙） */
    scene: z.enum(PLACE_SCENES),
    /** 見取り図での基準位置（% 座標。生成時に balance.world.placeJitter で散る） */
    pos: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
    /** 情景の一行（{town} は町名に置き換わる） */
    desc: z.string().min(1),
    /** 行動（travel/journey/spot 以外 —— 道は生成が付ける） */
    actions: z.array(townPlaceActionSchema).min(1),
    /** 採集できる場所（農村の共同畑など。表は地域の gather と同じ形） */
    gather: z
      .object({
        skill: z.string().min(1),
        difficulty: z.number().nonnegative(),
        entries: z.array(gatherEntrySchema).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

/** 住人テンプレート（町の型・基本セット共通） */
export const npcTemplateSchema = z
  .object({
    /** 役割キー（住人 id の末尾。`npc.<町id>.<role>` になる） */
    id: z.string().regex(/^[a-z0-9_]+$/, "id は小文字・数字・_ で構成する"),
    /** 役割の表示名（宿屋の主・坑夫長…） */
    label: z.string().min(1),
    /** 居場所（場所テンプレートの key） */
    place: z.string().regex(/^[a-z0-9_]+$/),
    /**
     * 師匠になれる技能（mentorSkills）。指定するとその町で師匠として登録され、
     * 技能はこの一覧からシードで選ばれる（師匠の人物にだけ付く枠）
     */
    mentorSkills: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

/** 市場の傾向（特産＝安い品、不足＝高い品、追加の品揃え） */
export const townMarketSchema = z
  .object({
    /** 品揃えに足す品（items.json の id） */
    stock: z.array(z.string().min(1)).optional(),
    /** 安い品（特産。balance.world.market.cheapFactor） */
    cheap: z.array(z.string().min(1)).optional(),
    /** 高い品（不足品。balance.world.market.dearFactor） */
    dear: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** 町ごとの掲示依頼テンプレート（bond:true はその町の宿屋の主への仲になる） */
export const townErrandSchema = z
  .object({
    /** 依頼のキー（生成される id は `err.<町id>.<key>`） */
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    text: z.string().min(1),
    need: z.record(z.string().min(1), z.number().positive()),
    reward: z
      .object({
        money: z.number().nonnegative().optional(),
        gain: z
          .object({ skill: z.string().min(1), amount: z.number() })
          .strict()
          .optional(),
        items: z.record(z.string().min(1), z.number().positive()).optional(),
        /** true ならその町の宿屋の主との仲が育つ（量は balance.world.errandBond） */
        bond: z.literal(true).optional(),
      })
      .strict(),
  })
  .strict();

/** 町の型（9種） */
export const townTypeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 型の表示名（宿場街・港町…） */
    name: z.string().min(1),
    /** 型の情景説明（デバッグ・将来の名札用） */
    desc: z.string().min(1),
    /** 町名の候補（重複しないよう世界中で使い回さない。尽きたら通し番号） */
    names: z.array(z.string().min(1)).min(6),
    /**
     * 始まりの町になり得る度合い（0 なら始まりの町にはならない。
     * 砦・隠れ里は 0 —— 旅立ちは日常的な町から）
     */
    startWeight: z.number().nonnegative(),
    /** 他の町として選ばれる度合い */
    weight: z.number().positive(),
    /** 基本の場所（townBase.places）から外す key（例: 隠れ里は市場を持たない） */
    omit: z.array(z.string().regex(/^[a-z0-9_]+$/)).optional(),
    /** 基本の場所名の上書き（key → 別名。集会所を兵営集会所に、など） */
    placeNames: z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().min(1)).optional(),
    /** 型固有の場所（基本セットに足す） */
    places: z.array(townPlaceSchema).optional(),
    /** 型固有の住人（基本の住人に足す） */
    npcs: z.array(npcTemplateSchema).optional(),
    /** 市場の傾向（特産・不足・品揃え） */
    market: townMarketSchema.optional(),
    /** 型ごとの掲示依頼 */
    errands: z.array(townErrandSchema).optional(),
    /** この型の町で起きる散策の出来事（town 表に足される） */
    stroll: z.array(lifeOutcomeSchema).optional(),
  })
  .strict();

/** 地域の型（野外。14種＋特別な型） */
export const areaTypeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 型の表示名（森・湖…） */
    name: z.string().min(1),
    /** 地域名の候補（世界中で重複しない。尽きたら通し番号） */
    names: z.array(z.string().min(1)).min(4),
    /** 情景の説明の候補（生成時に1つ選ばれる） */
    descs: z.array(z.string().min(1)).min(1),
    /** 情景キー（既存の SceneKind から選ぶ） */
    scene: z.enum(PLACE_SCENES),
    /** 基本の危険度（1〜10。実際の危険度は始まりの町からの距離とずれで決まる） */
    danger: z.number().int().min(1).max(10),
    /**
     * 特別な地域の印（"farm"=始まりの町の近くに1つ・"abyss"=最も遠い町に1つ。
     * 通常の地域は省略 —— 抽選でどこにでも出る）
     */
    special: z.enum(["farm", "abyss"]).optional(),
    /** 狩り場になるか（enemies があれば真扱い） */
    hunt: z.boolean().optional(),
    /** 釣りができるか */
    fish: z.boolean().optional(),
    /** 仕事（その地域に届く注文の技能） */
    work: z
      .object({ kinds: z.array(z.string().min(1)).min(1) })
      .strict()
      .optional(),
    /** 採集の表（省略時は採集できない地域） */
    gather: z
      .object({
        skill: z.string().min(1),
        difficulty: z.number().nonnegative(),
        entries: z.array(gatherEntrySchema).min(1),
      })
      .strict()
      .optional(),
    /** 出てくる敵（enemies.json の id＋重み。危険度で絞り込まれる） */
    enemies: z
      .array(z.object({ id: z.string().min(1), weight: z.number().positive() }).strict())
      .min(1)
      .optional(),
    /** 出やすい地点の型（spotKinds の id＋重み） */
    spots: z
      .array(z.object({ kind: z.string().min(1), weight: z.number().positive() }).strict())
      .optional(),
    /** この型の地域で起きる散策の出来事（region 表に足される） */
    stroll: z.array(lifeOutcomeSchema).optional(),
  })
  .strict();

/** 地域の中の小さな地点の型（泉・小屋・塔跡…） */
export const spotKindSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 地点名の候補 */
    names: z.array(z.string().min(1)).min(2),
    /** 立ち寄ったときの出来事の表（散策と同じ1件引き。pray も使える） */
    outcomes: z.array(lifeOutcomeSchema).min(1),
  })
  .strict();

/** 迷宮の罠の型（G-03、docs/10 §6。trapKinds） */
export const trapKindSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 罠の表示名（見破ったときの名札に使う） */
    name: z.string().min(1),
    /** 見破りの難しさ（観察との差で回避率が動く） */
    difficulty: z.number().nonnegative(),
    /** 踏んだときの消耗（疲労） */
    fatigue: z.number().nonnegative(),
    /** 踏んだときの灯りロス（絡まり・水流など手間のかかる罠） */
    light: z.number().int().nonnegative(),
    /** 踏んだときの文（「――…。」の機械的口調） */
    sprungText: z.string().min(1),
    /** 見破ったときの文 */
    avoidText: z.string().min(1),
  })
  .strict();

/** 迷宮の型（G-03、docs/10 §6。洞窟・坑道・地下墓所・古代遺跡・魔物の巣・塔・沈んだ神殿） */
export const dungeonTypeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 型の表示名（洞窟・塔…） */
    name: z.string().min(1),
    /** 基本の危険度（1〜10。深い型ほど遠い町に置かれる。地域の型と同じ語彙） */
    danger: z.number().int().min(1).max(10),
    /** 迷宮名の候補（世界中で重複しない。尽きたら通し番号） */
    names: z.array(z.string().min(1)).min(4),
    /** 情景の説明（生成時に1つ…は使わず、型の情景として場所の desc に置く） */
    desc: z.string().min(1),
    /** 部屋の敵の表（enemies.json の id＋重み） */
    enemies: z
      .array(z.object({ id: z.string().min(1), weight: z.number().positive() }).strict())
      .min(1),
    /** 罠の部屋に仕掛ける罠の表（trapKinds の id＋重み） */
    traps: z
      .array(z.object({ id: z.string().min(1), weight: z.number().positive() }).strict())
      .min(1),
    /** 宝物の表（items.json の id＋個数の範囲＋重み） */
    treasure: z
      .array(
        z
          .object({
            item: z.string().min(1),
            weight: z.number().positive(),
            n: z.tuple([z.number().int().positive(), z.number().int().positive()]),
          })
          .strict(),
      )
      .min(1),
    /** 主（ボス）の候補（enemies.json の id＋重み。生成時に1つ選ばれ強化される） */
    bosses: z
      .array(z.object({ enemy: z.string().min(1), weight: z.number().positive() }).strict())
      .min(1),
    /** 主の称号の候補（「《洞窟の主》」のような冠。生成時に1つ選ばれる） */
    bossTitles: z.array(z.string().min(1)).min(1),
    /** ユニークモンスターの名の候補（世界に1体の主になるとき1つ選ばれる） */
    uniqueNames: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const worldFileSchema = z
  .object({
    version: z.literal(1),
    /** すべての町に共通の場所・住人・市場の素 */
    townBase: z
      .object({
        places: z.array(townPlaceSchema).min(1),
        npcs: z.array(npcTemplateSchema).min(1),
        market: townMarketSchema,
      })
      .strict(),
    /** 町の型（9種。docs/10 §3） */
    townTypes: z.array(townTypeSchema).min(9),
    /** 地域の型（野外14種＋特別な型） */
    areaTypes: z.array(areaTypeSchema).min(14),
    /** 地点の型 */
    spotKinds: z.array(spotKindSchema).min(1),
    /** 迷宮の罠の型 */
    trapKinds: z.array(trapKindSchema).min(1),
    /** 迷宮の型（G-03 の7種。docs/10 §6） */
    dungeonTypes: z.array(dungeonTypeSchema).min(7),
    /** 生成される住人の名の候補 */
    npcNames: z.array(z.string().min(1)).min(10),
    /** 生成される住人の口調（voices.json と同じ {name}/{deed} 語彙） */
    npcVoice: z
      .object({
        greet: z.array(z.string().min(1)).min(2),
        respect: z.array(z.string().min(1)).min(2),
      })
      .strict(),
    /** 生成される師匠の説明テンプレート（{town}/{skill}/{condition} 語彙） */
    mentorText: z.object({ desc: z.string().min(1), note: z.string().min(1) }).strict(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const townIds = new Set<string>();
    for (const t of file.townTypes) {
      if (townIds.has(t.id)) ctx.addIssue({ code: "custom", message: `町の型 id の重複: ${t.id}` });
      townIds.add(t.id);
    }
    const areaIds = new Set<string>();
    for (const a of file.areaTypes) {
      if (areaIds.has(a.id))
        ctx.addIssue({ code: "custom", message: `地域の型 id の重複: ${a.id}` });
      areaIds.add(a.id);
    }
    const spotIds = new Set<string>();
    for (const s of file.spotKinds) {
      if (spotIds.has(s.id))
        ctx.addIssue({ code: "custom", message: `地点の型 id の重複: ${s.id}` });
      spotIds.add(s.id);
    }
    const trapIds = new Set<string>();
    for (const t of file.trapKinds) {
      if (trapIds.has(t.id)) ctx.addIssue({ code: "custom", message: `罠の型 id の重複: ${t.id}` });
      trapIds.add(t.id);
    }
    const dgnIds = new Set<string>();
    for (const d of file.dungeonTypes) {
      if (dgnIds.has(d.id))
        ctx.addIssue({ code: "custom", message: `迷宮の型 id の重複: ${d.id}` });
      dgnIds.add(d.id);
      // 罠の参照は trapKinds にある
      for (const tr of d.traps) {
        if (!trapIds.has(tr.id)) {
          ctx.addIssue({ code: "custom", message: `${d.id}: 未知の罠の型 ${tr.id}` });
        }
      }
      // 宝物の個数は [下限, 上限] の順
      for (const tr of d.treasure) {
        if (tr.n[0] > tr.n[1]) {
          ctx.addIssue({
            code: "custom",
            message: `${d.id}: 宝物 ${tr.item} の個数が逆順 [${tr.n[0]},${tr.n[1]}]`,
          });
        }
      }
    }
    // 低い危険度の迷宮の型（danger<=2。始まりの町の輪でも出せる）が必ず1つはある
    if (!file.dungeonTypes.some((d) => d.danger <= 2)) {
      ctx.addIssue({
        code: "custom",
        message: "始まりの町の輪で出せる迷宮の型（danger<=2）がない",
      });
    }
    // 始まりの町の型が必ず1つはある（startWeight > 0 の型）
    if (!file.townTypes.some((t) => t.startWeight > 0)) {
      ctx.addIssue({ code: "custom", message: "始まりの町になれる型（startWeight>0）がない" });
    }
    // farm/abyss の特別型はそれぞれちょうど1つ
    const specials = file.areaTypes.filter((a) => a.special !== undefined).map((a) => a.special);
    for (const s of ["farm", "abyss"] as const) {
      if (specials.filter((x) => x === s).length !== 1) {
        ctx.addIssue({ code: "custom", message: `特別な地域型 "${s}" は1つだけ必要` });
      }
    }
    // 場所テンプレートの key の重複（基本セット内・型ごとの追加内）
    const baseKeys = new Set<string>();
    for (const p of file.townBase.places) {
      if (baseKeys.has(p.key)) {
        ctx.addIssue({ code: "custom", message: `基本場所 key の重複: ${p.key}` });
      }
      baseKeys.add(p.key);
    }
    for (const t of file.townTypes) {
      const keys = new Set<string>();
      for (const p of t.places ?? []) {
        if (keys.has(p.key)) {
          ctx.addIssue({
            code: "custom",
            message: `${t.id}: 追加場所 key の重複: ${p.key}`,
          });
        }
        keys.add(p.key);
      }
    }
    // 地点の型参照（spots[].kind は spotKinds にある）
    for (const a of file.areaTypes) {
      for (const s of a.spots ?? []) {
        if (!spotIds.has(s.kind)) {
          ctx.addIssue({
            code: "custom",
            message: `${a.id}: 未知の地点の型 ${s.kind}`,
          });
        }
      }
    }
    // 住人の居場所はその町の場所 key にある（基本 −omit ＋追加）
    for (const t of file.townTypes) {
      const omit = new Set(t.omit ?? []);
      const keys = new Set([
        ...file.townBase.places.filter((p) => !omit.has(p.key)).map((p) => p.key),
        ...(t.places ?? []).map((p) => p.key),
      ]);
      for (const n of [...file.townBase.npcs, ...(t.npcs ?? [])]) {
        if (!keys.has(n.place)) {
          ctx.addIssue({
            code: "custom",
            message: `${t.id}: 住人 ${n.id} の居場所 ${n.place} がない`,
          });
        }
      }
    }
  });

export type TownPlaceJson = z.infer<typeof townPlaceSchema>;
export type NpcTemplateJson = z.infer<typeof npcTemplateSchema>;
export type TownMarketJson = z.infer<typeof townMarketSchema>;
export type TownErrandJson = z.infer<typeof townErrandSchema>;
export type TownTypeJson = z.infer<typeof townTypeSchema>;
export type AreaTypeJson = z.infer<typeof areaTypeSchema>;
export type SpotKindJson = z.infer<typeof spotKindSchema>;
export type TrapKindJson = z.infer<typeof trapKindSchema>;
export type DungeonTypeJson = z.infer<typeof dungeonTypeSchema>;
export type WorldFile = z.infer<typeof worldFileSchema>;
