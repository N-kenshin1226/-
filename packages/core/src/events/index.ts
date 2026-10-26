import type { GameState, Work } from "../state/types.js";
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
    };

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
    default:
      return state;
  }
};

/** step() がイベントごとに順に呼ぶ購読者の一覧 */
export const subscribers: readonly Subscriber[] = [counterSubscriber];
