import {
  atoms,
  balance,
  books,
  canon,
  cliText,
  crisisTypes,
  mentors,
  occasions,
  pinnacles,
  rivals,
  skills,
  society,
  tailwinds,
  titles,
  voices,
  vows,
} from "@trace/content";
import { loadHiddenCrises } from "@trace/content/hidden";
import type { CrisisConfig, StepConfig } from "@trace/core";

/**
 * 世界の危機の設定（W-01、docs/08 §9）。
 * hidden/crises の型があればそれを使い、無ければ公開サンプルに倒す。
 * 係数は balance.crisis 由来
 */
export function crisisConfig(): CrisisConfig {
  const inv = balance.crisis.involvement;
  return {
    types: crisisTypes(loadHiddenCrises()),
    strongFields: balance.crisis.strongFields,
    weakFieldFactor: balance.crisis.weakFieldFactor,
    /** 接点（W-02）：日常へ混ざる量と寄与の係数 */
    touchpoints: balance.crisis.touchpoints,
    /**
     * 関与（W-03、docs/08 §6）：係数は balance.crisis.involvement、
     * 名声の算出は balance.rivals、立場の順は society.standings、
     * 頂点ルートは pinnacles.json、ライバルの顔ぶれは rivals.json から注入する
     */
    involvement:
      inv === undefined
        ? undefined
        : {
            ...inv,
            renown: balance.rivals,
            pinnacles: pinnacles.pinnacles,
            standings: society.standings.map((s) => s.id),
            rivals: {
              ...inv.rivals,
              names: rivals.names,
              epithets: rivals.epithets,
              heroEpithets: rivals.crisis?.heroEpithets ?? [],
              size: balance.rivals.size,
            },
          },
  };
}

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
    /** 継承（T-39）。遺物の gainVs 係数 */
    legacy: { artifactGainFactor: balance.legacy.artifactGainFactor },
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
    /** 頂点ルート（T-41。content/pinnacles.json の条件鎖） */
    pinnacles: pinnacles.pinnacles,
    /** 街への寄付（X-9 領主ルート。1口の額は balance.town.donationAmount） */
    donation: { amount: balance.town.donationAmount },
    /** 運命の傾向・誓約（T-45/T-46。balance.tendency + vows.json の世界補正表） */
    tendency: balance.tendency,
    vows: vows.vows,
    /** 世界の危機（W-01、docs/08。hidden/crises があればそれ、なければ公開サンプル） */
    crisis: crisisConfig(),
    /**
     * 勝負所の行事（X-10、docs/03 §2。occasions.json の行事表＋balance.occasions の
     * 頻度・間隔係数＋話し手の名簿（voices/rivals）を注入する）
     */
    occasions: {
      occasions: occasions.occasions,
      ...balance.occasions,
      npcs: voices.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role })),
      rivals: {
        names: rivals.names,
        epithets: rivals.epithets,
        size: balance.rivals.size,
        scoreMin: balance.rivals.scoreMin,
        scoreMax: balance.rivals.scoreMax,
        growthPerDay: balance.rivals.growthPerDay,
      },
    },
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
