import { z } from "zod";
import { worldModsSchema } from "./world-mods.schema.js";

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
        /**
         * 合計上限にランク係数を掛ける集中度の下限（F-01、0〜1）。
         * その晩の未定着のうち最大の技能のシェアがこれ以上なら、
         * その技能のランク係数が nightlyCapTotal にも掛かる（集中した夜はよく定着する）
         */
        focusShare: z.number().min(0).max(1),
        /**
         * 滞留ドレイン率（02 §3「滞留が深いほど間口が開く」）。持ち越された
         * 未定着 × この率 × 睡眠の質 が、その技能・合計の定着上限の床になる
         */
        backlogDrainRatio: z.number().min(0).max(1),
        /**
         * 合計側のドレイン床の上限倍率（02 §3）。分散した大量滞留だけが
         * 得をしないよう、合計の床は 基礎合計上限×係数×この倍率 で頭打ち
         */
        backlogDrainMaxMult: z.number().positive(),
        /**
         * スキルのランク帯（docs/02 §1 のランク表）と定着上限倍率（F-01）。
         * at は value の下限（昇順・先頭 0）、capFactor はその帯の定着上限倍率。
         * 上限を超えた未定着経験は全量翌日に持ち越される（消失しない）
         */
        skillRanks: z
          .array(
            z
              .object({
                at: z.number().nonnegative(),
                capFactor: z.number().positive(),
              })
              .strict(),
          )
          .min(2)
          .refine((r) => r[0]!.at === 0 && r.every((x, i) => i === 0 || x.at > r[i - 1]!.at), {
            message: "sleep.skillRanks は先頭 at:0 の昇順で",
          }),
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
    /**
     * docs/06_endgame.md §1、T-48：子・弟子への継承延長（同じ世界で次代を継ぐ）。
     * core/heir の HeirConfig に対応。legacy より弱い引継ぎ：
     * 素質補正の小さい版だけを渡し、記憶称号・遺物は渡さない
     */
    heir: z
      .object({
        /** 前代の peak → 次代素質% の変換係数（legacy.potentialFactor より小さい値） */
        potentialFactor: z.number().min(0),
        /** スキルごとの素質上乗せ上限（%） */
        potentialMax: z.number().nonnegative(),
      })
      .strict(),
    /**
     * docs/06_endgame.md §2、X-5：失われた書物。core/lostbooks の LostBookConfig に対応。
     * 転生で別世界に生まれたとき、前世の代表技能が閾値以上ならその技能の
     * 「先達の手記」が次の世界の書店に並ぶ（flags["lostbook.<skillId>"] で表現）
     */
    lostBooks: z
      .object({
        /** 手記が現れる代表技能の閾値（chronicle の peakSkills.value がこの値以上） */
        skillThreshold: z.number().nonnegative(),
        /** 1周に現れる手記の最大数（peakSkills 上位から） */
        maxBooks: z.number().int().nonnegative(),
        /** 棚条件が読むフラグの接頭辞（flag = flagPrefix + スキルID） */
        flagPrefix: z.string().min(1),
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
        /** 武器技能1あたりの攻撃力（K-01。持ち替えた武器の技能が乗る） */
        attackPerWeaponSkill: z.number().nonnegative(),
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
        /**
         * F-04（03 §4）：命中・会心・揺らぎ・対応行動。
         * core/combat の CombatConfig に対応
         */
        /** 攻撃の命中率 = base + 武器技能×perWeaponSkill + (敏捷−敵敏捷)×perAgilityDiff */
        hitBase: z.number().min(0).max(1),
        hitPerWeaponSkill: z.number().nonnegative(),
        hitPerAgilityDiff: z.number().nonnegative(),
        hitMin: z.number().min(0).max(1),
        hitMax: z.number().min(0).max(1),
        /** ダメージの揺らぎ範囲（最終威力に掛ける一様乱数） */
        varianceMin: z.number().positive(),
        varianceMax: z.number().positive(),
        /** 会心率 = base + 武器技能×perWeaponSkill、倍率 critFactor */
        critBase: z.number().min(0).max(1),
        critPerWeaponSkill: z.number().nonnegative(),
        critFactor: z.number().min(1),
        /** 敵の痛恨率・倍率 */
        enemyCritBase: z.number().min(0).max(1),
        enemyCritFactor: z.number().min(1),
        /** 通常被弾の回避率 = base + 回避×perEvasion + (敏捷−敵敏捷)×perAgilityDiff */
        evadeBase: z.number().min(0).max(1),
        evadePerEvasion: z.number().nonnegative(),
        evadePerAgilityDiff: z.number().nonnegative(),
        evadeMax: z.number().min(0).max(1),
        /** 見切り中の回避への上乗せ */
        readEvadeBonus: z.number().nonnegative(),
        /** 防御中に大技を受け止めたときの被ダメージ倍率 */
        guardTelegraphFactor: z.number().min(0).max(1),
        /** 大技をいなしたあとの反撃倍率（防御 / 見切り） */
        counterFactor: z.number().min(1),
        counterFactorRead: z.number().min(1),
        /** 隙の持続（tick）と、いなした敵の次行動の遅れ（tick） */
        openingTicks: z.number().int().positive(),
        staggerTicks: z.number().int().nonnegative(),
        /**
         * docs/06 §3B、T-44：強化版ユニーク（個体）との再戦。
         * 同種を afterKills 体倒すと強個体が狩り対象に現れる
         */
        unique: z
          .object({
            /** 強個体が解禁される同種の討伐数 */
            afterKills: z.number().int().positive(),
            /** HP・攻撃力の強化倍率 */
            hpFactor: z.number().min(1),
            powerFactor: z.number().min(1),
            /** 挑戦差（gain）・敏捷の加算値 */
            challengeBonus: z.number().nonnegative(),
            agilityBonus: z.number().nonnegative(),
          })
          .strict(),
        /**
         * R-01：個体差。同じ種でも個体ごとに強さ・気質が揺らぐ
         * （遭遇ごとに世界シードから決定的に抽選。ユニークとは別系統）
         */
        individual: z
          .object({
            /** 強い個体・臆病な個体の出る確率 */
            strongChance: z.number().min(0).max(1),
            timidChance: z.number().min(0).max(1),
            /** 強い個体：HP・威力の倍率と挑戦差・敏捷の加算 */
            strongHpFactor: z.number().min(1),
            strongPowerFactor: z.number().min(1),
            strongChallengeBonus: z.number().nonnegative(),
            strongAgilityBonus: z.number().nonnegative(),
            /** 臆病な個体：威力が下がり・行動間隔が伸び・挑戦差が下がる */
            timidPowerFactor: z.number().min(0).max(1),
            timidIntervalFactor: z.number().min(1),
            timidChallengeBonus: z.number().max(0),
            /** 普通の個体にも掛かる小さなジッター（±の半幅） */
            hpJitter: z.number().min(0).max(1),
            powerJitter: z.number().min(0).max(1),
            agilityJitter: z.number().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    /**
     * 武技・資源・構成（K-02、docs/09 §1〜3、§5〜6）。
     * core/arts の ArtsConfig に対応
     */
    arts: z
      .object({
        /** 構成の枠数（戦闘技・パッシブ・持ち替え武器） */
        slots: z.number().int().positive(),
        passiveSlots: z.number().int().positive(),
        weaponSlots: z.number().int().positive(),
        /** 気力の上限 = kiBase + endurance × kiPerEndurance */
        kiBase: z.number().positive(),
        kiPerEndurance: z.number().nonnegative(),
        /** 戦闘中、経過tickごとに戻る気力 */
        kiRegenPerTick: z.number().nonnegative(),
        /** 魔力の上限 = manaBase + spirit × manaPerSpirit（M-01 で使う素枠） */
        manaBase: z.number().positive(),
        manaPerSpirit: z.number().nonnegative(),
        /** Lv n→n+1 の必要経験 = levelStep × n。Lv上限は maxLevel */
        levelStep: z.number().positive(),
        maxLevel: z.number().int().min(1),
        /** Lv1あがるごとの威力・状態付与率の伸び（相対） */
        levelPowerFactor: z.number().nonnegative(),
        levelStatusFactor: z.number().nonnegative(),
        /** 1回の使用の経験 = expBase × (1 + max(0, 挑戦差) × expChallengeFactor) */
        expBase: z.number().positive(),
        expChallengeFactor: z.number().nonnegative(),
        /** 部位破壊のしきい値（敵の最大HP × この割合を部位に蓄積） */
        partBreakShare: z.number().min(0).max(1),
        /** 胴・脚・腕・頭が壊れたときの効果の係数 */
        breakDamageFactor: z.number().min(1),
        breakAgilityFactor: z.number().min(0).max(1),
        breakMoveFactor: z.number().min(0).max(1),
        breakStatusFactor: z.number().min(1),
        /** 体勢崩し（stagger）中の被ダメージ倍率 */
        staggerFactor: z.number().min(1),
        /** 対応技の係数：受け流しの被ダメ・受け流し反撃・回避構え・鉄壁の被ダメ */
        parryFactor: z.number().min(0).max(1),
        parryCounterFactor: z.number().min(1),
        evadeArtBonus: z.number().nonnegative(),
        guardArtFactor: z.number().min(0).max(1),
        /** learn.share の既定値（技能の使用記録にタグが占める割合の下限） */
        styleShareMin: z.number().min(0).max(1),
      })
      .strict(),
    /**
     * 魔法（M-01、docs/09 §4〜5）。core/magic の MagicConfig に対応。
     * 適性の分布・詠唱・中断・呪文威力・属性相性・生活魔法・付与の係数
     */
    magic: z
      .object({
        /* 適性（seed×主体×属性の対称三角分布：mean ± spread。主人公もNPCも同じ分布） */
        aptitudeMean: z.number().min(0).max(1),
        aptitudeSpread: z.number().min(0).max(0.5),
        /** 適性 → 威力係数 = aptitudePowerBase + 適性 × aptitudePowerScale */
        aptitudePowerBase: z.number().nonnegative(),
        aptitudePowerScale: z.number().nonnegative(),
        /* 呪文威力 = (powerBase + 技能 × perSkill + 精神 × perSpirit) × def.power × Lv係数 × 適性係数 */
        powerBase: z.number().nonnegative(),
        powerPerSkill: z.number().nonnegative(),
        powerPerSpirit: z.number().nonnegative(),
        /* 詠唱：実効 tick = max(castMin, (cast − 技能 × castPerSkill) × (1 − castSpeed)) */
        castPerSkill: z.number().nonnegative(),
        castMin: z.number().int().positive(),
        /* 詠唱の中断：確率 = clamp(interruptMin..Max, interruptBase − 魔力操作 × interruptPerManaSkill) */
        interruptBase: z.number().min(0).max(1),
        interruptPerManaSkill: z.number().nonnegative(),
        interruptMin: z.number().min(0).max(1),
        interruptMax: z.number().min(0).max(1),
        /** 戦闘中、経過 tick ごとに戻る魔力 */
        manaRegenPerTick: z.number().nonnegative(),
        /** 属性の相性（09 §5。布石の状態 × 打ち手の属性/性質で発火） */
        interactions: z
          .array(
            z
              .object({
                id: z.string().min(1),
                /** 敵に掛かっている必要のある状態 */
                primer: z.enum([
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
                ]),
                /** 打ち手の照合キー（呪文の属性 or 打撃の性質） */
                strike: z.string().min(1),
                damage: z.number().positive(),
                status: z
                  .enum([
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
                  ])
                  .optional(),
                statusTicks: z.number().int().positive().optional(),
                statusPower: z.number().nonnegative().optional(),
                extend: z.number().int().positive().optional(),
                consume: z.boolean(),
              })
              .strict(),
          )
          .min(1),
        /** 生活魔法が効く仕事の種目（hook → 対象の仕事 kind 一覧） */
        lifeWorkKinds: z
          .array(
            z
              .object({ hook: z.string().min(1), kinds: z.array(z.string().min(1)).min(1) })
              .strict(),
          )
          .min(1),
        /** 付与（エンチャント。鍛冶＋火魔法が要件） */
        enchant: z
          .object({
            smithing: z.number().nonnegative(),
            fireMagic: z.number().nonnegative(),
            mana: z.number().nonnegative(),
            maxLevel: z.number().int().positive(),
            atkPerLevel: z.number().nonnegative(),
          })
          .strict(),
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
        /** 逆風の重み係数。追い風の定義数が増えても（K-01 で68件）固定ルーチンへの逆風が薄れないよう、母数の大きいプールを想定した上限 */
        headwindBiasK: z.number().min(0).max(30),
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
    /**
     * docs/06 §3C、T-45：運命の傾向。周の開始時の3択で、それぞれ世界修飾
     * （core/src/fate の WorldMods）を持つ。calm は中立＝空オブジェクト
     */
    tendency: z
      .object({
        calm: worldModsSchema,
        war: worldModsSchema,
        famine: worldModsSchema,
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
        /** 街への寄付の1口の額（X-9 領主ルート。1行動で納めるG） */
        donationAmount: z.number().positive(),
        /**
         * NPCの歳月の出来事が街の噂・街の声に残る日数（X-12。
         * 発火日からこの日数のあいだ噂が流れ、以後は年代記と新聞に残る）
         */
        npcRumorDays: z.number().int().min(1),
      })
      .strict(),
    /**
     * 移動（P-01、docs/03 §2）。街の中の移動は行動を消費しないが、
     * 門から街の外へ出る（街の外どうしの移動も同じ）は行動を消費する
     */
    travel: z
      .object({
        /** 街の外への移動1回が消費する行動数 */
        outsideCost: z.number().int().min(1),
      })
      .strict(),
    /**
     * 日々の営み（P-02「行動の種類を増やす」）。core/life の LifeConfig の
     * 係数部。表の中身（町・道・散策の出来事・採集・レシピ・市場・賭け・
     * 仲・掲示板）は life.json が持ち、ここには効き具合だけを置く
     */
    life: z
      .object({
        /** 食べた食事の眠りへの効き（眠りの質 += 食事の質 × この値） */
        mealSleepFactor: z.number().min(0).max(0.02),
        /** 祈った日の眠りの質への加算 */
        praySleepBonus: z.number().min(0).max(0.5),
        /** 野営（旅の道中の眠り）の質 */
        campQuality: z.number().positive(),
        /** 採集1回に引く品の数（採集表からの抽選回数） */
        gatherDraws: z.number().int().min(1).max(6),
        /** 掲示板の依頼を1日にこなせる数 */
        errandPerDay: z.number().int().min(1),
        /** 市場の日替わりの揺らぎの半幅（価格 ×(1±この値)） */
        marketJitter: z.number().min(0).max(0.5),
        /** 仲の値がこの値を超えると相手の挨拶が親しいものに変わる */
        bondRespectMin: z.number().nonnegative(),
        /** 仲の値の上限 */
        bondMax: z.number().positive(),
        /** 祈りの経験の挑戦差（prayer 技能に対する難度） */
        prayDifficulty: z.number().min(0).max(100),
        /** 賭け事の基礎勝率（gamble.win リンクの技能分が加算される） */
        gambleWinChance: z.number().min(0).max(1),
        /** 賭け事の経験の挑戦差（gambling 技能に対する難度） */
        gambleDifficulty: z.number().min(0).max(100),
        /** まかせ料理の出来の基準（実技ミニゲーム無しのときの出来の中央値） */
        cookQualityBase: z.number().min(0).max(100),
      })
      .strict(),
    /**
     * 天候（X-13、docs/03 §2「日替わりの要因は2つまで」の1枠）。
     * 空の種類・季節の重み・風景の行は weather.json が持ち、
     * ここには注文の報酬への日替わり係数だけを置く（core/weather の
     * WeatherConfig.orderPrice。天候は seed+day から導出するので状態を持たない）
     */
    weather: z
      .object({
        /**
         * 天候id → 仕事の kind → 報酬係数（雨の日は採掘系が渋い、など微変）。
         * kind "*" はその天候の全種別の既定値。未設定の組み合わせは 1
         */
        orderPrice: z.record(z.string(), z.record(z.string(), z.number().positive())),
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
    /**
     * docs/06_endgame.md §3B、T-43：無限深層ダンジョン。
     * core/abyss の AbyssConfig に対応。数値インフレ防止のため成長は線形で小さく保つ
     */
    abyss: z
      .object({
        /** 1層目の強化倍率（HP・技威力・挑戦差に乗る） */
        baseFactor: z.number().positive(),
        /** 層ごとの倍率成長（floor 層 = baseFactor + growthPerFloor × (floor − 1)） */
        growthPerFloor: z.number().nonnegative(),
        /** 敵の敏捷の層ごとの加算（逃走の抵抗） */
        agilityPerFloor: z.number().nonnegative(),
        /** 潜行リソース（灯り）：ラン全体で使えるプレイヤー行動数 */
        maxTurns: z.number().int().positive(),
        /** 層の敵プールの挑戦差しきい値（これ以下から抽選。層ごとに上がる） */
        poolBase: z.number().nonnegative(),
        poolGrowthPerFloor: z.number().nonnegative(),
      })
      .strict(),
    /**
     * docs/05 M4、T-47：ライバル・ランキング（簡易版）。
     * core/src/rivals の RivalsConfig に対応。ランキングは派生値なので
     * GameState・セーブには触れない（ライバルの素性は世界シードから引く）
     */
    rivals: z
      .object({
        /** ランキングに並ぶライバルの人数 */
        size: z.number().int().positive(),
        /** ライバルの基礎名声の範囲（世界シード由来の乱数で決まる） */
        scoreMin: z.number().nonnegative(),
        scoreMax: z.number().nonnegative(),
        /** ライバル1人あたりの日ごとの名声増分の上限（0〜この値がシードで決まる） */
        growthPerDay: z.number().nonnegative(),
        /** 自分の実績点：台帳の最高品質への重み */
        playerQualityWeight: z.number().nonnegative(),
        /** 自分の実績点：称号1つあたりの重み */
        playerTitleWeight: z.number().nonnegative(),
        /** 自分の実績点：討伐1体あたりの重み（kill.species.* の合計） */
        playerKillWeight: z.number().nonnegative(),
        /** 自分の実績点：深層の自己ベスト1層あたりの重み（abyss.best） */
        playerAbyssWeight: z.number().nonnegative(),
        /** 自分の実績点：勝負所の評判1点あたりの重み（occasion.renown。X-10） */
        playerRenownWeight: z.number().nonnegative(),
      })
      .strict()
      .refine((r) => r.scoreMin <= r.scoreMax, {
        message: "rivals.scoreMin <= rivals.scoreMax が必要",
      }),
    /**
     * docs/08_world_crisis.md §3〜4、W-01：世界の危機。
     * core/crisis の CrisisConfig に対応（危機の型・段階・決着の中身は crises/*.json が持ち、
     * ここには世界の備えの積み方の係数だけを置く）
     */
    crisis: z
      .object({
        /** 勢力ごとの得意分野の既定数（勢力側の strongFields 指定が優先） */
        strongFields: z.number().int().min(1).max(5),
        /** 得意分野でない分野への1季節あたりの備え係数（0〜1） */
        weakFieldFactor: z.number().min(0).max(1),
        /**
         * 接点（docs/08 §5、W-02）：危機が日常に混ざる量と、達成で備えに足す量。
         * 段階が進むほど多く出し、普通に暮らす範囲では世界全体の一部にとどまる量にする
         */
        touchpoints: z
          .object({
            /** 親和が全部外れても残る基底の重み（どの生き方にも接点があるための床） */
            weightBase: z.number().positive(),
            /** 1日に日常へ混ぜる接点の数（段階 index → 件数。段階が進むほど多く。0 は出さない） */
            offersPerStage: z.array(z.number().int().min(0)).min(1),
            /** 接点1回の達成で備えに足す量（乗せ先ごと） */
            contribution: z
              .object({
                work: z.number().nonnegative(),
                combat: z.number().nonnegative(),
              })
              .strict(),
          })
          .strict(),
        /**
         * 関与（docs/08 §6、W-03）：段階の閾値・重み・打診/起こし/ライバルの係数。
         * 名・二つ名・立場の順・頂点ルート定義・ライバル数は content から注入するので
         * ここには係数だけを置く
         */
        involvement: z
          .object({
            /** 段階2・3・4 の閾値（昇順3つ） */
            stageThresholds: z.array(z.number().nonnegative()).length(3),
            /** 関与スコアの各項の重み */
            weights: z
              .object({
                /** 危機の接点の達成1件あたり */
                tpDone: z.number().nonnegative(),
                /** 世界の備えへの寄与1あたり */
                heroPrep: z.number().nonnegative(),
                /** 名声（自実績点）1あたり */
                renown: z.number().nonnegative(),
                /** 立場の段1あたり */
                standing: z.number().nonnegative(),
                /** 最高スキル値1あたり */
                skill: z.number().nonnegative(),
                /** 頂点ルートの達成段数1あたり（近道。必須ではない） */
                pinnacleStage: z.number().nonnegative(),
                /** 完走した頂点ルート1本あたり */
                pinnacleTop: z.number().nonnegative(),
              })
              .strict(),
            /** 段階2から接点の日ごとの提示に足す件数（「注文や依頼が増える」） */
            supporterExtraOffers: z.number().int().min(0),
            /** 打診の勝負所で最高の働き（score=1）をしたとき備えに足す量 */
            attemptBonus: z.number().nonnegative(),
            /** 自分で起こす決着：最高スキル値が備えに乗る重み */
            leadSkillWeight: z.number().nonnegative(),
            /** 自分で起こす決着：名声が備えに乗る重み */
            leadRenownWeight: z.number().nonnegative(),
            /** 一点に絞った起こし方の required への係数（1未満＝やり方を選ぶと届きやすい） */
            leadFocusFactor: z.number().positive().max(1),
            /** 上位3技能の差がこの値以内なら「まとめ役」 */
            coordinatorSpread: z.number().nonnegative(),
            /** 役割 → 属するスキルID の表 */
            roleSkills: z
              .object({
                vanguard: z.array(z.string().min(1)),
                negotiator: z.array(z.string().min(1)),
                artisan: z.array(z.string().min(1)),
              })
              .strict(),
            /** ライバルの関与の係数（顔ぶれは rivals.json と balance.rivals.size から注入） */
            rivals: z
              .object({
                growthPerBoundary: z
                  .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
                  .strict()
                  .refine((g) => g.min <= g.max, {
                    message: "growthPerBoundary.min <= max が必要",
                  }),
                heroGrowthPerBoundary: z
                  .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
                  .strict()
                  .refine((g) => g.min <= g.max, {
                    message: "heroGrowthPerBoundary.min <= max が必要",
                  }),
                /** 段階4のライバルが決着の判定に足す備え（1人あたり） */
                contribution: z.number().nonnegative(),
                /** 段階4のライバルが最も早い未決着を早められる幅（季節の変わり目数） */
                hastenWindow: z.number().int().min(0),
              })
              .strict(),
          })
          .strict()
          .optional()
          .refine((i) => i === undefined || i.stageThresholds[0]! <= i.stageThresholds[1]!, {
            message: "stageThresholds は昇順に並べる",
          })
          .refine((i) => i === undefined || i.stageThresholds[1]! <= i.stageThresholds[2]!, {
            message: "stageThresholds は昇順に並べる",
          }),
      })
      .strict(),
    /**
     * 勝負所の行事（X-10、docs/03 §2「勝負所でミニゲームが出る」）。
     * core/occasions の OccasionsConfig に対応。行事の中身（条件・器・勝敗の効果）は
     * occasions.json が持ち、ここには届く頻度と間隔・勝敗の目安の係数だけを置く
     */
    occasions: z
      .object({
        /** 1日に届く行事の上限（docs/03 §2「1日に1〜2回まで」） */
        offersPerDay: z.number().int().min(1).max(4),
        /** 行事が届く日の基本確率（届かない日もある ―― 日常は作業にならない） */
        offerChance: z.number().min(0).max(1),
        /** 2件目が届く確率（offersPerDay >= 2 のときだけ振られる） */
        secondChance: z.number().min(0).max(1),
        /** 行事が再び届くまでの既定間隔（日。occasions.json 側の cooldownDays が優先） */
        cooldownDays: z.number().int().nonnegative(),
        /** 同じ種類の行事が続かない既定の間隔（日） */
        kindGapDays: z.number().int().nonnegative(),
        /** 決闘（戦闘の器）で「勝った」とみなす出来の閾値（0〜1） */
        combatWinScore: z.number().min(0).max(1),
        /** 決闘から逃げたときの出来（呼び出し側が score に換算する目安。勝ちではない） */
        combatFledScore: z.number().min(0).max(1),
      })
      .strict(),
    /**
     * 日々の出来事（F-05、docs/devin_tasks/F-05_daily_events.md）。
     * core/incidents の IncidentsConfig に対応。出来事の中身（条件・話し手・
     * 選択肢と結果）は incidents.json が持ち、ここには届く頻度と間隔だけを置く
     */
    incidents: z
      .object({
        /** 1日に起きる出来事の上限（F-05「1日に0〜2回」） */
        perDay: z.number().int().min(1).max(3),
        /** 出来事が起きる日の基本確率（起きない日もある ―― 日常は作業にならない） */
        chance: z.number().min(0).max(1),
        /** 2件目が起きる確率（perDay >= 2 のときだけ振られる） */
        secondChance: z.number().min(0).max(1),
        /** 出来事が再び届くまでの既定間隔（日。incidents.json 側の cooldownDays が優先） */
        cooldownDays: z.number().int().nonnegative(),
        /** 同じ種類の出来事が続かない既定の間隔（日） */
        kindGapDays: z.number().int().nonnegative(),
        /** 出来事の起きない日がこの日数続いたら、その日は確実に起きる（F-05「3日に1回以上」） */
        pityGapDays: z.number().int().positive(),
      })
      .strict(),
    /**
     * R-01：リアルな揺らぎ（docs/devin_tasks/R-01_randomness.md）。
     * 経験・仕事・市場・人・体調の決定的な揺らぎ。core/variance の
     * VarianceConfig に対応（起床ログの文面 texts は cli.json から注入する）。
     * 分布は誰に対しても同じで期待値1のノイズ。技量が高いほど安定する
     */
    variance: z
      .object({
        /** 経験の揺らぎ：技量0での半幅 spread が skillDamp 係数で縮む */
        gain: z
          .object({
            /** 変動の半幅（技量0。実際の半幅は spread*(1-skill/100)^skillDampK） */
            spread: z.number().min(0).max(1),
            /** 技量で半幅が縮む指数 */
            skillDampK: z.number().positive(),
            /** 「妙に冴えている」日の確率と経験倍率 */
            insightChance: z.number().min(0).max(1),
            insightFactor: z.number().min(1),
          })
          .strict(),
        /** 仕事・製作の揺らぎ：会心作/失敗作・素材の質・客の機嫌 */
        work: z
          .object({
            /** 会心作・失敗作の確率の上限（技量 damp が掛かる） */
            critChance: z.number().min(0).max(1),
            failChance: z.number().min(0).max(1),
            /** 確率側の技量 damp の指数 */
            skillDampK: z.number().positive(),
            /** 品質の倍率 */
            critFactor: z.number().min(1),
            failFactor: z.number().min(0).max(1),
            /** 作品に付く旗（結果行に出る） */
            critFlag: z.string().min(1),
            failFlag: z.string().min(1),
            /** 素材の質の揺らぎの半幅（日×種目で決まる） */
            materialSpread: z.number().min(0).max(1),
            /** 客の機嫌の確率と係数 */
            moodGoodChance: z.number().min(0).max(1),
            moodBadChance: z.number().min(0).max(1),
            moodGoodFactor: z.number().min(1),
            moodBadFactor: z.number().min(0).max(1),
          })
          .strict(),
        /** 市場の相場：日次ジッターと季節波 */
        market: z
          .object({
            /** 日次の相場の揺らぎの半幅（日×種目） */
            dailySpread: z.number().min(0).max(1),
            /** 季節波の振幅（種目ごとに旬の位相が決まる） */
            seasonalAmp: z.number().min(0).max(1),
          })
          .strict(),
        /** 人の揺らぎ：街にいない日 */
        npc: z
          .object({
            /** NPC がその日街にいない確率（師匠もこの抽選を受ける） */
            awayChance: z.number().min(0).max(1),
          })
          .strict(),
        /** 体調の揺らぎ：朝の調子が睡眠の質・疲労で傾く */
        condition: z
          .object({
            /** 好調・不調になる基準確率（睡眠の質・疲労で重みが傾く） */
            goodChance: z.number().min(0).max(1),
            poorChance: z.number().min(0).max(1),
            /** 体調が定着の質に掛かる係数 */
            goodFactor: z.number().min(1),
            poorFactor: z.number().min(0).max(1),
          })
          .strict(),
      })
      .strict(),
    /** 実時間の換算（sim のボット用。ゲーム進行には使わない） */
    sim: z
      .object({
        minutesPerAction: z.number().positive(),
        minutesPerSleep: z.number().nonnegative(),
      })
      .strict(),
    /**
     * 技能の効果の結線（K-01、core/links の SkillLinks に対応）。
     * フック名 → {cap, skills{技能id→係数}}。
     * 係数系フック（combat.attack 等）：Σ(技能値×係数) を cap で頭打ちして効果に乗せる。
     * 定数系フック（*.gain・beast.exp）：skills 表の値そのものが行動時の経験になる
     */
    links: z
      .record(
        z.string(),
        z
          .object({
            cap: z.number().nonnegative(),
            skills: z.record(z.string(), z.number().nonnegative()),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type Balance = z.infer<typeof balanceSchema>;
