import {
  artDefs,
  atoms,
  balance,
  books,
  canon,
  cliText,
  crisisTypes,
  discoveries,
  incidents,
  items,
  life,
  mentors,
  npcLifecycle,
  occasions,
  pinnacles,
  rivals,
  skills,
  society,
  tailwinds,
  titles,
  voices,
  vows,
  weapons,
  weather,
} from "@trace/content";
import { loadHiddenCrises } from "@trace/content/hidden";
import { drawRivalCast, type CrisisConfig, type StepConfig } from "@trace/core";

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
    /** 戦闘（K-01）：武器表と技能リンクを注入（武器技能・持ち替え・リンク係数が効く） */
    combat: {
      ...balance.combat,
      weapons: Object.fromEntries(weapons.weapons.map((w) => [w.id, w])),
      links: balance.links,
      /** 武技・資源（K-02）：技の定義表とバランス係数（使用記録・気力・構成が効く） */
      arts: { defs: artDefs, ...balance.arts },
    },
    /** 技能リンク（K-01、balance.links）：仕事・移動・読書・危機などのフック */
    links: balance.links,
    /** 武器の定義表（K-01、weapons.json）：戦闘経験の武器技能解決に使う */
    weapons: Object.fromEntries(weapons.weapons.map((w) => [w.id, w])),
    /** 旧セーブに無い技能への経験用（K-01、balance.player.initialPotential） */
    initialSkillPotential: balance.player.initialPotential,
    /**
     * 武技・資源・構成（K-02、balance.arts ＋ arts.json の defs）：
     * 戦闘の使用記録の畳み込み・技の習得・睡眠での気力/魔力回復・setBuild が効く
     */
    arts: { defs: artDefs, ...balance.arts },
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
    /**
     * 日々の出来事（F-05）：incidents.json の出来事表＋balance.incidents の
     * 頻度・間隔係数＋話し手の名簿（voices/rivals/mentors）を注入する
     */
    incidents: {
      incidents: incidents.incidents,
      ...balance.incidents,
      npcs: voices.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role })),
      rivals: {
        names: rivals.names,
        epithets: rivals.epithets,
        size: balance.rivals.size,
        scoreMin: balance.rivals.scoreMin,
        scoreMax: balance.rivals.scoreMax,
        growthPerDay: balance.rivals.growthPerDay,
      },
      mentors: mentors.mentors,
    },
    /** 隠し要素（X-11、docs/03 §5。content/discoveries.json の発見表） */
    discoveries: discoveries.discoveries,
    /**
     * 天候（X-13、docs/03 §2・§5）：weather.json の種類表＋balance.weather の
     * 注文係数。空は seed+day から導出する値 —— {weather} 条件の判定・
     * 注文の日替わり係数・起床レポートと新聞の風景の行に使う
     */
    weather: { kinds: weather.kinds, orderPrice: balance.weather.orderPrice },
    /** 移動（P-01、docs/03 §2）：街の外への移動が消費する行動数 */
    travel: balance.travel,
    /**
     * NPCの歳月（X-12、docs/07 §3）：npc_lifecycle.json の出来事表＋師匠の人物
     * 紐付け（mentors.json の npc）＋表示名の解決。ライバル（rival.<index>）の名は
     * 世界シードの抽選から —— ランキング・危機の英雄と同じ顔ぶれになる
     */
    npcLife: {
      npcs: npcLifecycle.npcs,
      mentors: mentors.mentors,
      name: (state, npcId) => {
        if (npcId.startsWith("rival.")) {
          const index = Number.parseInt(npcId.slice("rival.".length), 10);
          return drawRivalCast(
            state.seed,
            { names: rivals.names, epithets: rivals.epithets },
            balance.rivals,
          )[index]?.name;
        }
        return voices.npcs.find((n) => n.id === npcId)?.name;
      },
    },
    /**
     * 揺らぎ（R-01）：経験・仕事・市場・人・体調の決定的な揺らぎ。
     * 文面は cli.json から注入する
     */
    variance: {
      ...balance.variance,
      texts: {
        insight: cliText.text.wake.insight,
        conditionGood: cliText.text.wake.conditionGood,
        conditionPoor: cliText.text.wake.conditionPoor,
      },
    },
    /**
     * 日々の営み（P-02「行動の種類を増やす」）：life.json の定義表＋
     * balance.life の係数。到着の文面は cli.json から注入する
     */
    life: {
      towns: life.towns,
      journeys: life.journeys,
      stroll: life.stroll,
      gather: life.gather,
      recipes: life.recipes,
      market: life.market,
      gamble: life.gamble,
      social: life.social,
      errands: life.errands,
      ...balance.life,
      texts: { arrive: cliText.text.life.arrive },
    },
    /** 品物の定義表（P-02、items.json。市場・料理・贈り物に使う） */
    items: Object.fromEntries(items.items.map((i) => [i.id, i])),
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
