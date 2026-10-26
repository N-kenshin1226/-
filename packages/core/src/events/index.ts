import {
  crisisAttemptFlag,
  crisisJoinFlag,
  crisisOfferFlag,
  CRISIS_HERO_FLAG,
} from "../crisis/index.js";
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
  /** 睡眠した。from/to は GameTime */
  | { type: "slept"; from: GameTime; to: GameTime }
  /** 未定着経験を得た。amount は今回の増分 */
  | { type: "gainApplied"; skill: string; amount: number }
  /** 起床ログの構造化データ（睡眠時に発行） */
  | { type: "wakeReport"; report: WakeReport }
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
  | { type: "occasionAttempted"; id: string; kind: string; score: number; won: boolean };

/** 派生状態を更新する購読者。純粋関数：新しい state を返す */
export type Subscriber = (state: GameState, event: ActionEvent) => GameState;

/** カウンタを数える購読者（`action.<kind>`、`action.total`、`days.slept`、`title.total`、`society.offer.<id>`、`mentor.session.<id>`） */
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
    case "mentorTrained": {
      // 師匠ごとの稽古回数を数える（条件DSLから「師匠の元でN回稽古」を読める。T-27）
      const key = `mentor.session.${event.id}`;
      return {
        ...state,
        counters: { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 },
      };
    }
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
    default:
      return state;
  }
};

/** step() がイベントごとに順に呼ぶ購読者の一覧 */
export const subscribers: readonly Subscriber[] = [counterSubscriber];
