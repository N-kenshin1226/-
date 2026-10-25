import { subscribers, type ActionEvent } from "./events/index.js";
import type { GameState } from "./state/types.js";
import { advance as advanceTime, sleep as sleepTime, type TimeConfig } from "./time/index.js";

/**
 * step(state, command, cfg) → { state, events }
 * 純粋関数：入力の state を変更しない。docs/04_tech_and_devin.md §2 原則2。
 * cfg は balance.json 由来（数値をコードに直書きしない）。
 */

export interface StepConfig {
  time: TimeConfig;
  /** actionLog の保持上限（balance.json state.actionLogMax） */
  actionLogMax: number;
}

export type Command = { type: "wait" } | { type: "sleep" };

export interface StepResult {
  state: GameState;
  events: ActionEvent[];
}

/** actionPerformed イベントを行動ログに追記し、上限で丸める */
function recordAction(state: GameState, event: ActionEvent, max: number): GameState {
  if (event.type !== "actionPerformed") return state;
  const entry = {
    day: event.day,
    kind: event.kind,
    ...(event.target ? { target: event.target } : {}),
  };
  const actionLog = [...state.actionLog, entry].slice(-max);
  return { ...state, actionLog };
}

export function step(state: GameState, command: Command, cfg: StepConfig): StepResult {
  // イミュータブル：入力のクローンだけを触る。
  // GameState はシリアライズ可能なプレーンオブジェクトなので JSON 往復で複製する
  // （structuredClone は DOM/node 型依存を core に持ち込まないため避ける）
  let next = JSON.parse(JSON.stringify(state)) as GameState;
  const events: ActionEvent[] = [];

  switch (command.type) {
    case "wait": {
      next.time = advanceTime(next.time, cfg.time);
      events.push({ type: "actionPerformed", kind: "wait", day: next.time.day });
      break;
    }
    case "sleep": {
      const from = next.time;
      next.time = sleepTime(next.time);
      events.push({ type: "slept", from, to: next.time });
      break;
    }
  }

  // イベントを購読者に流して派生状態を更新し、行動ログを記録する
  for (const event of events) {
    for (const sub of subscribers) next = sub(next, event);
    next = recordAction(next, event, cfg.actionLogMax);
  }

  return { state: next, events };
}
