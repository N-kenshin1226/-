import { z } from "zod";

/** text/cli.json — CLI版の表示文テンプレート。{name} の {…} は描画側で置換する */
export const cliTextSchema = z
  .object({
    version: z.number().int(),
    display: z
      .object({
        innNames: z.object({ cheap: z.string(), normal: z.string(), good: z.string() }).strict(),
        /** rest（家で休む）の起床ログに出す場所名 */
        homeName: z.string(),
        dinnerNames: z.object({ with: z.string(), without: z.string() }).strict(),
        seasonNames: z.array(z.string()).length(4),
        weekdayNames: z.array(z.string()).length(7),
        timeOfDayNames: z
          .object({ morning: z.string(), noon: z.string(), evening: z.string(), night: z.string() })
          .strict(),
        /** 月齢の相（time/moon の相）→ 表示名（隠し要素のヒントなどに差し込む。X-11） */
        moonNames: z
          .object({ new: z.string(), waxing: z.string(), full: z.string(), waning: z.string() })
          .strict(),
        statNames: z.record(z.string(), z.string()),
        /**
         * スキルのランク帯の表示名（docs/02 §1 のランク表。F-01）。
         * balance.sleep.skillRanks の添字と対応する（0=未経験 …）
         */
        skillRankNames: z.array(z.string().min(1)).min(1),
        /** 狩りの行き先（enemies.json の area）→ 表示名 */
        huntAreas: z.record(z.string(), z.string()),
        /** 人生の終わり方（chronicle の cause）→ 表示名 */
        causeNames: z.record(z.string(), z.string()),
        /** 運命の傾向（T-45。balance.tendency のキー）→ 表示名 */
        tendencyNames: z.record(z.string(), z.string()),
        /** 運命の傾向 → 選択肢の1行説明 */
        tendencyDescs: z.record(z.string(), z.string()),
        /** 次代の立ち位置（heir の kind）→ 表示名 */
        heirKindNames: z.record(z.string(), z.string()),
        /** 睡眠の質 → 表示語。q < upTo の最初の帯に入る */
        qualityBands: z.array(z.object({ upTo: z.number(), label: z.string() }).strict()).min(1),
        /** 世界の備えの分野（crisisFieldSchema の5分野）→ 表示名（W-02。接点の寄与の行に出す） */
        crisisFieldNames: z.record(z.string(), z.string()),
        /** 決着の場面での役割（W-03。vanguard/negotiator/artisan/coordinator）→ 表示名 */
        crisisRoleNames: z.record(z.string(), z.string()),
        /** 危機への関与の段階（W-03。1見届けた/2支えた/3担った/4率いた）→ 表示名 */
        crisisStageNames: z.record(z.string(), z.string()),
        /** 勝負所の結果（X-10。win/loss → 記録行に差し込む表示語） */
        occasionResultNames: z.record(z.string(), z.string()),
        /**
         * NPCの歳月の退場語（X-12。記録行の kind → 表示語。retire 引退した /
         * depart・leave 街を離れた / die 亡くなった）
         */
        npcGoneNames: z.record(z.string(), z.string()),
      })
      .strict(),
    text: z
      .object({
        playerName: z.string(),
        banner: z.string(),
        intro: z.string(),
        saveFound: z.string(),
        choiceResume: z.string(),
        choiceNew: z.string(),
        saveBroken: z.string(),
        originPick: z.string(),
        originLine: z.string(),
        originChosen: z.string(),
        menuHeader: z.string(),
        menuWinds: z.string(),
        menuNoWind: z.string(),
        menuActionsLeft: z.string(),
        menuActions: z.string(),
        orderPick: z.string(),
        orderLine: z.string(),
        workModePrompt: z.string(),
        workStart: z.string(),
        workBeat: z.string(),
        workSimple: z.string(),
        workResult: z.string(),
        workResultTier: z.string(),
        miningStart: z.string(),
        miningPrompt: z.string(),
        miningOre: z.string(),
        miningHint: z.string(),
        miningRock: z.string(),
        miningDone: z.string(),
        negoStart: z.string(),
        negoHand: z.string(),
        negoPreview: z.string(),
        negoHp: z.string(),
        negoPrompt: z.string(),
        negoWon: z.string(),
        negoLost: z.string(),
        /** 演奏（タイミングの皮）の開始・拍・決定ボタン・結果の一行 */
        performanceStart: z.string(),
        performanceBeat: z.string(),
        performancePress: z.string(),
        performanceDetail: z.string(),
        /** 釣り（タイミングの皮）同 */
        fishingStart: z.string(),
        fishingBeat: z.string(),
        fishingPress: z.string(),
        fishingDetail: z.string(),
        /** 鑑定（盤面推理の皮）の開始・入力・各行・結果の一行 */
        appraisalStart: z.string(),
        appraisalPrompt: z.string(),
        appraisalFound: z.string(),
        appraisalHint: z.string(),
        appraisalMiss: z.string(),
        appraisalDone: z.string(),
        appraisalDetail: z.string(),
        huntPick: z.string(),
        /** エリア別の見出し行（{name} に表示名） */
        huntArea: z.string(),
        huntLine: z.string(),
        /** 強個体の表示名（T-44。{name} は素の敵名） */
        uniqueName: z.string(),
        combatStart: z.string(),
        combatStatus: z.string(),
        combatPrompt: z.string(),
        combatWon: z.string(),
        /** 強個体討伐の知らせ（T-44。{name} は素の敵名） */
        uniqueDefeated: z.string(),
        combatLost: z.string(),
        /** 老衰死（T-36。{age} にその朝の年齢） */
        deathByAge: z.string(),
        combatFled: z.string(),
        combatGain: z.string(),
        /** 深層ダンジョン（T-43。{light}/{floor}/{depth}/{best}/{name} を差し込む） */
        abyssStart: z.string(),
        abyssFloor: z.string(),
        abyssLight: z.string(),
        abyssCleared: z.string(),
        abyssDescendPrompt: z.string(),
        abyssLightOut: z.string(),
        abyssRetreat: z.string(),
        abyssResult: z.string(),
        abyssBest: z.string(),
        kehai: z.string(),
        titleSuppressed: z.string(),
        menuSleepOnly: z.string(),
        societyHeader: z.string(),
        societyNoOffers: z.string(),
        societyOfferLine: z.string(),
        societyGoalsHeader: z.string(),
        societyGoalLine: z.string(),
        societyNoGoal: z.string(),
        societyAccepted: z.string(),
        societyDeclared: z.string(),
        /** 頂点ルート一覧（X-9。見えているルートだけ出す。{done}/{total} は段の進行） */
        societyPinnacleHeader: z.string(),
        societyPinnacleLine: z.string(),
        /** 未発見の隠しルートがあるときの匂わせ行（ルート名は出さない） */
        societyPinnacleHidden: z.string(),
        /** 街への寄付（X-9 領主ルート。{amount}G・1行動。Line は番号付き一覧用） */
        societyDonateLine: z.string(),
        societyDonateAction: z.string(),
        societyDonated: z.string(),
        offerReceived: z.string(),
        goalAchieved: z.string(),
        loreListHeader: z.string(),
        loreLine: z.string(),
        loreNone: z.string(),
        loreRead: z.string(),
        factLearned: z.string(),
        loreConnection: z.string(),
        mustSleep: z.string(),
        promptChoice: z.string(),
        skillPick: z.string(),
        skillLine: z.string(),
        difficultyPrompt: z.string(),
        trainResult: z.string(),
        restDone: z.string(),
        innPick: z.string(),
        innLine: z.string(),
        innTooPoor: z.string(),
        specialOrder: z.string(),
        recordsHeader: z.string(),
        recordsLedger: z.string(),
        recordsLedgerLine: z.string(),
        recordsLedgerEmpty: z.string(),
        recordsTitles: z.string(),
        recordsLore: z.string(),
        /** 討伐図鑑（T-44。{name}/{kills}/{unique} を差し込む。unique は kill.unique.<id> の行） */
        recordsHunt: z.string(),
        recordsHuntLine: z.string(),
        recordsHuntUnique: z.string(),
        /** 深層の自己ベスト（T-43。{best}/{runs} を差し込む） */
        recordsAbyss: z.string(),
        recordsAbyssNone: z.string(),
        /** ライバル・ランキング（T-47。{rank}/{name}/{epithet}/{score}/{you} を差し込む） */
        recordsRivals: z.string(),
        recordsRivalLine: z.string(),
        recordsRivalEpithet: z.string(),
        recordsRivalYou: z.string(),
        recordsRivalNote: z.string(),
        /** 危機で閉鎖されたエリアの行（W-01。{name} にエリア表示名） */
        huntAreaClosed: z.string(),
        /**
         * 世界の出来事（W-01、docs/08 §3）：危機の記録欄の見出し・空行・各記録行
         * （{day}/{text} を差し込む）
         */
        recordsCrisis: z.string(),
        recordsCrisisNone: z.string(),
        recordsCrisisLine: z.string(),
        /** 出来事ログの種別ごとの文（キーは CrisisLogEntry.kind。{name} を差し込める） */
        crisisLog: z.record(z.string(), z.string()),
        /** 危機の接点の印（W-02、docs/08 §5。接点の注文・相手の名前の前に付ける） */
        touchpointTag: z.string(),
        /** 接点を果たした行（W-02。{field} に備えの分野の表示名） */
        crisisTouchpointDone: z.string(),
        /**
         * 決着の場面（W-03、docs/08 §6）：メニューの追加項目・画面の見出しと各行・
         * 状態語・選択肢・起こし方の問い・戻る。{name}/{status}/{seasons}/{role} を差し込む
         */
        crisisMenuItem: z.string(),
        crisisSceneHeader: z.string(),
        crisisSceneLine: z.string(),
        crisisStatusOffered: z.string(),
        crisisStatusJoined: z.string(),
        crisisStatusDone: z.string(),
        crisisStatusWaiting: z.string(),
        crisisSceneRole: z.string(),
        crisisSceneStage: z.string(),
        crisisJoinOption: z.string(),
        crisisAttemptOption: z.string(),
        crisisLeadOption: z.string(),
        crisisLeadFieldPrompt: z.string(),
        crisisLeadFieldAll: z.string(),
        crisisLeadConfirm: z.string(),
        crisisBack: z.string(),
        /** 打診が届いた行（W-03。通知Aランク相当。{name} に場面名） */
        crisisFinaleOffered: z.string(),
        /** 打診に応えた行（W-03。{name} に場面名） */
        crisisFinaleJoined: z.string(),
        /** 勝負所を果たした行（W-03。{name} に場面名） */
        crisisFinaleAttempt: z.string(),
        /**
         * 勝負所の行事（X-10、docs/03 §2）：メニューの追加項目・画面の見出しと各行・
         * 状態語・選択肢・戻る。{name}/{status}/{speaker}/{line} を差し込む
         */
        occasionMenuItem: z.string(),
        occasionSceneHeader: z.string(),
        occasionSceneLine: z.string(),
        occasionStatusOffered: z.string(),
        occasionStatusAccepted: z.string(),
        occasionStatusDone: z.string(),
        occasionSpeakerLine: z.string(),
        occasionAcceptOption: z.string(),
        occasionAttemptOption: z.string(),
        occasionBack: z.string(),
        /** 打診が届いた行（{name} に行事名） */
        occasionOffered: z.string(),
        /** 打診に応えた行 */
        occasionJoined: z.string(),
        /** 勝負所の結果の行（勝った／敗れた。{name} に行事名） */
        occasionWon: z.string(),
        occasionLost: z.string(),
        /** 街の記録の勝負所欄（見出し・空行・各記録行。{day}/{name}/{result} を差し込む） */
        recordsOccasions: z.string(),
        recordsOccasionsNone: z.string(),
        recordsOccasionsLine: z.string(),
        /** 年代記（T-38）：周回をまたぐ人生の一覧。開始時の件数・見出し・各頁の行・追記の告知 */
        chronicleLives: z.string(),
        chronicleHeader: z.string(),
        chronicleEmpty: z.string(),
        chronicleLine: z.string(),
        chronicleRole: z.string(),
        chronicleWorks: z.string(),
        /** 頂点ルートの記録（T-41。{pinnacles} はルート名を繋いだもの） */
        chroniclePinnacle: z.string(),
        chronicleRecorded: z.string(),
        /** 引退・転生（T-40）：確認・継承の選択（記憶の称号／遺物）・新しい生の告知 */
        retireConfirm: z.string(),
        resetConfirm: z.string(),
        retireCancelled: z.string(),
        legacyHeader: z.string(),
        legacyTitlesPrompt: z.string(),
        legacyTitleLine: z.string(),
        legacyNoTitles: z.string(),
        legacyArtifactPrompt: z.string(),
        legacyArtifactLine: z.string(),
        legacyNoArtifact: z.string(),
        rebirthStart: z.string(),
        rebirthEpithet: z.string(),
        rebirthMemory: z.string(),
        rebirthArtifact: z.string(),
        rebirthPotential: z.string(),
        /** 失われた書物（X-5。{names} は手記が現れた技能名を繋いだもの） */
        rebirthLostBooks: z.string(),
        rebirthOriginPrompt: z.string(),
        rebirthBorn: z.string(),
        /** 継承延長（T-48）：生の継ぎ方の選択・次代の開始・刻まない告知・弱い素質補正 */
        heirWayPick: z.string(),
        heirWayRebirth: z.string(),
        heirWayHeir: z.string(),
        heirKindLine: z.string(),
        heirStart: z.string(),
        heirNoChronicle: z.string(),
        heirPotential: z.string(),
        /** 運命の傾向・誓約の選択（T-45/T-46）：開始時の3択と難度修飾子の複数選択 */
        tendencyPick: z.string(),
        tendencyLine: z.string(),
        tendencyChosen: z.string(),
        vowPick: z.string(),
        vowLine: z.string(),
        vowChosen: z.string(),
        moneyPaid: z.string(),
        /** 書店（T-26）：店頭の見出し・一覧行・購入/読了/効果の各行 */
        bookShopHeader: z.string(),
        bookPick: z.string(),
        bookLine: z.string(),
        bookBought: z.string(),
        bookTooPoor: z.string(),
        bookRead: z.string(),
        bookReadDone: z.string(),
        bookRecovered: z.string(),
        bookEffectDays: z.string(),
        bookAlreadyRead: z.string(),
        bookFlag: z.string(),
        /** 師匠（T-27）：一覧・入門・稽古・別れの各行 */
        mentorHeaderCurrent: z.string(),
        mentorHeaderNone: z.string(),
        mentorListLine: z.string(),
        mentorDescLine: z.string(),
        mentorMarkOk: z.string(),
        mentorMarkNg: z.string(),
        /**
         * 師匠がNPCの歳月・危機で街に居ないときの印（X-12。
         * {reason} に display.npcGoneNames の語が入る）
         */
        mentorGone: z.string(),
        mentorMenuTrain: z.string(),
        mentorMenuLeave: z.string(),
        mentorMenuBack: z.string(),
        mentorApprenticed: z.string(),
        mentorLocked: z.string(),
        mentorLeft: z.string(),
        mentorTrainResult: z.string(),
        mentorSecret: z.string(),
        dinnerPrompt: z.string(),
        overworkBecame: z.string(),
        wake: z
          .object({
            header: z.string(),
            footer: z.string(),
            qualityLine: z.string(),
            skillLine: z.string(),
            /** 上限で定着しきれず翌日へ持ち越された分の行（F-01。{name}/{amount}） */
            carryoverLine: z.string(),
            /** ランク帯を越えた節目の行（F-01。{name}/{rank} —— rank は skillRankNames で解決済みの名） */
            rankUp: z.string(),
            statJoiner: z.string(),
            windsLine: z.string(),
            windsNone: z.string(),
            /** 天候（X-13）：今朝の空の1行。{weather}=空の表示名・{line}=風景の行 */
            weatherLine: z.string(),
            noChange: z.string(),
            restDayLine: z.string(),
            /** 錆びたスキルがあった朝の行（{name}/{loss}） */
            rusted: z.string(),
            /** peak未満の再習得が速い行（{name}） */
            relearning: z.string(),
            /** 老いの兆候：弱い方（T-36。寿命経過が signWarnAt 超えの朝） */
            agingWarn: z.string(),
            /** 老いの兆候：強い方（signSevereAt 超え。間隔を置いて繰り返す） */
            agingSevere: z.string(),
            saved: z.string(),
          })
          .strict(),
        titleGainedFallback: z.string(),
        skillUnlocked: z.string(),
        /** 隠し要素の発見（X-11、通知Bランク。{name} は発見名） */
        discoveryFound: z.string(),
        /**
         * NPCの歳月の出来事（X-12、通知Bランク。{name}/{text} に人物名と出来事文。
         * 引退・結婚・死去・栄転・旅立ちが起きた日に出る）
         */
        npcEvent: z.string(),
        /**
         * NPCの歳月を受けた街の声のコメント行（X-12。街の声が「聞いたかい？」と
         * 出来事を囁く口。{name}/{text} を差し込む）
         */
        npcTownComment: z.string(),
        quit: z.string(),
        invalidInput: z.string(),
        eof: z.string(),
      })
      .strict(),
  })
  .strict();

export type CliText = z.infer<typeof cliTextSchema>;
