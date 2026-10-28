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
        /** 旅の野営（P-02）の起床ログに出す場所名 */
        campName: z.string(),
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
        /** 敵の個体差の気質（R-01。combat の EnemyTrait → 名前の前に付く形容） */
        enemyTraitNames: z.record(z.string(), z.string()),
        /** 技能の分野（K-01。skills.json の category → ステータス画面の見出し名） */
        skillCategories: z.record(z.string(), z.string()),
        /** 敵に掛かる状態（K-02。combat の StatusId → 戦闘画面の表示名） */
        statusNames: z.record(z.string(), z.string()),
        /** 狙う・壊れた部位（K-02。combat の BodyPart → 表示名） */
        partNames: z.record(z.string(), z.string()),
        /** 武技の種別（K-02。combat の ArtKind → 技一覧の分類名） */
        artKindNames: z.record(z.string(), z.string()),
        /** 打撃の性質（K-02。combat の DamageType → 技の説明に出す表示名） */
        damageTypeNames: z.record(z.string(), z.string()),
        /** 魔法の属性（M-01。MagicElement → 呪文一覧・説明の表示名） */
        elementNames: z.record(z.string(), z.string()),
        /** 呪文の位（M-01。SpellTier → 呪文の説明に出す表示名） */
        spellTierNames: z.record(z.string(), z.string()),
      })
      .strict(),
    text: z
      .object({
        playerName: z.string(),
        banner: z.string(),
        intro: z.string(),
        /**
         * 初めての生の冒頭に出す導入（F-06。会話窓で2頁。{name} にプレイヤー名。
         * introWelcome=どこにいるか・何ができるか、introGuide=行動と「寝ると成長が定着する」）
         */
        introWelcome: z.string(),
        introGuide: z.string(),
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
        /** タイミング系の拍の判定（F-03。命中・外れの浮き文字・{n}連続命中のコンボ） */
        workHit: z.string(),
        workMiss: z.string(),
        workCombo: z.string(),
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
        /** 交渉の押し合いの局面（F-03。こちら優勢・あいて優勢・互角の3態） */
        negoEdgeWin: z.string(),
        negoEdgeLose: z.string(),
        negoEdgeEven: z.string(),
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
        /** 戦闘画面のこちら側の呼び名（F-04） */
        combatYou: z.string(),
        combatPrompt: z.string(),
        combatWon: z.string(),
        /** 武器店（K-01）：見出し（{money}/{equipped}）・商品行（{i}/{mark}/{name}/{skill}/{power}/{price}/{desc}）・購入・装備・不足 */
        armsHeader: z.string(),
        armsLine: z.string(),
        armsBought: z.string(),
        armsEquipped: z.string(),
        armsTooPoor: z.string(),
        /** 戦闘画面の装備表示（{name} に武器名） */
        combatWeaponLine: z.string(),
        /** 武器の持ち替え（戦闘コマンドのラベルと持ち替えた行。{name} に武器名） */
        combatSwitchLabel: z.string(),
        combatSwitched: z.string(),
        /** 強個体討伐の知らせ（T-44。{name} は素の敵名） */
        uniqueDefeated: z.string(),
        combatLost: z.string(),
        /** 老衰死（T-36。{age} にその朝の年齢） */
        deathByAge: z.string(),
        combatFled: z.string(),
        combatGain: z.string(),
        /* ── K-02：武技・資源・構成 ── */
        /** 戦闘画面の気力の表示（{ki}/{max}） */
        combatKiLine: z.string(),
        /** 戦闘画面の武技コマンドの見出し */
        combatArtsLabel: z.string(),
        /** 戦闘画面の魔力の表示（{mana}/{max}。M-01） */
        combatManaLine: z.string(),
        /** 戦闘画面の呪文コマンドの見出し（M-01） */
        combatSpellsLabel: z.string(),
        /** 生活魔法を唱えた（M-01、通知Bランク相当。{name}=呪文名・{line}=効果の一行） */
        magicCast: z.string(),
        /** 生活魔法の効果ごとの一行（M-01。hook → 「竈の火が従う」系の文） */
        lifeSpellLines: z.record(z.string(), z.string()),
        /** 付与を刻んだ（M-01。{name}=武器名・{level}=段） */
        enchanted: z.string(),
        /** 新しい技を閃いた知らせ（K-02、通知Bランク。{name} は技名） */
        artLearned: z.string(),
        /** 技が進化した知らせ（K-03、通知Aランク。{from}/{to} は技名・{reason} は理由の語り片） */
        artEvolved: z.string(),
        /** 隠し分岐への進化（K-03。同じく {from}/{to}/{reason}。見知らぬ形への変化） */
        artEvolvedHidden: z.string(),
        /** 合成で技が生まれた知らせ（K-03、通知Bランク。{name} は生まれた技名） */
        artSynthesized: z.string(),
        /** ユニークスキルを得た知らせ（K-03、通知Sランク。{name} は技名） */
        uniqueGained: z.string(),
        /** S予算超過のユニーク獲得（K-03。{name} は技名。記録は残る） */
        uniqueSuppressed: z.string(),
        /** ユニークがライバルの手に渡った知らせ（K-03、通知Aランク。{name} は技名・{rival} は名） */
        uniqueClaimed: z.string(),
        /** ステータスの技タブの傾き表示（K-03。{tilt} は傾きの軸名） */
        statusTiltLabel: z.string(),
        /** 傾きがまだ見えない技の説明（K-03） */
        statusTiltNone: z.string(),
        /** 構成画面（K-02）：見出し・各枠の見出し・空き枠・確定の行 */
        buildHeader: z.string(),
        buildArtsHeader: z.string(),
        buildPassivesHeader: z.string(),
        buildWeaponsHeader: z.string(),
        buildSlotEmpty: z.string(),
        buildSaved: z.string(),
        /** ステータス画面の技タブの見出し（{n}=覚えた数） */
        statusArtsHeader: z.string(),
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
        /** 街の記録のユニーク欄（K-03。{name}=技名・{day}=日目・{holder}=持ち主表現・{rival}=ライバル名） */
        recordsUniques: z.string(),
        recordsUniquesNone: z.string(),
        recordsUniqueLine: z.string(),
        recordsUniqueYou: z.string(),
        recordsUniqueRival: z.string(),
        /** 新聞のユニーク記事（K-03。{name}=技名・{rival}=ライバル名） */
        newsUniqueGained: z.string(),
        newsUniqueClaimed: z.string(),
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
        /**
         * 日々の出来事（F-05）：メニュー項目（行動ありの日＝15番、行動残が無い
         * 日＝8番に差す）、届いた告知（{name}）、場の見出し・出来事名の行、
         * 先送りの選択肢、話し手の台詞の行（{speaker}/{line}）、選択肢の行
         * （{index}/{label}/{hint}）、出来事由来の経験（{name}/{amount}）と
         * 見聞録への記録（{title}）の一行
         */
        incidentMenuItem: z.string(),
        incidentMenuItemRest: z.string(),
        incidentOffered: z.string(),
        incidentSceneHeader: z.string(),
        incidentSceneName: z.string(),
        incidentDefer: z.string(),
        incidentSpeakerLine: z.string(),
        incidentChoice: z.string(),
        incidentGain: z.string(),
        incidentAtom: z.string(),
        /** 勝負所の注文の印（F-05、03 §2「使い所の原則」。注文名の前に付ける） */
        showdownTag: z.string(),
        /** 日常の注文を手動で仕上げる開始行（勝負所の触れ込みは付けない） */
        workStartCasual: z.string(),
        performanceStartCasual: z.string(),
        fishingStartCasual: z.string(),
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
        /** ユニークスキルの記録（K-03。{uniques} は技名を繋いだもの） */
        chronicleUniques: z.string(),
        chronicleRecorded: z.string(),
        /**
         * 場所と移動（P-01、docs/03 §2）：見取り図の題字（{town} は街の名）・
         * 場所選びの問いかけ・外への移動の記録行（{name} は行き先の場所名）・
         * 街の外からの帰還・場所の住人欄・場所から見取り図への戻り口
         */
        mapTitle: z.string(),
        mapPick: z.string(),
        travelLine: z.string(),
        travelReturn: z.string(),
        placeHere: z.string(),
        placeBack: z.string(),
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
        /** F-02：納品の札（右上に滑り込む短い知らせ） */
        workDelivered: z.string(),
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
        /** 武器屋の印（K-01）：棚の行に付ける「装備中」「所持」の印 */
        armsEquippedTag: z.string(),
        armsOwnedTag: z.string(),
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
        /** 師匠が今日は街にいなかった（R-01、人の揺らぎ。{name} は師匠の名） */
        mentorAway: z.string(),
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
            /** オーバーワーク継続中の朝の行（02 §7。休養日が治療であることも示す） */
            overworkLine: z.string(),
            /** 錆びたスキルがあった朝の行（{name}/{loss}） */
            rusted: z.string(),
            /** peak未満の再習得が速い行（{name}） */
            relearning: z.string(),
            /** 老いの兆候：弱い方（T-36。寿命経過が signWarnAt 超えの朝） */
            agingWarn: z.string(),
            /** 老いの兆候：強い方（signSevereAt 超え。間隔を置いて繰り返す） */
            agingSevere: z.string(),
            /** この睡眠でLvの上がった武技の行（K-02。{name}/{to}） */
            artLevelUp: z.string(),
            /** 「妙に冴えている」日の行（R-01。冴えの朝に出る） */
            insight: z.string(),
            /** 体調が良い日の行（R-01） */
            conditionGood: z.string(),
            /** 体調が悪い日の行（R-01） */
            conditionPoor: z.string(),
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
        /**
         * 日々の営み（P-02「行動の種類を増やす」）：散策・採集・料理・賭け・
         * 人との時間・市場・掲示板・祈り・旅の記録行。{name} は品・人物・
         * 依頼・町の表示名、{town} は町の名、{n}/{amount}/{stake}/{days}/{quality}
         * は数値を差し込む
         */
        life: z
          .object({
            /** 旅の到着（起床の驚きの行＋記録。{town} は着いた町の名） */
            arrive: z.string(),
            itemGot: z.string(),
            itemBought: z.string(),
            itemSold: z.string(),
            cooked: z.string(),
            ate: z.string(),
            gambleWon: z.string(),
            gambleLost: z.string(),
            prayed: z.string(),
            prayedAlms: z.string(),
            bonded: z.string(),
            /** 相手が今日街にいなかった（R-01 人の揺らぎと同じ仕立て） */
            bondMissed: z.string(),
            errandDone: z.string(),
            journeyStarted: z.string(),
          })
          .strict(),
        eof: z.string(),
      })
      .strict(),
  })
  .strict();

export type CliText = z.infer<typeof cliTextSchema>;
