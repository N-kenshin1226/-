import { subscribers, type ActionEvent } from "./events/index.js";
import { consolidateSleep, type InnRank, type SleepConfig } from "./growth/consolidate.js";
import { computeGain, recentRepeats, type GainConfig } from "./growth/gain.js";
import type { GameState, SkillId } from "./state/types.js";
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
  gain: GainConfig;
  sleep: SleepConfig;
}

export type Command =
  | { type: "wait" }
  /** 宿で寝る。inn/dinner は睡眠の質（2要因のみ） */
  | { type: "sleep"; inn?: InnRank; dinner?: boolean }
  /** 訓練：安全だが挑戦係数に上限がある（02 §8）。difficulty は行動の難度 */
  | { type: "train"; skill: SkillId; difficulty: number; failed?: boolean };

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
      // 今日の行動が終わる前に未定着経験を定着させ、起床ログを作る
      const { state: rested, report } = consolidateSleep(
        next,
        command.inn ?? "normal",
        command.dinner ?? false,
        cfg.sleep,
      );
      next = rested;
      next.time = sleepTime(next.time);
      events.push({ type: "slept", from, to: next.time });
      events.push({ type: "wakeReport", report });
      break;
    }
    case "train": {
      const skill = next.player.skills[command.skill];
      if (!skill) throw new Error(`train: 未知のスキル ${command.skill}`);

      const repeats = recentRepeats(next.actionLog, "train", command.skill, cfg.gain.noveltyWindow);
      const { amount } = computeGain(
        {
          kind: "train",
          skill: skill.value,
          delta: command.difficulty - skill.value,
          repeats,
          potential: skill.potential,
          fatigue: next.player.fatigue,
          failed: command.failed,
          isTraining: true,
        },
        cfg.gain,
      );
      skill.pending += amount;
      skill.lastUsedDay = next.time.day;
      next.time = advanceTime(next.time, cfg.time);
      events.push({
        type: "actionPerformed",
        kind: "train",
        day: next.time.day,
        target: command.skill,
      });
      events.push({ type: "gainApplied", skill: command.skill, amount });
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
