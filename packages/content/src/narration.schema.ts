import { z } from "zod";

/** text/narration.json — 語り層のテンプレート（07 §6。TemplateProvider が読む） */
export const narrationSchema = z
  .object({
    newspaper: z
      .object({
        header: z.string(),
        lines: z
          .object({
            quiet: z.array(z.string()).min(1),
            worked: z.array(z.string()).min(1),
            hunted: z.array(z.string()).min(1),
            trained: z.array(z.string()).min(1),
            read: z.array(z.string()).min(1),
            title: z.array(z.string()).min(1),
            offer: z.array(z.string()).min(1),
            /** 作品言及（{name}/{quality}/{tier} を差し込む） */
            work: z.array(z.string()).min(1),
            /** 物騒な見出し（{deaths} を差し込む） */
            death: z.array(z.string()).min(1),
            /** 勘違い系の見出し（03 §5。事実と少しズレた噂） */
            rumor: z.array(z.string()).min(1),
            /** 前世の伝説（06 §2、T-42。{name}/{epithet} を差し込む。年代記が非空の世界でだけ混ざる） */
            legend: z.array(z.string()).min(1),
            /** ライバルの噂（T-47。{name}/{epithet}/{rank}/{score} を差し込む。ランキングがある日に混ざる） */
            rival: z.array(z.string()).min(1),
            /** 勝負所の行事（X-10。{occasion}=《》で包んだ行事名。見出しの後に必ず載る確報） */
            occasionWin: z.array(z.string()).min(1),
            occasionLoss: z.array(z.string()).min(1),
            /**
             * 隠し要素のヒント（X-11。{text}=発見ごとのヒント文。
             * 見逃し対策として未発見の間は見出しの後に必ず載る）
             */
            discoveryHint: z.array(z.string()).min(1),
            /**
             * NPCの歳月（X-12。{name}=人物名・{text}=出来事の記事文。
             * 引退・結婚・死去など街の人物の物語が動いた日に、見出しの後に必ず載る）
             */
            npcEvent: z.array(z.string()).min(1),
            /**
             * 天候（X-13。{weather}=空の表示名・{line}=weather.json の風景の行。
             * 天候表のある世界では見出しの後に毎朝1行載る。{season}/{day} も可）
             */
            weather: z.array(z.string()).min(1),
          })
          .strict(),
      })
      .strict(),
    npcWord: z
      .object({
        greet: z.array(z.string()).min(1),
        respect: z.array(z.string()).min(1),
        /** 立場ID（society.json standings）ごとの口調差分 */
        byStanding: z
          .record(
            z.string(),
            z
              .object({
                greet: z.array(z.string()).min(1).optional(),
                respect: z.array(z.string()).min(1).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    loreDigest: z.object({ header: z.string(), line: z.string() }).strict(),
    /**
     * 世界の危機の見せ方（W-04、docs/08 §3・§7）：段階の噂・終幕の語り・
     * 主人公の痕跡・打診の会話・後日談・通知・結末画面の定型文。
     * 危機の型の narration 節が指す語りrefをここで本文に解決する
     */
    crisis: z
      .object({
        /** 危機の変数の表示語（変数key → 値 → 表示名。語りに差し込む） */
        vars: z.record(z.string(), z.record(z.string(), z.string())),
        /** 段階の語りref → 新聞の記事・噂の行（危機の型の narration.stage が指す） */
        stage: z.record(z.string(), z.array(z.string()).min(1)),
        /** 語りrefを持たない段階・型への汎用の噂（hidden の型にも必ず出せる床） */
        stageFallback: z.array(z.string()).min(1),
        /** 滅びた世の噂（終幕後の世界で流れる） */
        ruin: z.array(z.string()).min(1),
        /** 終幕の語りref → 紙の層の段落行（危機の型の narration.finale が指す） */
        finale: z.record(z.string(), z.array(z.string()).min(1)),
        /** 語りrefを持たない型への汎用の終幕（解決／滅び） */
        finaleFallback: z
          .object({
            resolved: z.array(z.string()).min(1),
            ruin: z.array(z.string()).min(1),
          })
          .strict(),
        /**
         * 主人公の痕跡の候補行（関与の段階 → 行。{var}の埋められない行は選ばない。
         * "4b" は率いる立場にありながら勝者ではなかった場合）
         */
        trace: z.record(z.string(), z.array(z.string()).min(1)),
        /** 滅びの終幕用の痕跡の候補行（同じ段階の語彙） */
        traceRuin: z.record(z.string(), z.array(z.string()).min(1)),
        /** 転生の年代記の後日談（その生の終わり時点の世界の行方を1節） */
        epilogue: z
          .object({
            witnessedResolved: z.string(),
            witnessedRuin: z.string(),
            resolved: z.string(),
            ruin: z.string(),
            ongoing: z.string(),
          })
          .strict(),
        /** 決着の場面への打診（段階3・4。会話の窓で人物から持ちかける形） */
        offer: z
          .object({
            /** 使いが訪ねてきた旨の導入行（{speaker} を差し込む） */
            arrive: z.string(),
            /** 話し手の名札（{faction} を差し込む） */
            speaker: z.string(),
            /** 打診の台詞（{name}＝場面名 を差し込む） */
            line: z.string(),
            /** 受けるかは自由である旨の追記 */
            hint: z.string(),
          })
          .strict(),
        /** 終幕のランクS通知の文 */
        notice: z
          .object({
            kicker: z.string(),
            lead: z.string(),
            footnote: z.string(),
            resolvedTitle: z.string(),
            resolvedSub: z.string(),
            ruinTitle: z.string(),
            ruinSub: z.string(),
            /** 報酬欄のラベル（世界の頁・関与の段階） */
            worldPage: z.string(),
            involvement: z.string(),
          })
          .strict(),
        /** 結末画面の文 */
        ending: z
          .object({
            resolvedTitle: z.string(),
            ruinTitle: z.string(),
            /** その世界の年代記の一頁の見出し */
            pageHeader: z.string(),
            /** 閉じて世界で遊び続ける主ボタン */
            continue: z.string(),
          })
          .strict(),
      })
      .strict(),
    biography: z
      .object({
        header: z.string(),
        summary: z.array(z.string()).min(1),
        origin: z.array(z.string()).min(1),
        work: z.array(z.string()).min(1),
        titles: z.array(z.string()).min(1),
        standing: z.array(z.string()).min(1),
        goal: z.array(z.string()).min(1),
        peak: z.array(z.string()).min(1),
        /** 頂点記述（T-41。{pinnacle} を差し込む） */
        pinnacle: z.array(z.string()).min(1),
        cause: z
          .object({
            retire: z.array(z.string()).min(1),
            death: z.array(z.string()).min(1),
          })
          .strict(),
        closing: z.array(z.string()).min(1),
      })
      .strict(),
  })
  .strict();

export type NarrationText = z.infer<typeof narrationSchema>;
