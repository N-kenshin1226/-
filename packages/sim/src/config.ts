import { balance, tailwinds, titles } from "@trace/content";
import type { StepConfig } from "@trace/core";

/** balance.json とコンテンツJSONから実行時の StepConfig を組み立てる */
export function stepConfig(): StepConfig {
  return {
    time: balance.time,
    actionLogMax: balance.state.actionLogMax,
    gain: balance.gain,
    sleep: balance.sleep,
    tailwind: { defs: tailwinds.tailwinds, ...balance.tailwind },
    body: balance.body,
    titles: titles.titles.map((t) => ({ id: t.id, rank: t.rank, condition: t.condition })),
  };
}

export interface SimClock {
  /** 1行動あたりの実時間（分） */
  minutesPerAction: number;
  /** 1回の睡眠あたりの実時間（分） */
  minutesPerSleep: number;
}

export function simClock(): SimClock {
  return balance.sim;
}
