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
  /** 気配：S候補に近づいた合図（条件は明かさない。03 §6） */
  | { type: "kehai" }
  /** 立場・職業の打診が来た（通知Aランク相当。03 §1） */
  | { type: "offerReceived"; kind: "standing" | "profession"; id: string }
  /** 打診を受けて認定された */
  | { type: "offerAccepted"; id: string }
  /** 人生目標を宣言した */
  | { type: "goalDeclared"; id: string }
  /** 宣言した人生目標を達成した（報酬済み） */
  | { type: "goalAchieved"; id: string };

/** 派生状態を更新する購読者。純粋関数：新しい state を返す */
export type Subscriber = (state: GameState, event: ActionEvent) => GameState;

/** カウンタを数える購読者（`action.<kind>`、`action.total`、`days.slept`） */
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
    default:
      return state;
  }
};

/** step() がイベントごとに順に呼ぶ購読者の一覧 */
export const subscribers: readonly Subscriber[] = [counterSubscriber];
