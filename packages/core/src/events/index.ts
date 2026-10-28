import {
  crisisAttemptFlag,
  crisisJoinFlag,
  crisisOfferFlag,
  CRISIS_HERO_FLAG,
} from "../crisis/index.js";
import type { NpcLifeEventKind } from "../npclife/index.js";
import {
  incidentDoneDayKey,
  incidentLastOfferKey,
  incidentOfferDayKey,
  incidentOfferKindDayKey,
} from "../incidents/index.js";
import {
  occasionAttemptDayKey,
  occasionJoinDayKey,
  occasionOfferDayKey,
  occasionOfferKindDayKey,
} from "../occasions/index.js";
import type { CrisisFieldId, GameState, Work } from "../state/types.js";
import type { GameTime } from "../time/index.js";
import type { WakeReport } from "../growth/consolidate.js";

/**
 * ActionEvent — step() が発行する出来事。称号・作品台帳・通知・統計などの
 * 購読者がこれを受け取って派生状態を更新する（docs/04 §2 原則3）。
 */

export type ActionEvent =
  /** 行動を消化した。kind はコマンド側の分類、target は行動の相手、variant は新規性の細粒度キー */
  | { type: "actionPerformed"; kind: string; day: number; target?: string; variant?: string }
  /**
   * 睡眠した。from/to は GameTime。
   * camp は野営の眠り（旅の野営・迷宮内野営。起床ログの場所名の出し分けに使う）
   */
  | { type: "slept"; from: GameTime; to: GameTime; camp?: boolean }
  /** 未定着経験を得た。amount は今回の増分 */
  | { type: "gainApplied"; skill: string; amount: number }
  /** 起床ログの構造化データ（睡眠時に発行） */
  | { type: "wakeReport"; report: WakeReport }
  /**
   * スキルのランク帯を越えた（F-01。02 §1 のランク表。睡眠の定着で value が
   * 境目を跨いだとき、wakeReport の直後に発行する。通知Bランク相当 ——
   * 起床ログの行として出る。rank は skillRanks の添字で、表示名は表示側が
   * cli.json display.skillRankNames から引く）
   */
  | { type: "skillRankUp"; skill: string; fromRank: number; toRank: number }
  /** 称号を獲得した。rank は通知ランク（S/A/B）。suppressed はS予算超過 */
  | { type: "titleGained"; id: string; rank: "S" | "A" | "B"; suppressed?: boolean }
  /** 作品台帳に記録された */
  | { type: "workRecorded"; work: Work }
  /** 作品のティアが更新された（自己ベスト。大きな成長のトリガー） */
  | { type: "tierUp"; kind: string; tier: number }
  /** 戦闘が終わった（03 §4） */
  | { type: "combatEnded"; enemyId: string; won: boolean; fled: boolean }
  /** 強化版ユニークを討ち取った（T-44。図鑑・称号の根拠にもなる） */
  | { type: "uniqueDefeated"; enemyId: string }
  /**
   * 深層ダンジョンのランが終わった（T-43、06 §3B。通知Aランク相当）。
   * depth はクリアした層数、best は反映後の自己ベスト（counters["abyss.best"]）、
   * newBest は今回の到達が自己ベストを更新したか
   */
  | {
      type: "abyssEnded";
      end: "fled" | "light" | "retreat" | "died";
      depth: number;
      best: number;
      newBest: boolean;
    }
  /**
   * 有限迷宮の潜りが終わった（G-03、docs/10 §6。通知Bランク相当、制覇はA）。
   * id は迷宮の場所 id。rooms は今回抜いた室数、cleared/total は反映後の
   * 累計と全室数、done は制覇（最後の潜り）か
   */
  | {
      type: "dungeonEnded";
      id: string;
      end: "fled" | "light" | "retreat" | "camp" | "cleared" | "died";
      rooms: number;
      cleared: number;
      total: number;
      done: boolean;
    }
  /**
   * 迷宮の主を討った（G-03。通知Aランク相当、ユニークはS —— 世界に1体・
   * 世界初の記録）。enemyId は主の基になった敵種、unique はユニークモンスターか
   */
  | { type: "bossDefeated"; dungeon: string; enemyId: string; unique: boolean }
  /** 死亡して教会で蘇生した。未定着経験の半分を失う */
  | { type: "died" }
  /**
   * 老いの兆候（T-36。起床サプライズの行としても出る）。
   * stage: 1 = 弱い兆候（一度だけ）/ 2 = 強い兆候（間隔を置いて繰り返す）。age はその朝の年齢
   */
  | { type: "oldAgeSign"; stage: 1 | 2; age: number }
  /**
   * 老衰死（T-36。startAge + lifespanYears 歳に達した朝に一度だけ）。
   * 内部的には died と同じ処理（pending半減）を行い、続けて died も発行するが、
   * 呼び出し側（T-40）はこのイベントを見て「蘇生せず転生フローへ」に分岐する（D-31）。
   * 年齢由来の死を戦闘死と区別するための別型
   */
  | { type: "deathByAge"; age: number }
  /**
   * 引退（T-40。06 §1「引退はいつでも選べる」）。
   * 行動を消費せず state も変えず、生涯の終わりを告げるだけ。
   * 伝記・年代記への記録・継承・転生の処理は呼び出し側が行う
   */
  | { type: "retired" }
  /** 気配：S候補に近づいた合図（条件は明かさない。03 §6） */
  | { type: "kehai" }
  /**
   * 頂点ルートの段に達した（06 §3A、T-41）。
   * route/stage は pinnacles.json の id。rank はその段の通知ランク（最終段は S）
   */
  | { type: "pinnacleStageReached"; route: string; stage: string; rank: "S" | "A" | "B" }
  /** 立場・職業の打診が来た（通知Aランク相当。03 §1） */
  | { type: "offerReceived"; kind: "standing" | "profession"; id: string }
  /** 打診を受けて認定された */
  | { type: "offerAccepted"; id: string }
  /** 人生目標を宣言した */
  | { type: "goalDeclared"; id: string }
  /** 宣言した人生目標を達成した（報酬済み） */
  | { type: "goalAchieved"; id: string }
  /** アトムを読んだ（見聞録に記録） */
  | { type: "atomRead"; id: string }
  /** 事実が判明した（アトムの reveals 由来） */
  | { type: "factLearned"; id: string }
  /** 出来事の事実が揃い、つながりの報酬（隠しフラグ）が立った */
  | { type: "loreConnection"; id: string; flag: string }
  /** 派生スキルが解放された（02：派生。flags["skill.unlock.<id>"] が立つ） */
  | { type: "skillUnlocked"; id: string }
  /** 仕事の報酬が入った（G） */
  | { type: "moneyPaid"; amount: number }
  /** 街に寄付した（X-9 領主ルート。amount は納めたG。counters["town.donated"] に累計される） */
  | { type: "donated"; amount: number }
  /** 書物を買った（T-26。行動は消費しない） */
  | { type: "bookBought"; id: string }
  /**
   * 書物を読み終えた（T-26。行動1回消費）。
   * recovered は実際に回復した素質（上限で削られた分を除く）。flag は今回立った知識フラグ
   */
  | { type: "bookRead"; id: string; recovered: { skill: string; amount: number }[]; flag?: string }
  /** 師匠に弟子入りした（T-27。行動は消費しない） */
  | { type: "mentorApprenticed"; id: string }
  /** 師匠の門を出た */
  | { type: "mentorLeft"; id: string }
  /**
   * 師匠の稽古を受けた（行動1回消費＋礼金 fee）。
   * recovered は実際に回復した素質（上限で削られた分を除く）。flag は今回立った秘伝フラグ
   */
  | {
      type: "mentorTrained";
      id: string;
      fee: number;
      recovered: { skill: string; amount: number }[];
      flag?: string;
    }
  /**
   * 師匠が今日は街にいなかった（R-01、人の揺らぎ。弟子入り・師匠の稽古を
   * 選んだが叶わなかったときに出る。行動は消費しない。id は師匠の id）
   */
  | { type: "mentorAway"; id: string }
  /** 武器を買った（K-01。行動は消費しない。id は weapons.json の id） */
  | { type: "weaponBought"; id: string }
  /** 武器を持ち替えた（K-01。行動は消費しない。装備中の武器IDが変わる） */
  | { type: "weaponEquipped"; id: string }
  // ---- 武技・資源・構成（K-02、docs/09） ----
  /**
   * 新しい武技・パッシブを閃いた（K-02、09 §7.1。技能値×使い方の傾きで
   * 習得条件を満たしたとき。通知Bランク相当 —— 新しい技能の解放と同じ格。
   * id は arts.json の id）
   */
  | { type: "artLearned"; id: string }
  /**
   * 技が進化した（K-03、09 §7.1。Lv10 に達した技が使い方の記録と最も合う
   * 分岐へ化けた。通知Aランク相当 —— 積み重ねの形が変わる大きな節目）。
   * hidden は隠し分岐（まれに現れる。新聞では「未知の形」として語る）
   */
  | { type: "artEvolved"; from: string; to: string; reason: string; hidden: boolean }
  /**
   * 技が生まれた（K-03、09 §7「合成」：技能・技の響き合い。通知Bランク相当
   * —— 新しい技の習得と同じ格。レシピは伏せられ、ヒントだけが噂に載る）
   */
  | { type: "artSynthesized"; id: string }
  /**
   * ユニークスキルを得た（K-03、09 §7「その世界で一人だけ持てる技」。
   * 通知Sランク相当 —— 「世界初」の出来事。suppressed はS予算超過）
   */
  | { type: "uniqueGained"; art: string; suppressed?: boolean }
  /**
   * ユニークスキルがライバルの手に渡った（K-03。眠りのあいだに世界が
   * 動き、先に取られた。通知Aランク相当 —— 新聞と世界の記録に載る）。
   * rival はライバルの抽選順（rival.<index>。表示名は表示側が解く）
   */
  | { type: "uniqueClaimed"; art: string; rival: string }
  /** 武技の構成を組み替えた（K-02、09 §6。行動は消費しない。setBuild の確認） */
  | { type: "buildChanged" }
  // ---- 世界の危機（docs/08、W-01） ----
  /** 世界の危機が抽選された（世界生成時。v15 以前のセーブでは次の季節の変わり目） */
  | { type: "crisisDrawn" }
  /** 危機の段階が進んだ（季節の変わり目。stage は型の stages の id） */
  | { type: "crisisStageChanged"; stage: string }
  /**
   * 決着の場面が判定された（季節の変わり目。通知Aランク相当）。
   * success が立てば決着、total はその時点の備えの合計（世界の備え＋主人公の寄与）
   */
  | { type: "crisisFinale"; id: string; success: boolean; total: number }
  /** 危機の終幕（通知Aランク相当。解決か、重い危機では滅び） */
  | { type: "crisisEnded"; outcome: "resolved" | "ruin" }
  /**
   * 危機の接点を果たした（W-02、docs/08 §5。日常の行動の延長として世界の備えに寄与）。
   * 接点の id、寄与した分野、備えに足した量を持つ
   */
  | { type: "crisisTouchpoint"; id: string; field: CrisisFieldId; amount: number }
  // ---- 関与と英雄への道（docs/08 §6、W-03） ----
  /**
   * 決着の場面への参加の打診が届いた（関与が段階3「担った」の者に。
   * 通知Aランク相当 —— 立場・職業の打診と同じ格。届いた打診は
   * flags["crisis.offer.<id>"] に記録される）
   */
  | { type: "crisisFinaleOffered"; id: string }
  /** 打診に応えて参加を請けた（行動は消費しない。flags["crisis.join.<id>"]） */
  | { type: "crisisFinaleJoined"; id: string }
  /**
   * 決着の場面の勝負所を果たした（1行動。score は実際に遊んだ結果の出来 0〜1、
   * amount は世界の備えに足した量。flags["crisis.attempt.<id>"]）
   */
  | { type: "crisisFinaleAttempt"; id: string; score: number; amount: number }
  /**
   * 決着の場面を自分で起こした（段階4「率いた」＝英雄。1行動）。
   * success が立てば flags["crisis.hero"] が立つ
   */
  | { type: "crisisFinaleLed"; id: string; success: boolean; total: number }
  /**
   * ライバルが決着の場面を勝ち取り英雄として記録された（通知Aランク相当）。
   * index はライバルの抽選順（log の ref "rival.<index>" と対応）
   */
  | { type: "crisisRivalHero"; index: number; finale: string }
  // ---- 勝負所の行事（X-10、docs/03 §2「勝負所でミニゲームが出る」） ----
  /**
   * 行事の打診が届いた（通知Bランク相当 —— 人物からの持ちかけとして届く）。
   * 届いた日は counters["occasion.offer.day.<id>"] に刻まれる
   */
  | { type: "occasionOffered"; id: string; kind: string }
  /** 行事の打診に応えた（行動は消費しない。counters["occasion.join.day.<id>"] に当日を刻む） */
  | { type: "occasionJoined"; id: string }
  /**
   * 勝負所を果たした（1行動。score は実際に遊んだ結果の出来 0〜1、won は勝敗）。
   * 同日の再挑戦は counters["occasion.attempt.day.<id>"]、勝敗は
   * occasion.won/lost（全体・行事別・種類別）と旗印 flags["occasion.won.<id>"|...] に刻む
   */
  | { type: "occasionAttempted"; id: string; kind: string; score: number; won: boolean }
  // ---- 日々の出来事（F-05）：行動の合間に差し込まれる小さな出来事 ----
  /**
   * 出来事が届いた（通知Bランク相当 —— 行動の合間に会話の窓で応える）。
   * 届いた日は counters["incident.offer.day.<id>"] に刻まれる。
   * 応えるも応えないも自由 —— 応えなくても翌日には流れる
   */
  | { type: "incidentOffered"; id: string; kind: string }
  /**
   * 出来事に応えた（行動は消費しない。選んだ選択肢から結末が決定的に引かれる）。
   * choice は選んだ選択肢の id、text は結末の一文（記録・新聞・画面に出る）。
   * 応えた日は counters["incident.done.day.<id>"]、効果の刻印は結果定義の
   * flags/counters/atom/contribution に従う
   */
  | { type: "incidentResolved"; id: string; kind: string; choice: string; text: string }
  /**
   * 隠し要素を見つけた（X-11、docs/03 §5。通知Bランク相当）。
   * id は discoveries.json の id。flags["found.<id>"] は step 内で既に立っている
   * （アトムの unlock・書物・頂点の hidden 条件が同じ旗を読む）
   */
  | { type: "discovery"; id: string }
  // ---- NPCの歳月（docs/07 §3、X-12） ----
  /**
   * 街の人物の物語が動いた（通知Bランク相当）。引退・結婚・死去・栄転・旅立ち。
   * npcId は voices/canon の id か "rival.<index>"（ライバルの抽選順）。
   * name/text は発火時に解決済みの表示名と記事文（{name} 置換済み）。
   * day は起きた日。退場系は flags["npc.gone.<npcId>"]・世界の記録
   * （crisis.log の npc.<kind> 行）に既に刻まれている
   */
  | {
      type: "npcEvent";
      npcId: string;
      kind: NpcLifeEventKind;
      name: string;
      text: string;
      day: number;
    }
  // ---- 日々の営み（P-02「行動の種類を増やす」） ----
  /**
   * 散策・道中の出来事が起きた（1行動）。text は結末の一文（記録の行。
   * 「――」始まりの地の文）。小さな効果（拾い物・金・仲・経験・疲労）は
   * このイベントとは別に itemGot/moneyPaid/gainApplied/bonded として発行される
   */
  | { type: "strollOutcome"; text: string }
  /** 品物を得た（採集・散策・報酬。id は items.json の id、n は個数） */
  | { type: "itemGot"; id: string; n: number }
  /** 品物を消費・納めた（料理の材料・掲示板の納品・贈り物。id は items.json の id） */
  | { type: "itemSpent"; id: string; n: number }
  /** 市場で買った（行動は消費しない。amount は払った G） */
  | { type: "itemBought"; id: string; n: number; amount: number }
  /** 市場で売った（行動は消費しない。amount は得た G） */
  | { type: "itemSold"; id: string; n: number; amount: number }
  /**
   * 料理を作った（1行動）。recipe は life.json のレシピ id、out はできた
   * 品物、quality は出来（0〜100。counters["meal.q.<out>"] がこの出来を覚える）
   */
  | { type: "cooked"; recipe: string; out: string; quality: number }
  /** 食べた（行動は消費しない。quality はその食事の質 —— 今夜の眠りに効く） */
  | { type: "ate"; id: string; quality: number }
  /** 賭けた（1行動。stake は掛け金、won は勝敗、amount は手に入った G） */
  | { type: "gambled"; stake: number; won: boolean; amount: number }
  /**
   * 祈った（1行動。alms は施しに納めた G。祈った日の眠りが少し深くなる）。
   * 施しの累計は counters["life.alms"] に刻まれる
   */
  | { type: "prayed"; alms?: number }
  /**
   * 人との仲が深まった（話す・飲む・贈る・散策の出会い・依頼の報酬）。
   * amount は今回の増分（0 なら「相手に会えなかった」）、total は増分後の仲の値
   */
  | { type: "bonded"; npc: string; amount: number; total: number }
  /** 掲示板の依頼を果たした（1行動。id は life.json errands の id） */
  | { type: "errandDone"; id: string }
  /**
   * 旅に出た（1行動。to は行き先の町 id、days は道中に要する日数）。
   * 以後は野営の眠りで daysLeft が減り、0 の朝に着く
   */
  | { type: "journeyStarted"; to: string; days: number }
  /** 町に着いた（旅の最後の野営の朝。town は着いた町の id） */
  | { type: "journeyArrived"; town: string }
  /**
   * 町の評判が上がった（G-01、docs/10 §4。掲示板・仕事・寄付でその町の
   * 分だけ積み上がる。amount は増分、total は増分後の評判）
   */
  | { type: "repGained"; town: string; amount: number; total: number }
  // ---- 魔法（M-01、docs/09 §4〜5） ----
  /**
   * 生活魔法を唱えた（1行動＋魔力。id は spells.json の呪文 id、
   * hook は掛かった窓 —— cookBonus/smithBonus/…/heal/preserve）
   */
  | { type: "magicCast"; id: string; hook: string }
  /**
   * 武器に付与を刻んだ（M-01「鍛冶＋火魔法」。1行動＋魔力。
   * level は重ねた後の段数 —— counters["enchant.<weapon>"] と一致する）
   */
  | { type: "enchanted"; weapon: string; level: number };

/** 派生状態を更新する購読者。純粋関数：新しい state を返す */
export type Subscriber = (state: GameState, event: ActionEvent) => GameState;

/** カウンタを数える購読者（`action.<kind>`、`action.total`、`days.slept`、`title.total`、`society.offer.<id>`、`mentor.session.<id>`、`money.earned`、`town.donated`） */
export const counterSubscriber: Subscriber = (state, event) => {
  switch (event.type) {
    case "actionPerformed": {
      const key = `action.${event.kind}`;
      return {
        ...state,
        counters: {
          ...state.counters,
          [key]: (state.counters[key] ?? 0) + 1,
          "action.total": (state.counters["action.total"] ?? 0) + 1,
        },
      };
    }
    case "slept": {
      return {
        ...state,
        counters: { ...state.counters, "days.slept": (state.counters["days.slept"] ?? 0) + 1 },
      };
    }
    case "titleGained": {
      return {
        ...state,
        counters: { ...state.counters, "title.total": (state.counters["title.total"] ?? 0) + 1 },
      };
    }
    case "offerAccepted": {
      // 認定の受諾を数える（立場・職業への到達を条件DSLから読めるようにする。T-34）
      const key = `society.offer.${event.id}`;
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
      };
    }
    case "moneyPaid": {
      // 稼いだ額の累計（売上の生涯合計。商王ルートなど条件DSLから読める。X-9）
      return {
        ...state,
        counters: {
          ...state.counters,
          "money.earned": (state.counters["money.earned"] ?? 0) + event.amount,
        },
      };
    }
    case "donated": {
      // 街への寄付の累計（奉仕。領主ルートの社会的基盤。X-9）
      return {
        ...state,
        counters: {
          ...state.counters,
          "town.donated": (state.counters["town.donated"] ?? 0) + event.amount,
        },
      };
    }
    case "mentorTrained": {
      // 師匠ごとの稽古回数を数える（条件DSLから「師匠の元でN回稽古」を読める。T-27）
      const key = `mentor.session.${event.id}`;
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
      };
    }
    case "mentorApprenticed":
      // 「いま師匠がいる」の印を立てる（F-05：出来事の条件が flags["mentor.now"] を読む。
      // 危機・歳月で師が街を去る経路は npclife がこの旗を消す）
      return { ...state, flags: { ...state.flags, "mentor.now": true } };
    case "mentorLeft":
      return { ...state, flags: { ...state.flags, "mentor.now": false } };
    case "crisisFinale": {
      // 決着の場面の成否を数える（条件DSLから「危機の場面を支えた/見届けた」を読める。W-01）
      const key = event.success ? "crisis.finale.win" : "crisis.finale.loss";
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
      };
    }
    case "crisisEnded": {
      // 危機の終幕を数える（世界の記録の根拠にもなる。W-01）
      const key = `crisis.end.${event.outcome}`;
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
      };
    }
    case "crisisTouchpoint": {
      // 接点の達成を数える（関わりの深さを条件DSLから読める。W-02。
      // 提示を見ても受けなければ何も刻まれない —— 断る・無視する側に不利益はない）
      const done = "crisis.tp.done";
      const key = `crisis.tp.${event.id}`;
      return {
        ...state,
        counters: {
          ...state.counters,
          [done]: (state.counters[done] ?? 0) + 1,
          [key]: (state.counters[key] ?? 0) + 1,
        },
      };
    }
    // ---- 関与（W-03、docs/08 §6）：打診・参加・勝負所・起こし・ライバル英雄の記録 ----
    case "crisisFinaleOffered": {
      // 届いた打診を記録する（同じ場面への打診は一度だけ届く）
      const flag = crisisOfferFlag(event.id);
      if (state.flags[flag] === true) return state;
      return {
        ...state,
        flags: { ...state.flags, [flag]: true },
        counters: { ...state.counters, "crisis.offer": (state.counters["crisis.offer"] ?? 0) + 1 },
      };
    }
    case "crisisFinaleJoined": {
      // 参加を請けたことを記録する（受けても断っても世界は進む —— 請けた事実だけ刻む）
      const flag = crisisJoinFlag(event.id);
      if (state.flags[flag] === true) return state;
      return {
        ...state,
        flags: { ...state.flags, [flag]: true },
        counters: { ...state.counters, "crisis.join": (state.counters["crisis.join"] ?? 0) + 1 },
      };
    }
    case "crisisFinaleAttempt": {
      // 勝負所を果たしたことを記録する（1場面につき1回だけ挑める）
      const flag = crisisAttemptFlag(event.id);
      if (state.flags[flag] === true) return state;
      return {
        ...state,
        flags: { ...state.flags, [flag]: true },
        counters: {
          ...state.counters,
          "crisis.attempt": (state.counters["crisis.attempt"] ?? 0) + 1,
        },
      };
    }
    case "crisisFinaleLed": {
      // 自分で起こした決着の成否を数える。勝ち取った者は flags["crisis.hero"] に
      // 「率いた（英雄）」を刻む（条件DSL・伝記・称号から読める）
      const key = event.success ? "crisis.lead.win" : "crisis.lead.loss";
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
        flags: event.success ? { ...state.flags, [CRISIS_HERO_FLAG]: true } : state.flags,
      };
    }
    case "crisisRivalHero": {
      // 英雄として記録されたライバルの数（世界が語り継ぐ根拠）
      return {
        ...state,
        counters: {
          ...state.counters,
          "crisis.rival.hero": (state.counters["crisis.rival.hero"] ?? 0) + 1,
        },
      };
    }
    // ---- 勝負所の行事（X-10）：打診・受諾・勝負所の記録（日付・勝敗・旗印） ----
    case "occasionOffered": {
      // 届いた日を刻む（再提示の間隔の基準＋「今日届いている」の判定）。同日に二度刻まない
      const dayKey = occasionOfferDayKey(event.id);
      if (state.counters[dayKey] === state.time.day) return state;
      return {
        ...state,
        counters: {
          ...state.counters,
          [dayKey]: state.time.day,
          [occasionOfferKindDayKey(event.kind)]: state.time.day,
          [`occasion.offered.${event.id}`]:
            (state.counters[`occasion.offered.${event.id}`] ?? 0) + 1,
          "occasion.offered": (state.counters["occasion.offered"] ?? 0) + 1,
        },
      };
    }
    case "occasionJoined": {
      // 打診に応えた日を刻む（当日だけ有効。断った・応えない側には何も刻まれない）
      const dayKey = occasionJoinDayKey(event.id);
      if (state.counters[dayKey] === state.time.day) return state;
      return {
        ...state,
        counters: {
          ...state.counters,
          [dayKey]: state.time.day,
          "occasion.joined": (state.counters["occasion.joined"] ?? 0) + 1,
        },
      };
    }
    case "occasionAttempted": {
      // 勝負所の結果を刻む（勝敗は全体・行事別・種類別のカウンタと旗印に。
      // 旗印は条件DSLから「あの品評会を制した」「あの決闘に敗れた」を読める刻印）
      const base = event.won ? "occasion.won" : "occasion.lost";
      const idKey = `${base}.${event.id}`;
      const kindKey = `${base}.${event.kind}`;
      return {
        ...state,
        counters: {
          ...state.counters,
          [occasionAttemptDayKey(event.id)]: state.time.day,
          "occasion.attempted": (state.counters["occasion.attempted"] ?? 0) + 1,
          [`occasion.attempted.${event.id}`]:
            (state.counters[`occasion.attempted.${event.id}`] ?? 0) + 1,
          [base]: (state.counters[base] ?? 0) + 1,
          [idKey]: (state.counters[idKey] ?? 0) + 1,
          [kindKey]: (state.counters[kindKey] ?? 0) + 1,
        },
        flags: { ...state.flags, [idKey]: true },
      };
    }
    // ---- 日々の出来事（F-05）：届いた日・応えた日・累計の記録 ----
    case "incidentOffered": {
      // 届いた日を刻む（再提示の間隔の基準＋「今日届いている」の判定）。同日に二度刻まない
      const dayKey = incidentOfferDayKey(event.id);
      if (state.counters[dayKey] === state.time.day) return state;
      return {
        ...state,
        counters: {
          ...state.counters,
          [dayKey]: state.time.day,
          // 出来事が最後に届いた日（保証の間隔の基準。どの出来事でも良い）
          [incidentLastOfferKey]: state.time.day,
          [incidentOfferKindDayKey(event.kind)]: state.time.day,
          [`incident.offered.${event.id}`]:
            (state.counters[`incident.offered.${event.id}`] ?? 0) + 1,
          "incident.offered": (state.counters["incident.offered"] ?? 0) + 1,
        },
      };
    }
    case "incidentResolved": {
      // 応えた日と累計を刻む（同日の二度応え防止＋条件DSLから「出来事に応えた」を読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          [incidentDoneDayKey(event.id)]: state.time.day,
          "incident.resolved": (state.counters["incident.resolved"] ?? 0) + 1,
          [`incident.resolved.${event.id}`]:
            (state.counters[`incident.resolved.${event.id}`] ?? 0) + 1,
        },
      };
    }
    case "discovery": {
      // 見つけた隠し要素の累計（条件DSL・伝記から「何かを見つけた」を読める。X-11）
      return {
        ...state,
        counters: {
          ...state.counters,
          "discovery.total": (state.counters["discovery.total"] ?? 0) + 1,
          [`discovery.found.${event.id}`]: (state.counters[`discovery.found.${event.id}`] ?? 0) + 1,
        },
      };
    }
    case "npcEvent": {
      // 街の人物の物語が動いた累計（X-12。条件DSLから「街で起きた出来事」を読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          "npc.events": (state.counters["npc.events"] ?? 0) + 1,
          [`npc.events.${event.kind}`]: (state.counters[`npc.events.${event.kind}`] ?? 0) + 1,
        },
      };
    }
    // ---- 日々の営み（P-02）：持ち物・仲・賭け・依頼・祈り・旅の刻印 ----
    case "itemGot": {
      // 品の累計と今の所持数を刻む（条件DSLから「これだけ集めた/持っている」を読める。
      // 所持数は step が先に更新した state.life.items の最終値を写すだけ）
      return {
        ...state,
        counters: {
          ...state.counters,
          [`item.got.${event.id}`]: (state.counters[`item.got.${event.id}`] ?? 0) + event.n,
          [`item.${event.id}`]: state.life.items[event.id] ?? 0,
        },
      };
    }
    case "itemSpent": {
      return {
        ...state,
        counters: {
          ...state.counters,
          [`item.spent.${event.id}`]: (state.counters[`item.spent.${event.id}`] ?? 0) + event.n,
          [`item.${event.id}`]: state.life.items[event.id] ?? 0,
        },
      };
    }
    case "itemBought": {
      return {
        ...state,
        counters: {
          ...state.counters,
          "item.bought": (state.counters["item.bought"] ?? 0) + event.n,
          [`item.${event.id}`]: state.life.items[event.id] ?? 0,
        },
      };
    }
    case "itemSold": {
      // 売却の累計（売上の生涯合計に乗る。商売の実績を条件DSLから読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          "item.sold": (state.counters["item.sold"] ?? 0) + event.n,
          "money.earned": (state.counters["money.earned"] ?? 0) + event.amount,
          [`item.${event.id}`]: state.life.items[event.id] ?? 0,
        },
      };
    }
    case "cooked": {
      // 直近の出来を品物ごとに覚える（食べたときの食事の質に効く）＋料理の累計
      return {
        ...state,
        counters: {
          ...state.counters,
          [`meal.q.${event.out}`]: Math.round(event.quality),
          "cook.total": (state.counters["cook.total"] ?? 0) + 1,
          [`item.${event.out}`]: state.life.items[event.out] ?? 0,
        },
      };
    }
    case "ate": {
      return {
        ...state,
        counters: {
          ...state.counters,
          "meal.count": (state.counters["meal.count"] ?? 0) + 1,
        },
      };
    }
    case "gambled": {
      // 賭けの通算（勝敗・回数。博打の実績を条件DSLから読める）
      const key = event.won ? "gamble.won" : "gamble.lost";
      return {
        ...state,
        counters: {
          ...state.counters,
          "gamble.total": (state.counters["gamble.total"] ?? 0) + 1,
          [key]: (state.counters[key] ?? 0) + 1,
        },
      };
    }
    case "prayed": {
      // 祈りの回数と施しの累計（教会への奉仕。条件DSL・称号から読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          "life.prayed": (state.counters["life.prayed"] ?? 0) + 1,
          "life.alms": (state.counters["life.alms"] ?? 0) + (event.alms ?? 0),
        },
      };
    }
    case "bonded": {
      // 相手ごとの仲の値を条件DSLから読めるようにカウンタにも写す
      if (event.amount === 0) return state;
      return {
        ...state,
        counters: {
          ...state.counters,
          [`bond.${event.npc}`]: event.total,
        },
      };
    }
    case "errandDone": {
      // 依頼の達成：通算・依頼ごと・今日（日限と日の上限の基準）
      const dailyN =
        (state.counters["errand.daily.day"] === state.time.day
          ? state.counters["errand.daily.n"]
          : 0) ?? 0;
      return {
        ...state,
        counters: {
          ...state.counters,
          "errand.done": (state.counters["errand.done"] ?? 0) + 1,
          [`errand.done.${event.id}`]: (state.counters[`errand.done.${event.id}`] ?? 0) + 1,
          [`errand.day.${event.id}`]: state.time.day,
          "errand.daily.day": state.time.day,
          "errand.daily.n": dailyN + 1,
        },
      };
    }
    case "journeyArrived": {
      // 旅の累計（旅慣れを条件DSLから読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          "journey.count": (state.counters["journey.count"] ?? 0) + 1,
        },
      };
    }
    // ---- 技の進化・合成・ユニーク（K-03、09 §7）：累計を刻む ----
    case "artEvolved": {
      // 進化した回数と進化形ごとの回数（条件DSL・記録から「N回形を変えた」を読める。
      // 隠し分岐は別刻み —— 「まれな形」そのものが次の響き合いの材料になりうる）
      return {
        ...state,
        counters: {
          ...state.counters,
          "art.evolved": (state.counters["art.evolved"] ?? 0) + 1,
          ...(event.hidden
            ? { "art.evolved.hidden": (state.counters["art.evolved.hidden"] ?? 0) + 1 }
            : {}),
        },
      };
    }
    case "artSynthesized": {
      // 響き合いで生まれた技の累計（「組み合わせの経験」を条件DSLから読める）
      return {
        ...state,
        counters: {
          ...state.counters,
          "art.synthesized": (state.counters["art.synthesized"] ?? 0) + 1,
        },
      };
    }
    case "uniqueGained": {
      // 自分が得たユニークの累計（「世界で一人だけ」の実績の刻印）
      return {
        ...state,
        counters: {
          ...state.counters,
          "unique.gained": (state.counters["unique.gained"] ?? 0) + 1,
        },
      };
    }
    case "uniqueClaimed": {
      // ライバルに先取られたユニークの累計（世界が動いた記録）
      return {
        ...state,
        counters: {
          ...state.counters,
          "unique.claimed": (state.counters["unique.claimed"] ?? 0) + 1,
        },
      };
    }
    default:
      return state;
  }
};

/** step() がイベントごとに順に呼ぶ購読者の一覧 */
export const subscribers: readonly Subscriber[] = [counterSubscriber];
