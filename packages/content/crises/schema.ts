import { z } from "zod";
import { condSchema } from "../src/conditions.schema.js";

/**
 * 危機の型のスキーマ（docs/08_world_crisis.md §3〜4、W-01）。
 * 危機の具体的な中身は hidden/crises/*.json に置き、オーナーは読まない
 * （07_story.md §5）。ここには構造だけを書き、構造は core/src/crisis の
 * CrisisTypeDef と対応する（JSON をそのまま定義オブジェクトとして読める形）。
 */

/** 備えの5分野（docs/08 §4）：力・技・縁・財・知 */
export const crisisFieldSchema = z.enum(["might", "craft", "bond", "wealth", "knowledge"]);
export type CrisisFieldJson = z.infer<typeof crisisFieldSchema>;

/**
 * 段階ごとの世界への影響（docs/08 §3）。影響はその段階の間だけ効き、
 * 段階が変わると前の段階のものは解ける（NPCの離散・死亡だけは元に戻らない）。
 * 各配列は省略可（＝その種類の影響はない）
 */
export const crisisStageEffectsSchema = z
  .object({
    /** この段階の間、立ち入れないエリア（enemies.json の area。段階が変われば解放される） */
    closeAreas: z.array(z.string().min(1)).default([]),
    /**
     * この段階の間、通行止めになる道（G-02、docs/10 §7「危機の影響を地図に
     * 出す」）。道の id（journeyIdOf —— 町id同士を . で繋いだもの、"ardi.bergen" や
     * 生成町の "t0.t3"）か道の種別（"highway"/"mountain"/"sea"）を書く。
     * 段階が変われば解放される
     */
    closeRoads: z.array(z.string().min(1)).default([]),
    /**
     * 物価：仕事の報酬への倍率（危機は脅威であると同時に機会。高騰も下落も書ける）。
     * kind 省略時は全種別に乗る。同一段階の複数エントリは掛け合わされる
     */
    price: z
      .array(
        z.object({ kind: z.string().min(1).optional(), factor: z.number().positive() }).strict(),
      )
      .default([]),
    /**
     * 敵の強さ：id（敵）か area（エリア）で対象を絞る（両方省略で全敵。両方書いた場合は両方が一致）。
     * hpFactor/powerFactor は戦闘の基礎値に乗り、challengeBonus は挑戦差（経験の難度）に加算される
     */
    enemy: z
      .array(
        z
          .object({
            id: z.string().min(1).optional(),
            area: z.string().min(1).optional(),
            hpFactor: z.number().positive().optional(),
            powerFactor: z.number().positive().optional(),
            challengeBonus: z.number().nonnegative().optional(),
          })
          .strict(),
      )
      .default([]),
    /**
     * NPCの離散・死亡（voices.json / lore/canon.json figures の id）。
     * "leave" は町を離れ、"die" は亡くなる。この段階に入った時点で記録され、元に戻らない
     */
    npc: z
      .array(z.object({ id: z.string().min(1), kind: z.enum(["leave", "die"]) }).strict())
      .default([]),
    /**
     * この段階の間だけ有効になる、危機の中でだけ出る依頼・素材・場所のタグ。
     * core の crisisFeatureActive で問い合わせる。実体（注文・素材・場所の定義）との接続は W-02
     */
    features: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type CrisisStageEffectsJson = z.infer<typeof crisisStageEffectsSchema>;

/** 段階（兆し→拡大→深刻…）。季節の変わり目ごとに seasons を消費して次へ進む */
export const crisisStageSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    /** この段階に滞在する季節数（1 = 変わり目ごとに次へ進む）。最終段は決着が来るまで続く */
    seasons: z.number().int().min(1),
    effects: crisisStageEffectsSchema,
  })
  .strict();
export type CrisisStageJson = z.infer<typeof crisisStageSchema>;

/**
 * 決着の場面（1〜3回。討伐の遠征、和平の会議、儀式、最後の防衛戦など）。
 * 筋書きの時期（atBoundary 番目の季節の変わり目）に、その時点の備えで成否を判定する。
 * いずれかが成功すれば解決。すべて失敗した場合、重い危機は滅び、通常の危機は苦戦の末に決着する
 */
export const crisisFinaleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/),
    name: z.string().min(1),
    /** 危機開始から数えた季節の変わり目の番号（1〜）に判定する */
    atBoundary: z.number().int().min(1),
    /** 判定に使う備えの分野（1〜2） */
    fields: z.array(crisisFieldSchema).min(1).max(2),
    /** 成功に必要な備えの合計（世界の勢力の備え＋主人公が寄与した分） */
    required: z.number().nonnegative(),
    /**
     * 成否判定の乱数幅：閾値を required ×(1±margin) の範囲で揺らす（乱数は控えめに。08 §4）。
     * 省略時 0＝乱数なし（備えが届けば必ず成功）
     */
    margin: z.number().min(0).max(0.5).default(0),
    /** 時期のずれ幅（季節。シードで −jitter〜+jitter だけずれる。省略時 0＝ずれない） */
    jitter: z.number().int().min(0).max(4).default(0),
    /**
     * この場面の前線の相手（enemies.json の id。W-03：関与が「担った」に届いた者の
     * 打診で、武の役目の勝負所として戦う敵。省略時は表示側が適当な相手を選ぶ）
     */
    ref: z.string().min(1).optional(),
  })
  .strict();
export type CrisisFinaleJson = z.infer<typeof crisisFinaleSchema>;

/**
 * 世界の勢力（備えを積む主体。王国・ギルド・ライバル・名もない人々）。
 * 勢力ごとの得意分野と速さは世界シードから決定論的に抽選される
 */
export const crisisFactionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/),
    name: z.string().min(1),
    /** 1季節あたりの備え速度（シードで min〜max の一様乱数になる） */
    speed: z
      .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
      .strict()
      .refine((s) => s.min <= s.max, { message: "speed.min <= speed.max が必要" }),
    /** 得意分野の個数（省略時は balance.crisis.strongFields） */
    strongFields: z.number().int().min(1).max(5).optional(),
    /**
     * 得意分野の抽選の重み（分野→重み。書いた分野から重み付きで選ばれる。
     * 書いていない分野は重み1。省略時は全分野一様）
     */
    aptitude: z.partialRecord(crisisFieldSchema, z.number().positive()).optional(),
  })
  .strict();
export type CrisisFactionJson = z.infer<typeof crisisFactionSchema>;

/**
 * 接点（docs/08 §5、W-02）：危機は日常に混ざる。
 * 「生き方の種類」ではなく、実際にしてきたこと（行動履歴・スキル・実績）への親和
 * （affinity）で選ばれ、既存の遊びに乗せて出る。乗せ先は kind で決まる：
 * order/supply/arbitration/study は仕事の注文（offer 必須）、
 * defense/escort は狩りの敵（ref に enemies.json の id が必須）。
 * 達成はフィールドの備えへの寄与になる。受けても受けなくてもよい
 */
export const crisisTouchpointSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/),
    /** 接点の語り分類（08 §5 の表に対応する分類） */
    kind: z.enum(["order", "supply", "defense", "escort", "arbitration", "study"]),
    /** 寄与する分野 */
    field: crisisFieldSchema,
    /** 出始める段階（0 始まりの段階番号） */
    fromStage: z.number().int().min(0).default(0),
    /** 出なくなる段階（省略時は終幕まで出続ける） */
    toStage: z.number().int().min(0).optional(),
    /** 戦いの接点の相手（enemies.json の id。defense/escort で必須） */
    ref: z.string().min(1).optional(),
    /** 提示条件（関係・持ち物・暦などの条件DSL。省略時は無条件） */
    require: condSchema.optional(),
    /**
     * 「実際にしてきたこと」への親和：条件DSL ごとの加重（提示の重みに合算される）。
     * 直近の行動履歴（within）・スキル値・カウンタ（実績）などを読む
     */
    affinity: z
      .array(z.object({ cond: condSchema, weight: z.number().positive() }).strict())
      .default([]),
    /** 仕事の注文に乗る品（order/supply/arbitration/study で必須。kind は skills.json の id） */
    offer: z
      .object({
        name: z.string().min(1),
        /** 対応スキルID（注文の系統。skills.json の id） */
        kind: z.string().min(1),
        targetQuality: z.number().min(0).max(100),
        rewardMoney: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((tp, ctx) => {
    const workKind = tp.kind !== "defense" && tp.kind !== "escort";
    if (workKind && tp.offer === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["offer"],
        message: `${tp.kind} の接点には offer（注文）が必要`,
      });
    }
    if (!workKind && tp.offer !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["offer"],
        message: `${tp.kind} の接点に offer は書けない（ref に敵IDを書く）`,
      });
    }
    if (!workKind && tp.ref === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ref"],
        message: `${tp.kind} の接点には ref（enemies.json の敵ID）が必要`,
      });
    }
    if (workKind && tp.ref !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ref"],
        message: `${tp.kind} の接点に ref は書けない（offer に注文を書く）`,
      });
    }
    if (tp.toStage !== undefined && tp.toStage < tp.fromStage) {
      ctx.addIssue({ code: "custom", path: ["toStage"], message: "toStage >= fromStage が必要" });
    }
  });
export type CrisisTouchpointJson = z.infer<typeof crisisTouchpointSchema>;

/** 語りの参照（新聞・噂・終幕の語りテンプレートへのキー。本文との接続は W-02/W-04） */
export const crisisNarrationSchema = z
  .object({
    /** 段階ID → 語り（噂・新聞の記事）テンプレートへの参照キー */
    stage: z.record(z.string(), z.string()).optional(),
    /** 結末の語り（真エンド）への参照キー */
    finale: z
      .object({ resolved: z.string().min(1).optional(), ruin: z.string().min(1).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type CrisisNarrationJson = z.infer<typeof crisisNarrationSchema>;

/**
 * シードで決める変数（docs/08 §3「筋書きもシードごとに違う」）。
 * 原因の所在・関わる場所・人物など、型の中でシードごとに変わるもの。
 * 世界作成時に key ごとに options から1つが選ばれ、語りの参照に差し込める
 */
export const crisisVariableSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    options: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type CrisisVariableJson = z.infer<typeof crisisVariableSchema>;

/** 危機の型（この世界の歴史の筋書きの型。1ファイルに1つ以上を定義する） */
export const crisisTypeSchema = z
  .object({
    id: z.string().regex(/^crisis\.[a-z0-9_.]+$/),
    name: z.string().min(1),
    /**
     * 抽選の重み（出現率）。プール全体で、重い危機が約15%になるよう配る（08 §4）
     */
    weight: z.number().positive(),
    /**
     * 重い危機か。true なら、決着の場面をすべて落としたとき世界が滅びる。
     * false ならすべて落としても苦戦の末に決着する（滅びない）
     */
    heavy: z.boolean().default(false),
    /** 備えを積む勢力（1以上） */
    factions: z.array(crisisFactionSchema).min(1),
    /** 段階の列（兆し→拡大→深刻…。季節の変わり目に順に進む） */
    stages: z.array(crisisStageSchema).min(1),
    /** 決着の場面（1〜3。atBoundary の昇順に並べる） */
    finales: z.array(crisisFinaleSchema).min(1).max(3),
    /** シードで決める変数（省略可） */
    variables: z.array(crisisVariableSchema).default([]),
    /** 接点（省略可。docs/08 §5、W-02：危機は日常に混ざる） */
    touchpoints: z.array(crisisTouchpointSchema).default([]),
    /** 語りの参照（省略可） */
    narration: crisisNarrationSchema.optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const groups = [
      ["stages", t.stages],
      ["finales", t.finales],
      ["factions", t.factions],
      ["touchpoints", t.touchpoints],
      ["variables", t.variables.map((v) => ({ id: v.key }))],
    ] as const;
    for (const [label, xs] of groups) {
      const seen = new Set<string>();
      xs.forEach((x, i) => {
        if (seen.has(x.id)) {
          ctx.addIssue({
            code: "custom",
            path: [label, i, "id"],
            message: `${label} の id が重複している: ${x.id}`,
          });
        }
        seen.add(x.id);
      });
    }
    for (let i = 1; i < t.finales.length; i++) {
      if (t.finales[i]!.atBoundary < t.finales[i - 1]!.atBoundary) {
        ctx.addIssue({
          code: "custom",
          path: ["finales", i, "atBoundary"],
          message: "finales は atBoundary の昇順に並べる",
        });
      }
    }
  });
export type CrisisTypeJson = z.infer<typeof crisisTypeSchema>;

/** 危機の型の定義ファイル（crises/sample.json・hidden/crises/*.json の形） */
export const crisesFileSchema = z
  .object({ crises: z.array(crisisTypeSchema).min(1) })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.crises.forEach((c, i) => {
      if (seen.has(c.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["crises", i, "id"],
          message: `crisis の id が重複している: ${c.id}`,
        });
      }
      seen.add(c.id);
    });
  });
export type CrisesFile = z.infer<typeof crisesFileSchema>;
