import type { GameState } from "../state/types.js";
import type { GameTime } from "../time/index.js";

/**
 * ActionEvent — step() が発行する出来事。称号・作品台帳・通知・統計などの
 * 購読者がこれを受け取って派生状態を更新する（docs/04 §2 原則3）。
 */

export type ActionEvent =
  /** 行動を消化した。kind はコマンド側の分類、target は行動の相手 */
  | { type: "actionPerformed"; kind: string; day: number; target?: string }
  /** 睡眠した。from/to は GameTime */
  | { type: "slept"; from: GameTime; to: GameTime };

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
  }
};

/** step() がイベントごとに順に呼ぶ購読者の一覧 */
export const subscribers: readonly Subscriber[] = [counterSubscriber];
