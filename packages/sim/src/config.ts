import {
  atoms,
  balance,
  books,
  canon,
  cliText,
  mentors,
  skills,
  society,
  tailwinds,
  titles,
} from "@trace/content";
import type { StepConfig } from "@trace/core";

/** balance.json とコンテンツJSONから実行時の StepConfig を組み立てる */
export function stepConfig(): StepConfig {
  return {
    time: balance.time,
    actionLogMax: balance.state.actionLogMax,
    gain: balance.gain,
    sleep: {
      ...balance.sleep,
      rust: {
        ...balance.rust,
        texts: {
          rusted: cliText.text.wake.rusted,
          relearning: cliText.text.wake.relearning,
        },
      },
    },
    tailwind: { defs: tailwinds.tailwinds, ...balance.tailwind },
    body: balance.body,
    /** 寿命・加齢（T-36）。文テンプレートは cli.json 由来（rust.texts と同じ注入） */
    aging: {
      ...balance.aging,
      texts: {
        warn: cliText.text.wake.agingWarn,
        severe: cliText.text.wake.agingSevere,
      },
    },
    ledger: balance.ledger,
    combat: balance.combat,
    society: {
      standings: society.standings,
      professions: society.professions,
      lifeGoals: society.lifeGoals,
      goalRewardFactor: balance.society.goalRewardFactor,
    },
    titles: titles.titles.map((t) => ({
      id: t.id,
      rank: t.rank,
      condition: t.condition,
      effect: t.effect,
    })),
    skillNames: Object.fromEntries(skills.skills.map((s) => [s.id, s.name])),
    skillUnlocks: skills.skills.flatMap((s) =>
      s.unlock ? [{ id: s.id, condition: s.unlock }] : [],
    ),
    books: { books: books.books, potentialMax: balance.body.potentialMax },
    mentors: { mentors: mentors.mentors, potentialMax: balance.body.potentialMax },
    lore: {
      atoms: atoms.map((a) => ({ id: a.id, reveals: a.reveals, unlock: a.unlock })),
      connections: canon.events
        .filter((e) => e.reward !== null)
        .map((e) => ({ eventId: e.id, facts: e.reward!.facts, flag: e.reward!.flag })),
    },
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
