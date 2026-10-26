import { z } from "zod";

/**
 * balance.json のスキーマ。
 * ゲームの数値はすべて balance.json に置く（AGENTS.md 絶対ルール）。
 * フィールドを増やすときは、このスキーマも必ず更新する。
 */
export const balanceSchema = z
  .object({
    version: z.number().int().positive(),
    /** docs/03_world_systems.md §5、core/time の TimeConfig に対応 */
    time: z
      .object({
        actionsPerDay: z.number().int().positive(),
        timeOfDay: z.array(z.enum(["morning", "noon", "evening", "night"])).min(1),
        daysPerWeek: z.number().int().positive(),
        daysPerSeason: z.number().int().positive(),
        seasonsPerYear: z.number().int().positive(),
        moonCycleDays: z.number().int().positive(),
        moonPhaseWindowDays: z.number().int().nonnegative(),
        startAge: z.number().int().positive(),
      })
      .strict(),
    /** GameState 周りの保持上限など */
    state: z
      .object({
        actionLogMax: z.number().int().positive(),
      })
      .strict(),
    /** newGame の初期値 */
    player: z
      .object({
        initialPotential: z.number().positive(),
        initialStatValue: z.number().nonnegative(),
        /** 初期所持金（G） */
        initialMoney: z.number().nonnegative(),
        /** 出自あり新規ゲーム時の素質ばらつき範囲（02：80〜130%） */
        potentialInitMin: z.number().positive(),
        potentialInitMax: z.number().positive(),
      })
      .strict(),
    /** docs/02_growth_system.md §2。core/growth/gain.ts の GainConfig に対応 */
    gain: z
      .object({
        base: z.record(z.string(), z.number().nonnegative()),
        challengePoints: z
          .array(z.tuple([z.number(), z.number()]))
          .min(2)
          .refine(
            (pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]),
            "挑戦係数の制御点は Δ の昇順で",
          ),
        challengeTrainCap: z.number().positive(),
        noveltyK: z.number().nonnegative(),
        noveltyWindow: z.number().int().positive(),
        failMultiplier: z.number().positive(),
        modifierCap: z.number().positive(),
        diminishBase: z.number().positive(),
        diminishExponent: z.number().positive(),
        fatigueScale: z.number().positive(),
      })
      .strict(),
    /** docs/02_growth_system.md §3。core/growth/consolidate.ts の SleepConfig に対応 */
    sleep: z
      .object({
        nightlyCapPerSkill: z.number().positive(),
        /** 1晩の全スキル合計の定着上限 */
        nightlyCapTotal: z.number().positive(),
        carryoverRatio: z.number().min(0).max(1),
        innFactors: z
          .object({
            cheap: z.number().positive(),
            normal: z.number().positive(),
            good: z.number().positive(),
          })
          .strict(),
        dinnerFactors: z
          .object({
            withDinner: z.number().positive(),
            noDinner: z.number().positive(),
          })
          .strict(),
        qualityMin: z.number().positive(),
        qualityMax: z.number().positive(),
        potentialDecayPerPoint: z.number().min(0).max(1),
        /** 宿代（G）。各ランクの一泊の値段 */
        innCost: z
          .object({
            cheap: z.number().nonnegative(),
            normal: z.number().nonnegative(),
            good: z.number().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    /** docs/02_growth_system.md §5。core/growth/body.ts の BodyConfig に対応 */
    body: z
      .object({
        fatiguePerAction: z.record(z.string(), z.number().nonnegative()),
        fatigueDefaultPerAction: z.number().nonnegative(),
        fatigueRecover: z.number().positive(),
        statLoadPerAction: z.record(
          z.string(),
          z
            .object({
              strength: z.number().nonnegative().optional(),
              endurance: z.number().nonnegative().optional(),
              agility: z.number().nonnegative().optional(),
              dexterity: z.number().nonnegative().optional(),
              perception: z.number().nonnegative().optional(),
              spirit: z.number().nonnegative().optional(),
            })
            .strict(),
        ),
        statGainPerLoad: z.number().nonnegative(),
        overloadThreshold: z.number().nonnegative(),
        overworkStreakDays: z.number().int().positive(),
        overworkConsolidateFactor: z.number().min(0).max(1),
        restQuality: z.number().positive(),
        restPotentialRecover: z.number().nonnegative(),
        potentialMax: z.number().positive(),
      })
      .strict(),
    /**
     * docs/06_endgame.md §1、T-36：寿命・加齢。
     * core/growth/aging.ts の AgingConfig に対応（起床サプライズの文は cli.json 由来で、
     * rust.texts と同じく balance には含まれない）
     */
    aging: z
      .object({
        /** 年齢帯（age <= upToAge の最初の帯が適用される。昇順） */
        bands: z
          .array(
            z
              .object({
                upToAge: z.number().positive(),
                /** 基礎能力の定着係数（consolidateBody に乗る） */
                statFactor: z.number().positive(),
                /** スキルの定着係数（consolidateSleep に乗る） */
                skillFactor: z.number().positive(),
              })
              .strict(),
          )
          .min(1)
          .refine((b) => b.every((x, i) => i === 0 || x.upToAge > b[i - 1]!.upToAge), {
            message: "aging.bands は upToAge の昇順で",
          }),
        /** 開始年齢（time.startAge）からの寿命（年）。この年数を生きた朝に老衰死 */
        lifespanYears: z.number().positive(),
        /** 寿命経過（経過年/lifespanYears）がこの割合を超えると弱い兆候 */
        signWarnAt: z.number().min(0).max(1),
        /** この割合を超えると強い兆候 */
        signSevereAt: z.number().min(0).max(1),
        /** 強い兆候を繰り返す間隔（日） */
        signEveryDays: z.number().int().positive(),
      })
      .strict()
      .refine((a) => a.signWarnAt <= a.signSevereAt, {
        message: "aging.signWarnAt <= aging.signSevereAt が必要",
      }),
    /**
     * docs/06_endgame.md §2、T-39：継承。core/legacy の LegacyConfig に対応。
     * 数値インフレ防止のため係数は小さく上限を持つ
     */
    legacy: z
      .object({
        /** 前世の peak → 次周素質% の変換係数（例 0.1 = peak100 で +10） */
        potentialFactor: z.number().min(0),
        /** スキルごとの素質上乗せ上限（%） */
        potentialMax: z.number().nonnegative(),
        /** 「前世の記憶」として持てる称号の上限数 */
        rememberedMax: z.number().int().nonnegative(),
        /** 遺物が持つ gainVs 係数（例 1.05 = 同系統の経験+5%） */
        artifactGainFactor: z.number().min(1),
      })
      .strict(),
    /** docs/03 §3 作品台帳。core/ledger の LedgerConfig に対応 */
    ledger: z
      .object({
        basePricePerQuality: z.number().positive(),
        marketWindowDays: z.number().int().positive(),
        marketDecayPerWork: z.number().min(0).max(1),
        tierUpBonusPending: z.number().nonnegative(),
      })
      .strict(),
    /** docs/03 §4 戦闘。core/combat の CombatConfig に対応 */
    combat: z
      .object({
        baseHp: z.number().positive(),
        hpPerEndurance: z.number().nonnegative(),
        attackBase: z.number().nonnegative(),
        attackPerSwordplay: z.number().nonnegative(),
        attackPerStrength: z.number().nonnegative(),
        ctBase: z.number().positive(),
        ctPerAgility: z.number().nonnegative(),
        ctMin: z.number().positive(),
        defendFactor: z.number().min(0).max(1),
        fleeBase: z.number().min(0).max(1),
        fleePerAgility: z.number().nonnegative(),
        observeBonus: z.number().nonnegative(),
        preciseObserve: z.number().nonnegative(),
        deathPendingFactor: z.number().min(0).max(1),
      })
      .strict(),
    /** docs/03 §2 ミニゲーム。各エンジン・皮の係数 */
    minigame: z
      .object({
        /** 簡易判定：品質 = 直近中央値 × この係数（03 §2「80%」） */
        simpleQualityFactor: z.number().min(0).max(1),
        /** 簡易判定：経験はこの係数（03 §2「50%」） */
        simpleExpFactor: z.number().min(0).max(1),
        /** 簡易判定が参照する直近の同種作品数 */
        simpleHistorySize: z.number().int().positive(),
        smithing: z
          .object({
            beats: z.number().int().positive(),
            beatIntervalMs: z.number().positive(),
            windowBaseMs: z.number().positive(),
            windowPerSkillMs: z.number().nonnegative(),
            qualityBase: z.number().min(0).max(100),
            qualityScale: z.number().positive(),
            criticalFlag: z.string().min(1),
            failBelowScore: z.number().min(0).max(1),
            failFlag: z.string().min(1),
            unlocks: z
              .object({
                seeTemperatureAt: z.number().nonnegative(),
                seeOrderHintsAt: z.number().nonnegative(),
              })
              .strict(),
          })
          .strict(),
        /** 演奏（タイミングの皮）：拍子が速く拍数が多い */
        performance: z
          .object({
            beats: z.number().int().positive(),
            beatIntervalMs: z.number().positive(),
            windowBaseMs: z.number().positive(),
            windowPerSkillMs: z.number().nonnegative(),
            qualityBase: z.number().min(0).max(100),
            qualityScale: z.number().positive(),
            criticalFlag: z.string().min(1),
            failBelowScore: z.number().min(0).max(1),
            failFlag: z.string().min(1),
            unlocks: z
              .object({
                seeMeterAt: z.number().nonnegative(),
                seePhraseAt: z.number().nonnegative(),
              })
              .strict(),
          })
          .strict(),
        /** 釣り（タイミングの皮）：命中数が catchMinHits 未満なら逃す */
        fishing: z
          .object({
            beats: z.number().int().positive(),
            beatIntervalMs: z.number().positive(),
            windowBaseMs: z.number().positive(),
            windowPerSkillMs: z.number().nonnegative(),
            qualityBase: z.number().min(0).max(100),
            qualityScale: z.number().positive(),
            catchMinHits: z.number().int().nonnegative(),
            criticalFlag: z.string().min(1),
            escapeFlag: z.string().min(1),
          })
          .strict(),
        negotiation: z
          .object({
            topics: z
              .array(
                z
                  .object({
                    id: z.string().min(1),
                    name: z.string().min(1),
                    beats: z.string().min(1),
                  })
                  .strict(),
              )
              .min(2),
            handSizeBase: z.number().int().positive(),
            handSizePerSkill: z.number().nonnegative(),
            previewBase: z.number().int().nonnegative(),
            previewPerSkill: z.number().nonnegative(),
            counterFactor: z.number().positive(),
            counterBlockFactor: z.number().min(0).max(1),
            hp: z.number().positive(),
            deckSize: z.number().int().positive(),
            criticalFlag: z.string().min(1),
            failFlag: z.string().min(1),
          })
          .strict(),
        mining: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            oreCount: z.number().int().positive(),
            rockCount: z.number().int().nonnegative(),
            oreQuality: z.number().positive(),
            hintRadiusBase: z.number().nonnegative(),
            hintRadiusPerSkill: z.number().nonnegative(),
            criticalFlag: z.string().min(1),
            failFlag: z.string().min(1),
          })
          .strict(),
        /** 鑑定（盤面推理の皮）：贋作を掴むと品質が missPenaltyFactor 倍 */
        appraisal: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            oreCount: z.number().int().positive(),
            rockCount: z.number().int().nonnegative(),
            oreQuality: z.number().positive(),
            hintRadiusBase: z.number().nonnegative(),
            hintRadiusPerSkill: z.number().nonnegative(),
            missPenaltyFactor: z.number().min(0).max(1),
            criticalFlag: z.string().min(1),
            failFlag: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    /** docs/02_growth_system.md §4。core/growth/tailwind.ts の TailwindConfig に対応 */
    tailwind: z
      .object({
        tailwindFactor: z.number().min(1).max(2),
        headwindFactor: z.number().min(0.5).max(1),
        recentDays: z.number().int().min(1).max(14),
        headwindBiasK: z.number().min(0).max(10),
        tailwindBoostK: z.number().min(0).max(10),
        drawMin: z.number().int().min(1),
        drawMax: z.number().int().min(1),
      })
      .strict()
      .refine((t) => t.drawMin <= t.drawMax, { message: "drawMin <= drawMax が必要" }),
    /** docs/03 §1 立場×職業。人生目標の達成報酬の係数 */
    society: z
      .object({
        goalRewardFactor: z.number().positive().max(10),
      })
      .strict(),
    /** 街の日替わりイベント（03 §6。特別注文など） */
    town: z
      .object({
        /** その日に特別注文が出る確率 */
        specialOrderChance: z.number().min(0).max(1),
        /** 特別注文の経験係数 */
        specialOrderExpFactor: z.number().positive(),
        /** 特別注文の報酬倍率 */
        specialOrderRewardFactor: z.number().positive(),
        /** 特別注文の目標品質倍率 */
        specialOrderQualityFactor: z.number().positive(),
      })
      .strict(),
    /** 錆（02 §7）：未使用スキルの低下・床・再習得倍率・脳の容量 */
    rust: z
      .object({
        /** 未使用から錆が始まるまでの猶予日数 */
        graceDays: z.number().nonnegative(),
        /** 猶予超過後の1日あたり低下量 */
        ratePerDay: z.number().positive(),
        /** 下限（peak 比） */
        floorFactor: z.number().min(0).max(1),
        /** peak 未満の再習得倍率 */
        relearnFactor: z.number().min(1),
        /** 脳の容量（合計スキル値の閾値） */
        capacityThreshold: z.number().positive(),
        /** 容量超過時の猶予の下限係数 */
        capacityGraceMinFactor: z.number().min(0).max(1),
      })
      .strict(),
    /** 実時間の換算（sim のボット用。ゲーム進行には使わない） */
    sim: z
      .object({
        minutesPerAction: z.number().positive(),
        minutesPerSleep: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
