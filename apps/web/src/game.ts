/**
 * Web 版のゲームセッション層（docs/04 §2：UIはcoreを呼ぶだけ）。
 * ルールはすべて core、数値は content、ここでは画面遷移と表示用の整形だけを行う
 */
import {
  abyssRunSeed,
  activeBookEffects,
  activeEffects,
  WORLD_RECIPE,
  appraisalGame,
  attackFactorWithEnchant,
  biographyMaterial,
  bossName,
  canAct,
  canFightUnique,
  createRng,
  describe,
  effectiveGraceDays,
  endRun,
  floorEnemy,
  killFloor,
  spendLight,
  startRun,
  enhancedEnemy,
  damageFactor,
  deserialize,
  deserializeChronicle,
  emptyChronicle,
  fishingGame,
  hasLifeRecord,
  legacyOf,
  miningGame,
  negotiationGame,
  newGame,
  nextWorldSeed,
  performanceGame,
  playerAptitudes,
  reachedPinnacles,
  recordLife,
  rivalsOf,
  rustedValue,
  serialize,
  serializeChronicle,
  simpleJudgmentQuality,
  sleepQuality,
  smithingGame,
  startCombat,
  step,
  succeedLife,
  suggestGoals,
  synthesisHintOf,
  telegraphLines,
  combatResult,
  combatIntent,
  combatTurn,
  showdownOrderOf as coreShowdownOrderOf,
  specialOrderOf as coreSpecialOrderOf,
  TENDENCY_IDS,
  TemplateProvider,
  crisisAreaClosed,
  crisisEnding,
  crisisEnemyChallengeBonus,
  crisisEnemyMods,
  crisisEpilogue,
  crisisFinaleOffers,
  crisisInvolvement,
  crisisOfferSpeaker,
  crisisRivalName,
  crisisSceneHaze,
  crisisStageLine,
  crisisTouchpointOf,
  crisisTouchpointOffers,
  crisisTypeOf,
  dailyDiscoveryHint,
  discoveryHintText,
  drawRivalCast,
  incidentDef,
  incidentPendingChoice,
  incidentSpeaker,
  npcAway,
  npcGoneReason,
  npcLifeRecent,
  npcLifeToday,
  occasionDef,
  occasionOffers,
  occasionSpeaker,
  rollIndividual,
  bossEnemy,
  dgCampKey,
  dgClearedKey,
  dgProgress,
  roomAt,
  rollTrap,
  scaleRoomEnemy,
  bondOf,
  errandsFor as coreErrandsFor,
  itemPrice,
  marketStock as coreMarketStock,
  repOf,
  townOf,
  marketFactor,
  weatherOf,
  weaponDefOf,
  withWorldMods,
  worldFactor,
  worldMods,
  // 地方の地図と旅（G-02、docs/10 §7）
  crisisRoadClosed,
  journeyCost,
  journeyDaysFor,
  journeyIdOf,
  journeyWaysOf,
  mapKnownSet,
  mapVisited,
  mergeLifeContrib,
  roadEncounter,
  roadEncounterDayKey,
  roadKindOf,
  roadSeasonClosed,
  type AbyssRun,
  type ActionEvent,
  type BoardInput,
  type BoardState,
  type Chronicle,
  type CrisisEnding,
  type CombatAction,
  type CombatPlayer,
  type CombatState,
  type DealInput,
  type DealState,
  type ArtDef,
  type EnemyDef,
  type EnemyTrait,
  type GameState,
  type HeirKind,
  type IncidentOffer,
  type Legacy,
  type LifeCause,
  type LifeConfig,
  type MiniGameCtx,
  type NewGameConfig,
  type JourneyWay,
  type Rng,
  type StepConfig,
  type TendencyId,
  type TimeOfDay,
  type TimingInput,
  type TimingState,
  type WindDirection,
  type Work,
  type WakeReport,
} from "@trace/core";
import {
  artDefs,
  atoms,
  balance,
  books,
  canon,
  cliText,
  crisisTypes,
  discoveries,
  enemies,
  enemiesByArea,
  incidents,
  items,
  k03Resolve,
  k03Sample,
  life,
  mentors,
  narration,
  npcLifecycle,
  occasions,
  orders,
  origins,
  pinnacles,
  places,
  rivals,
  sampleCrises,
  skills,
  society,
  spellDefs,
  tailwinds,
  titles,
  voices,
  vows,
  weapons,
  weather,
  world as worldContent,
  type EnemyJson,
  type Order,
  type Origin,
  type WeaponJson,
} from "@trace/content";
import type { SoundId } from "./fx/sound.js";
import {
  genLifeContrib,
  genWorld,
  mentorsAtPlace,
  mentorsOf,
  npcExistsIn,
  occasionStandIn,
  npcListOf,
  npcNameOf,
  placeOfState,
  placesOf,
  townNameOf,
  townPlacesOf,
  voiceNpcsOf,
  type PlaceLike,
  type VoiceLike,
} from "./world.js";

export const t = cliText;

/**
 * 世界の危機の型一覧（W-01）。本番は hidden/crises 同梱の本番の型（crisisTypes()）。
 * e2e は ?crisis=sample で公開サンプルに固定できる —— 危機の振る舞いを検証する
 * 仕掛けが hidden の中身（変わることがある）に左右されないようにするための口
 */
const crisisTypeList: ReturnType<typeof crisisTypes> = (() => {
  const q =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("crisis");
  return q === "sample" ? crisisTypes(sampleCrises) : crisisTypes();
})();

/** 武器の定義表（K-01、weapons.json → id 引き。武器屋・戦闘・新規開始で共有） */
export const weaponList = weapons.weapons;
export const weaponDefs: Record<string, WeaponJson> = Object.fromEntries(
  weapons.weapons.map((w) => [w.id, w]),
);

/**
 * K-03 の解決済みデータ（docs/09 §7）：進化形・隠し分岐・合成産物・
 * ユニークを含む全技の定義表と、分岐・レシピ・ユニークの表。
 * 本番は hidden/k03 同梱分（k03Resolve() で bundled → sample に倒す）。
 * e2e は ?k03=sample で公開サンプルに固定できる（?crisis=sample と同じ口）
 */
const k03: ReturnType<typeof k03Resolve> = (() => {
  const q =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("k03");
  return q === "sample" ? k03Resolve(k03Sample) : k03Resolve();
})();

/**
 * 武技・呪文の定義表（K-02 arts.json ＋ M-01 spells.json → id 引き、
 * K-03 の派生・特別な技を含む。構成画面・戦闘・ステータス・習得の知らせで共有。
 * 呪文は sp_ 始まり）。core の ArtDef として扱う —— 武技側には spell 面が
 * 無いので、呪文かどうかは def.spell の有無で見る
 */
export const allArtDefs: Record<string, ArtDef> = k03.defs;
export { artDefs, spellDefs };

export const cfg: StepConfig = {
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
  /**
   * 戦闘（K-01）：武器表（weapons.json）と技能リンク（balance.links）を注入する。
   * 武器技能の選択・武器ごとの補正・戦闘中の持ち替え・リンク係数が効く
   */
  combat: {
    ...balance.combat,
    weapons: weaponDefs,
    links: balance.links,
    /**
     * 武技・資源（K-02）：技の定義表（arts.json）とバランス係数（balance.arts）。
     * 武技の消費・状態異常・部位破壊・パッシブが戦闘で効く
     */
    arts: { defs: allArtDefs, ...balance.arts },
    /**
     * 魔法（M-01、balance.magic）：呪文は魔力消費・詠唱・中断・属性相性が効き、
     * 敵の呪文は見取り稽古で覚えられる
     */
    magic: balance.magic,
  },
  /** 技能リンク（K-01、balance.links）：step の各フック（仕事・移動・読書・危機…）が引く */
  links: balance.links,
  /** 武器の定義表（K-01、weapons.json）：購入・持ち替え・戦闘経験の解決に使う */
  weapons: weaponDefs,
  /** 旧セーブに無い技能へ経験が入るときの新規レコードの素質（K-01） */
  initialSkillPotential: balance.player.initialPotential,
  /**
   * 武技・資源・構成（K-02）：戦闘の使用記録・技の経験・習得判定・
   * 睡眠での気力/魔力回復・setBuild の組み替えが効く
   */
  arts: { defs: allArtDefs, ...balance.arts },
  /** 魔法（M-01、balance.magic）：魔力の書き戻し・生活魔法・付与が step で効く */
  magic: balance.magic,
  /**
   * 技の進化（K-03、09 §7.1）：Lv10 に達した技が使い方の記録と最も合う
   * 分岐へ形を変える。隠し分岐の表は k03 の解決済みデータから注入する
   */
  evolution: { ...balance.evolution, hidden: k03.hiddenBranches },
  /**
   * 技の合成（K-03、09 §7「響き合い」）：技・技能・刻印が揃うと新しい技が
   * 生まれる。レシピの条件は伏せられたまま —— ヒントだけが噂に載る
   */
  synthesis: { recipes: k03.recipes },
  /**
   * ユニークスキル（K-03、09 §7「その世界で一人だけ持てる技」）：
   * 厳しい条件で得るが、眠りのあいだにライバルが先取りしうる
   */
  uniques: { uniques: k03.uniques, rivalSize: balance.rivals.size },
  society: {
    standings: society.standings,
    professions: society.professions,
    lifeGoals: society.lifeGoals,
    goalRewardFactor: balance.society.goalRewardFactor,
  },
  lore: {
    atoms: atoms.map((a) => ({ id: a.id, reveals: a.reveals, unlock: a.unlock })),
    connections: canon.events
      .filter((e) => e.reward !== null)
      .map((e) => ({ eventId: e.id, facts: e.reward!.facts, flag: e.reward!.flag })),
  },
  titles: titles.titles.map((x) => ({
    id: x.id,
    rank: x.rank,
    condition: x.condition,
    effect: x.effect,
  })),
  skillNames: Object.fromEntries(skills.skills.map((s) => [s.id, s.name])),
  skillUnlocks: skills.skills.flatMap((s) => (s.unlock ? [{ id: s.id, condition: s.unlock }] : [])),
  books: { books: books.books, potentialMax: balance.body.potentialMax },
  mentors: { mentors: mentors.mentors, potentialMax: balance.body.potentialMax },
  /** 継承（T-39）。遺物の gainVs 係数 */
  legacy: { artifactGainFactor: balance.legacy.artifactGainFactor },
  /** 頂点ルート（T-41。content/pinnacles.json の条件鎖） */
  pinnacles: pinnacles.pinnacles,
  /** 街への寄付（X-9 領主ルート。1口の額は balance.town.donationAmount） */
  donation: { amount: balance.town.donationAmount },
  /** 運命の傾向・誓約（T-45/T-46。balance.tendency + vows.json の世界補正表） */
  tendency: balance.tendency,
  vows: vows.vows,
  /**
   * 世界の危機（W-01、docs/08）。ブラウザ経路は hidden/crises/types.json を
   * 静的 import した本番の型を使う（e2e は ?crisis=sample で公開サンプルに固定）
   */
  crisis: {
    types: crisisTypeList,
    strongFields: balance.crisis.strongFields,
    weakFieldFactor: balance.crisis.weakFieldFactor,
    /** 接点（W-02）：日常へ混ざる量と寄与の係数 */
    touchpoints: balance.crisis.touchpoints,
    /**
     * 関与（W-03、docs/08 §6）：係数は balance.crisis.involvement、
     * 名声・立場・頂点・ライバルの顔ぶれはコンテンツから注入する
     */
    involvement:
      balance.crisis.involvement === undefined
        ? undefined
        : {
            ...balance.crisis.involvement,
            renown: balance.rivals,
            pinnacles: pinnacles.pinnacles,
            standings: society.standings.map((s) => s.id),
            rivals: {
              ...balance.crisis.involvement.rivals,
              names: rivals.names,
              epithets: rivals.epithets,
              heroEpithets: rivals.crisis?.heroEpithets ?? [],
              size: balance.rivals.size,
            },
          },
    /** 段階の離散・死亡はこの世界に居る人物に限る（X-19。生成地方では canon の人物は居ない） */
    npcExists: npcExistsIn,
  },
  /**
   * 勝負所の行事（X-10、docs/03 §2。occasions.json の行事表＋balance.occasions の
   * 頻度・間隔係数＋話し手の名簿（voices/rivals）を注入する）
   */
  occasions: {
    occasions: occasions.occasions,
    ...balance.occasions,
    npcs: voices.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role })),
    /** 生成地方に canon の持ちかけ人は居ない —— 役割の近い住人が代わる（X-21） */
    speakerSubstitute: occasionStandIn,
    rivals: {
      names: rivals.names,
      epithets: rivals.epithets,
      size: balance.rivals.size,
      scoreMin: balance.rivals.scoreMin,
      scoreMax: balance.rivals.scoreMax,
      growthPerDay: balance.rivals.growthPerDay,
    },
  },
  /**
   * 日々の出来事（F-05）：incidents.json の出来事表＋balance.incidents の
   * 頻度・間隔係数＋話し手の名簿（voices/rivals/mentors）を注入する。
   * 行動の合間に差し込まれる会話の挿話 —— 勝負所の行事とは別物（行動を消費しない）
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
    /** 歳月の出来事はこの世界に居る人物に限る（X-20。生成地方では
     *  canon の人物は居ない。ライバルは世界シードの抽選で常に居る） */
    npcExists: npcExistsIn,
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
   * 文面（冴え・体調の起床行）は cli.json から注入する
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
   * 日々の営み（P-02「行動の種類を増やす」）：life.json の定義表（町・道・
   * 散策・採集・料理・市場・賭け・人との時間・掲示板）＋balance.life の係数。
   * 到着の文面は cli.json から注入する
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
    // 文面（到着・朝刊の噂）は cli.json から注入する（G-02）
    texts: { arrive: cliText.text.life.arrive, newsHeard: cliText.text.life.newsHeard },
  },
  /** 品物の定義表（P-02、items.json の id → 定義。市場・料理・食事・贈り物に使う） */
  items: Object.fromEntries(items.items.map((i) => [i.id, i])),
  /** 敵の戦利品表（G-04。撃破ごとの決定的な抽選でモンスター素材が落ちる） */
  enemyDrops: Object.fromEntries(
    enemies.enemies.filter((e) => e.drops !== undefined).map((e) => [e.id, e.drops!]),
  ),
  /**
   * 有限迷宮（G-03、balance.dungeons の潜り側の係数）：1回の潜りの行動消費と
   * 迷宮内野営の眠りの質。迷宮の場所 id 一覧は cfgFor で生成世界から畳む
   */
  dungeons: { diveCost: balance.dungeons.diveCost, campQuality: balance.dungeons.campQuality },
};

/**
 * 条件DSLの評価環境（X-13）：{weather} など state に無い語彙の判定に使う
 * コンテンツ設定。step 内の判定と同じものを、画面側（棚・打診・接点の一覧）
 * の評価にも渡す
 */
export const condEnv = cfg.weather !== undefined ? { weather: cfg.weather } : undefined;

/** 運命の傾向の選択肢（T-45。UI で3択を出す用） */
export const tendencyIds = TENDENCY_IDS;
/** 誓約の定義一覧（T-46。UI で複数選択を出す用） */
export const vowList = vows.vows;

export const skillList = skills.skills;
export const orderList = orders.orders;
export const enemyList = enemies.enemies;
/** 狩り画面用：エリア別の敵グループ（T-23。エリアの並びは出現順） */
export const enemyAreas = enemiesByArea(enemies);
export const atomList = atoms;
export const societyDefs = society;
/** 頂点ルートの定義一覧（表示は画面側で visiblePinnacles に通す。X-9 隠しルート対応） */
export const pinnacleList = pinnacles.pinnacles;
export const bookList = books.books;
export const mentorList = mentors.mentors;
export const narrator = new TemplateProvider(narration);

/* ── 場所（P-01、docs/03 §2） ──
 * 街の中の場所は見取り図から選び、場所ごとに景色・住人・行動が変わる。
 * 街の外（region）は門から出て行く —— 移動は行動を消費する（core の travel）。
 * 「どこに何があるか」は places.json が持ち、ここでは引くだけ */

export const placeList = places.places;
/** 街の中の場所（見取り図に印が出る。並びは places.json 順） */
export const townPlaces = placeList.filter((p) => p.kind === "town");
/** 街の外の地域（門から出て行く先） */
export const regionPlaces = placeList.filter((p) => p.kind === "region");

/**
 * 場所の定義（G-01）：固定マップは places.json、生成地方は seed から
 * 引き直した生成物を返す。画面は state を渡すだけで地図の出所を意識しない
 */
export function placeOf(state: GameState, id: string | undefined): PlaceLike | undefined {
  return placeOfState(state, id);
}
export function placeName(state: GameState, id: string | undefined): string {
  return placeOf(state, id)?.name ?? id ?? "";
}

/** 場所に居る師匠（npcs と師匠定義の人物紐付けで見る。生成地方は生成の師匠） */
export function mentorsAt(state: GameState, place: PlaceLike) {
  return mentorsAtPlace(state, place);
}

/**
 * 場所に届く注文の技能か（work 行動の kinds。default の受け皿は
 * 「どこにも割り当たっていない注文」だけを受ける）
 */
export function placeTakesKind(state: GameState, place: PlaceLike, kind: string): boolean {
  const work = place.actions.filter((a) => a.type === "work");
  if (work.some((a) => a.kinds?.includes(kind))) return true;
  if (!work.some((a) => a.default === true)) return false;
  return !placesOf(state).some(
    (p) => p.id !== place.id && p.actions.some((a) => a.type === "work" && a.kinds?.includes(kind)),
  );
}

/** 街の外への移動が消費する行動数（balance.travel。街の中は 0） */
export function travelOutCost(): number {
  return cfg.travel?.outsideCost ?? 1;
}

/* ── 日々の営み（P-02「行動の種類を増やす」） ──
 * 町・品物・仲・掲示板・旅の表示ヘルパー。値段・抽選は core が持ち、
 * ここでは表示名の解決と一覧の選択だけを行う */

export { canErrand, itemCount, journeying, mealToday, prayedToday, townOf } from "@trace/core";

/** 品物の定義表（items.json → id 引き） */
export const itemDefs = cfg.items ?? {};
/** 品物の表示名（未定義は id のまま返す） */
export function itemName(id: string): string {
  return itemDefs[id]?.name ?? id;
}
/**
 * この state の世界での日々の営みの定義表（G-01）。
 * 固定マップは life.json のまま。生成地方では生成の寄与分（町表・道・
 * 型別散策表・採集・市場・掲示依頼・場所の帰属・地点の表）で差し替え、
 * 料理・賭け・人との時間・係数は共通のものをそのまま使う。
 * 評判（rep）は生成地方でだけ働く（固定マップは rep を持たない）
 */
export function lifeCfgFor(state: GameState): LifeConfig | undefined {
  if (cfg.life === undefined) return undefined;
  const gen = genLifeContrib(state);
  if (gen === null) return cfg.life;
  // 生成の寄与分を畳み込む（G-01/G-02。町・道・掲示・採集は生成の表、
  // 型別散策表は基本表の上に乗る。rep は生成地方でだけ働く）
  return mergeLifeContrib(cfg.life, gen, balance.world.rep);
}

/**
 * この state の世界に合わせた StepConfig（G-01）。生成地方では営みの表・
 * 師匠・話し手の名簿がその世界のものになる。それ以外は共通の cfg
 */
export function cfgFor(state: GameState): StepConfig {
  const gen = genWorld(state);
  if (gen === null) return cfg;
  const lifeCfg = lifeCfgFor(state);
  const npcs = npcListOf(state);
  const mentorDefs = mentorsOf(state);
  return {
    ...cfg,
    ...(lifeCfg !== undefined ? { life: lifeCfg } : {}),
    /** この世界に生成された迷宮の id（dg<連番>。存在しない id の潜りは記録しない） */
    dungeonIds: gen.dungeons.map((d) => d.id),
    ...(cfg.mentors !== undefined ? { mentors: { ...cfg.mentors, mentors: mentorDefs } } : {}),
    ...(cfg.incidents !== undefined ? { incidents: { ...cfg.incidents, npcs } } : {}),
    ...(cfg.occasions !== undefined ? { occasions: { ...cfg.occasions, npcs } } : {}),
    ...(cfg.npcLife !== undefined
      ? {
          npcLife: {
            ...cfg.npcLife,
            // 生成の住人の歳月（X-22。canon 定義は npcExists で自然に
            // 除かれ、生成の住人の節目とライバルの歳月だけが動く）
            npcs: [
              ...npcLifecycle.npcs,
              ...gen.npcLife.map((e) => ({
                npcId: e.npcId,
                name: e.name,
                events: [
                  {
                    at: { time: { day: { eq: e.day } } },
                    kind: e.kind,
                    text: e.text,
                  },
                ],
              })),
            ],
            mentors: mentorDefs,
            name: (s: GameState, npcId: string) => {
              if (npcId.startsWith("rival.")) {
                const index = Number.parseInt(npcId.slice("rival.".length), 10);
                return drawRivalCast(
                  s.seed,
                  { names: rivals.names, epithets: rivals.epithets },
                  balance.rivals,
                )[index]?.name;
              }
              return npcNameOf(s, npcId);
            },
          },
        }
      : {}),
  };
}

/** 町の表示名（生成地方は生成の町名、固定マップは life.json towns） */
export function townName(state: GameState | undefined, id: string): string {
  if (state === undefined) return life.towns[id]?.name ?? id;
  return townNameOf(state, id);
}
/** 今いる町の見取り図に出る場所（town 欄の無い場所は基点の町に属する） */
export function townPlacesIn(state: GameState, town: string): PlaceLike[] {
  return townPlacesOf(state, town);
}
/** 今いる町に届く掲示板の依頼 */
export function errandsNow(state: GameState) {
  const life = lifeCfgFor(state);
  return life !== undefined ? coreErrandsFor(townOf(state), life) : [];
}
/**
 * 地域が危機で閉じられているか（W-01、docs/08）。
 * 固定マップは地域 id がそのまま敵の area タグ。生成地方は地域の"型"
 * （world.json の areaTypes —— 敵 area と同じ名札）で照合する（X-13。
 * closeAreas は "forest" のような型の名札で、生成地域の実体 id は合わない）
 */
export function areaClosedNow(state: GameState, id: string): boolean {
  if (crisisAreaClosed(state, cfg.crisis, id)) return true;
  const w = genWorld(state);
  // 名所は areas には載らない（地域の型は life.places の scene に従う —— X-25）
  const typeId =
    w?.areas.find((a) => a.id === id)?.typeId ??
    (w?.life.places[id]?.landmark === true ? w.life.places[id]?.type : undefined);
  return typeId !== undefined && crisisAreaClosed(state, cfg.crisis, typeId);
}

/** その町の市場に並ぶ品の id */
export function marketStockNow(state: GameState): string[] {
  const life = lifeCfgFor(state);
  return life !== undefined ? coreMarketStock(townOf(state), life) : [];
}
/** 品の相場（表示用。side は "buy"=店で買う / "sell"=店に売る。評判が効く） */
export function itemPriceNow(state: GameState, id: string, side: "buy" | "sell"): number {
  const def = itemDefs[id];
  const life = lifeCfgFor(state);
  if (def === undefined || life === undefined) return 0;
  const rep = repOf(state, townOf(state), life);
  return itemPrice(state.seed, state.time.day, id, townOf(state), side, life, def, rep);
}
/**
 * 市場の品がその町の特産（名産で安い）か品薄（割高）か。
 * townFactor に品ごとの明示エントリがあるものだけを "*"
 * （町全体の揺らぎ）と比べる —— その町の個性として語られる値だけを出す（X-12）
 */
export function marketNoteOf(state: GameState, id: string): "specialty" | "scarce" | null {
  const life = lifeCfgFor(state);
  if (life === undefined) return null;
  const f = life.market.townFactor[townOf(state)];
  const v = f?.[id];
  if (v === undefined) return null;
  const base = f?.["*"] ?? 1;
  return v < base ? "specialty" : v > base ? "scarce" : null;
}
/** 人物の表示名（生成地方の住人 → 生成名、固定マップ → voices.json） */
export function npcName(state: GameState | undefined, id: string): string {
  if (state === undefined) return voices.npcs.find((n) => n.id === id)?.name ?? id;
  return npcNameOf(state, id);
}
/** 人との仲の値（bonds 欄。上限は balance.life.bondMax） */
export function bondOfNow(state: GameState, npc: string): number {
  const life = lifeCfgFor(state);
  return life !== undefined ? bondOf(state, npc, life) : 0;
}
/** 旅の行き先の町名（旅の途中でなければ null） */
export function journeyDestName(state: GameState): string | null {
  return state.life.journey !== null ? townName(state, state.life.journey.to) : null;
}
/** 旅の行き来がある隣町の id（現在の町から。無ければ null） */
export function journeyTargetNow(state: GameState): string | null {
  const life = lifeCfgFor(state);
  if (life === undefined) return null;
  const town = townOf(state);
  const road = life.journeys.find((j) => j.from === town || j.to === town);
  if (road === undefined) return null;
  return road.from === town ? road.to : road.from;
}

/* ── 地方の地図（G-02、docs/10 §7） ──
 * 町・道・地域を地図画面に出すための解決層。霧の刻印（visited/heard）は
 * state.life.map、繋がり・閉鎖は LifeConfig と危機から導出する */

/** 通い方の表示名（徒歩・隊商・騎乗・船。省略は徒歩） */
export function journeyWayName(way: string | undefined): string {
  switch (way) {
    case "caravan":
      return t.text.wayCaravan;
    case "horse":
      return t.text.wayHorse;
    case "ship":
      return t.text.wayShip;
    default:
      return t.text.wayFoot;
  }
}

/** 地図上の名の解決（町は町名、地域は場所名。霧の中は "？" が返るよう呼び出し側で伏せる） */
export function mapPlaceName(state: GameState | undefined, id: string): string {
  if (state === undefined) {
    return life.towns[id]?.name ?? places.places.find((p) => p.id === id)?.name ?? id;
  }
  const lifeCfg = lifeCfgFor(state);
  if (lifeCfg !== undefined && lifeCfg.towns[id] !== undefined) return townName(state, id);
  return placeName(state, id);
}

/** 地図の町の印 */
export interface MapTownMark {
  id: string;
  name: string;
  /** 地図の位置（% 座標。pos の無い町は中央に置く） */
  pos: readonly [number, number];
  /** 今いる町か */
  here: boolean;
  /** 訪れたことがあるか（濃い印） */
  visited: boolean;
  /** 名が知れているか（霧の晴れた町か） */
  known: boolean;
}

/** 地図の道 */
export interface MapRoad {
  /** 道の id（journeyIdOf） */
  id: string;
  a: string;
  b: string;
  /** 種別（highway/mountain/sea） */
  kind: string;
  /** 旅日数（徒歩） */
  days: number;
  danger: number;
  checkpointFee?: number;
  /** 閉ざされているか（season=季節の通行止め / crisis=危機で封じられた） */
  closed: "season" | "crisis" | null;
  /** 少なくとも一端が知れているか（霧の中の道は描かない） */
  known: boolean;
}

/** 地図の地域（町の外の場所） */
export interface MapRegion {
  id: string;
  name: string;
  /** 属する町 */
  town: string;
  /** 地図の位置（% 座標。町の周りに散らした印） */
  pos: readonly [number, number];
  known: boolean;
  visited: boolean;
  /** 荒れた地域（危機で閉じられたエリア） */
  ravaged: boolean;
}

/** 地方の地図の画面モデル */
export interface RegionMapModel {
  towns: MapTownMark[];
  roads: MapRoad[];
  regions: MapRegion[];
}

/**
 * この state の地方の地図（G-02）。町・道・地域に霧の刻印と閉鎖の
 * 状態を畳み込む —— 画面はこれだけを見る。life の無い設定では null
 */
export function regionMapOf(state: GameState): RegionMapModel | null {
  const life = lifeCfgFor(state);
  if (life === undefined) return null;
  const known = mapKnownSet(state, life, { time: cfg.time, env: condEnv });
  const here = townOf(state);
  const season = describe(state.time, cfg.time).season;
  const towns: MapTownMark[] = Object.entries(life.towns).map(([id, t]) => ({
    id,
    name: townName(state, id),
    pos: t.pos ?? [50, 50],
    here: id === here,
    visited: mapVisited(state, id),
    known: known.has(id),
  }));
  const roads: MapRoad[] = life.journeys.map((r) => {
    const id = journeyIdOf(r);
    const kind = roadKindOf(r);
    return {
      id,
      a: r.from,
      b: r.to,
      kind,
      days: r.days,
      danger: r.danger ?? 0,
      checkpointFee: r.checkpoint?.fee,
      closed: roadSeasonClosed(r, season)
        ? "season"
        : crisisRoadClosed(state, cfg.crisis, { id, kind })
          ? "crisis"
          : null,
      known: known.has(r.from) || known.has(r.to),
    };
  });
  const townPosOf = (id: string): readonly [number, number] =>
    towns.find((x) => x.id === id)?.pos ?? [50, 50];
  // 地域の印は町の周りに散らす（同じ町の地域は順に角度を回す —— 重なりを避けるだけの見た目の配置）
  const regionIdx = new Map<string, number>();
  const regions: MapRegion[] = placesOf(state)
    .filter((p) => p.kind === "region")
    .map((p) => {
      const town = p.town ?? "ardi";
      const i = regionIdx.get(town) ?? 0;
      regionIdx.set(town, i + 1);
      const tp = townPosOf(town);
      const ang = ((-90 + i * 137) * Math.PI) / 180;
      const pos: readonly [number, number] = [
        Math.min(96, Math.max(4, tp[0] + Math.cos(ang) * 10)),
        Math.min(96, Math.max(4, tp[1] + Math.sin(ang) * 8)),
      ];
      return {
        id: p.id,
        name: placeName(state, p.id),
        town,
        pos,
        known: known.has(p.id),
        visited: mapVisited(state, p.id),
        ravaged: areaClosedNow(state, p.id),
      };
    });
  return { towns, roads, regions };
}

/** 現在の町から出る道（地図の旅欄。既知の行き先に絞る —— 霧の先には行けない） */
export function mapRoadsFrom(state: GameState, model: RegionMapModel): MapRoad[] {
  const here = townOf(state);
  const known = new Set(model.towns.filter((t) => t.known).map((t) => t.id));
  return model.roads.filter(
    (r) => (r.a === here && known.has(r.b)) || (r.b === here && known.has(r.a)),
  );
}

/** 道の向こう側の町 id（a/b のうち今いる町でない側） */
export function mapRoadOther(road: MapRoad, town: string): string {
  return road.a === town ? road.b : road.a;
}

/** 道で使える通い方と、それぞれの料金・実効日数・出せるか（G-02） */
export function journeyWayOptions(
  state: GameState,
  roadId: string,
): { way: JourneyWay; days: number; fee: number }[] {
  const life = lifeCfgFor(state);
  if (life === undefined) return [];
  const road = life.journeys.find((r) => journeyIdOf(r) === roadId);
  if (road === undefined) return [];
  return journeyWaysOf(road).map((way) => ({
    way,
    days: journeyDaysFor(road, way, life),
    fee: journeyCost(road, way, life),
  }));
}

/**
 * 旅の途中の散策が遭遇になるかの先読み（G-02）。step は内部で同じ抽選を
 * 行うので、画面は同じ引数で呼んで「この散策が遭遇なら戦いの画面へ進む」
 * 分岐に使う —— 抽選は決定的なので結果は一致する
 */
export function roadEncounterNow(state: GameState): string | undefined {
  const j = state.life.journey;
  const life = lifeCfgFor(state);
  if (j === null || life === undefined) return undefined;
  const road =
    j.road !== undefined ? life.journeys.find((r) => journeyIdOf(r) === j.road) : undefined;
  return roadEncounter(
    state.seed,
    state.time.day,
    state.counters["action.stroll"] ?? 0,
    road,
    (j.way as JourneyWay | undefined) ?? "foot",
    (state.counters[roadEncounterDayKey()] ?? -1) === state.time.day,
    life,
  );
}

/* ── 有限迷宮（G-03、docs/10 §6） ──
 * 迷宮の中身（階層・部屋・罠・宝・主）は生成世界から決定的に引き直し、
 * 進行は counters/flags（dg.rooms/dg.cleared/dg.camp）を読むだけ。
 * ルールは core/dungeon にあり、ここは表示名・選択の解決だけを行う */

/** この世界の迷宮の一覧（生成世界のみ。固定マップは空） */
export function dungeonsOf(state: GameState) {
  return genWorld(state)?.dungeons ?? [];
}

/** 場所 id → 迷宮（生成世界の dg<連番>。無ければ undefined） */
export function dungeonOf(state: GameState, id: string | undefined) {
  if (id === undefined) return undefined;
  return dungeonsOf(state).find((d) => d.id === id);
}

/** 迷宮の進行（抜いた室数・全室数・制覇。counters/flags から導出） */
export function dungeonProgress(state: GameState, id: string) {
  const d = dungeonOf(state, id);
  if (d === undefined) return { cleared: 0, total: 0, done: false };
  return dgProgress(state.counters, state.flags, d);
}

/** 制覇済みか（flags["dg.cleared.<id>"]） */
export function dungeonDone(state: GameState, id: string): boolean {
  return state.flags[dgClearedKey(id)] === true;
}

/**
 * 迷宮内野営の明け（昨日この迷宮で野営した → 次の潜りは行動を要さない。
 * step の dungeon コマンドと同じ判定。刻印なし＝-1 は day0 と誤爆するので存在確認）
 */
export function dungeonCampFree(state: GameState, id: string): boolean {
  const day = state.counters[dgCampKey(id)];
  return day !== undefined && day === state.time.day - 1;
}

/** 1回の潜りで使える灯り（balance.dungeons.lightPerDive） */
export function dungeonLight(): number {
  return balance.dungeons.lightPerDive;
}

/** 迷宮の型の定義（world.json dungeonTypes → id 引き。罠の定義もここから） */
export const dungeonTypeDefs = Object.fromEntries(
  (worldContent.dungeonTypes ?? []).map((d) => [d.id, d]),
);
export const trapKindDefs = Object.fromEntries(
  (worldContent.trapKinds ?? []).map((tr) => [tr.id, tr]),
);

/** 迷宮内の部屋（通し番号 → 部屋・層・層内番号。主の間は isBossRoom） */
export { floorRooms, isBossRoom, roomAt, totalRooms } from "@trace/core";
export type { GenDungeon, GenRoom } from "@trace/core";

/** 部屋の敵の強化版（enemies.json の定義を層に合わせて伸ばす） */
export function dungeonRoomEnemy(state: GameState, id: string, index: number) {
  const d = dungeonOf(state, id);
  if (d === undefined) return undefined;
  const at = roomAt(d, index);
  if (at === null || at.room.kind !== "combat" || at.room.enemyId === undefined) return undefined;
  const base = enemies.enemies.find((e) => e.id === at.room.enemyId);
  if (base === undefined) return undefined;
  return { enemy: scaleRoomEnemy(base, at.floorIndex, balance.dungeons), floor: at.floorIndex };
}

/** 主の敵の強化版（《称号》と合わせて出す。ユニークは生成名） */
export function dungeonBossEnemy(state: GameState, id: string) {
  const d = dungeonOf(state, id);
  if (d === undefined) return undefined;
  const base = enemies.enemies.find((e) => e.id === d.boss.enemyId);
  if (base === undefined) return undefined;
  return { enemy: bossEnemy(base, d, balance.dungeons), name: bossName(d, base.name) };
}

/**
 * 出来事の部屋の結末（X-30）：型の events 表から部屋の eventIdx で引く。
 * 解決は step の dungeon コマンドの events で畳まれる（散策と同じ語彙）
 */
export function dungeonRoomEvent(state: GameState, id: string, index: number) {
  const d = dungeonOf(state, id);
  const at = d === undefined ? null : roomAt(d, index);
  if (d === undefined || at === null || at.room.kind !== "event" || at.room.eventIdx === undefined)
    return undefined;
  const o = dungeonTypeDefs[d.type]?.events?.[at.room.eventIdx];
  return o === undefined ? undefined : { outcome: o, floor: at.floorIndex };
}

/** 罠の見破り（部屋ごとの決定的な抽選。観察の技能値で回避率が動く） */
export function dungeonTrapRoll(state: GameState, id: string, index: number) {
  const d = dungeonOf(state, id);
  const at = d === undefined ? null : roomAt(d, index);
  if (d === null || at === null || at.room.trapId === undefined) return undefined;
  const trap = trapKindDefs[at.room.trapId];
  if (trap === undefined) return undefined;
  const obs = state.player.skills["observation"]?.value ?? 0;
  return rollTrap(trap, `${state.seed}:${id}:${index}:d${state.time.day}`, obs, balance.dungeons);
}

/** 記録画面の迷宮の欄（生成世界のみ。制覇した迷宮は《制覇》を付ける） */
export function dungeonRecordLines(state: GameState): string[] {
  const ds = dungeonsOf(state);
  if (ds.length === 0) return [];
  // まだ知れていない迷宮の名は出さない —— 地図の霧と同じ知識で歩調を
  // 合わせる（地図で「？」の迷宮の名が記録に先走って載ることはない）
  const life = lifeCfgFor(state);
  const known =
    life !== undefined ? mapKnownSet(state, life, { time: cfg.time, env: condEnv }) : undefined;
  const lines = [t.text.recordsDungeons];
  for (const d of ds) {
    if (known !== undefined && !known.has(d.id)) continue;
    const p = dgProgress(state.counters, state.flags, d);
    lines.push(
      tpl(t.text.recordsDungeonLine, {
        name: d.name,
        type: d.typeName,
        cleared: p.cleared,
        total: p.total,
        mark: p.done ? t.text.recordsDungeonCleared : "",
      }),
    );
  }
  return lines.length > 1 ? lines : [];
}

/** 記録画面の名所の欄（生成世界のみ。踏んだ名所だけが載る —— 見つけた記録） */
export function landmarkRecordLines(state: GameState): string[] {
  const life = lifeCfgFor(state);
  if (life === undefined) return [];
  const visited = new Set(state.life.map.visited);
  const lines = [t.text.recordsLandmarks];
  for (const [id, p] of Object.entries(life.places ?? {})) {
    // 踏んだ名所だけ載る —— 霧の中・聞き覚えだけの名所の名は記録に先走らない
    if (p.landmark !== true || !visited.has(id)) continue;
    lines.push(
      tpl(t.text.recordsLandmarkLine, {
        name: p.name ?? id,
        town: p.town !== undefined ? townName(state, p.town) : "",
      }),
    );
  }
  return lines.length > 1 ? lines : [];
}

/**
 * 湖畔の釣り（P-01）：注文ではない野趣 —— 報酬欄は空で、台帳の
 * 市場価値がそのまま入る（work コマンドの rewardMoney 省略と同じ扱い）
 */
export const LAKE_ORDER = {
  id: "lake.fish",
  kind: "fishing",
  name: "湖の釣り",
  note: "納める先のない釣り。釣果は台帳にだけ残る",
  targetQuality: 40,
  rewardMoney: 0,
} satisfies Order;

/**
 * 釣り場の水域（X-23）：注文名を「湖/川/海の釣り」で出し分ける。
 * 生成地方では町の港と海岸が海、川は川、それ以外（湖・fixed の湖畔）は湖。
 */
export function fishWaterOf(state: GameState, placeId: string): "lake" | "river" | "sea" {
  const w = genWorld(state);
  if (w !== null) {
    if (placeId.endsWith(".harbor")) return "sea";
    const typeId = w.areas.find((a) => a.id === placeId)?.typeId;
    if (typeId === "coast") return "sea";
    if (typeId === "river") return "river";
  }
  return "lake";
}

/** 釣りの注文 —— 名は水域に合わせる（中身は LAKE_ORDER と同じ野趣） */
export function fishOrderOf(state: GameState, placeId: string): Order {
  const water = fishWaterOf(state, placeId);
  const name =
    water === "sea"
      ? t.text.fishNameSea
      : water === "river"
        ? t.text.fishNameRiver
        : t.text.fishNameLake;
  return { ...LAKE_ORDER, name };
}

/** 現在の空（P-01）：背景の時間帯・天候はここから引く（導出値なので状態は持たない） */
export function skyNow(state: GameState): { tod: TimeOfDay; weather: string } {
  const d = describe(state.time, cfg.time);
  const w =
    cfg.weather !== undefined ? weatherOf(state.seed, state.time.day, cfg.weather, cfg.time) : null;
  return { tod: d.timeOfDay, weather: w?.kind.id ?? "clear" };
}

/**
 * 作品の表示名：注文名（特別注文は元の注文名、接点の注文は接点の品名）＞スキル名の順。
 * state を渡すと接点の注文（W-02）の名前も引ける
 */
export function workName(w: Pick<Work, "kind" | "order">, state?: GameState): string {
  const orderId = w.order?.split("#")[0];
  if (orderId === undefined) {
    return skills.skills.find((s) => s.id === w.kind)?.name ?? w.kind;
  }
  return (
    orders.orders.find((o) => o.id === orderId)?.name ??
    (state !== undefined
      ? crisisTouchpointOf(state, cfg.crisis, orderId)?.offer?.name
      : undefined) ??
    w.order ??
    w.kind
  );
}

/**
 * 伝記（T-37）：素材は core（biographyMaterial）が摘み、表示名はここで解決する。
 * cause 省略時は「いまの記録」の途中経過（引退・死亡の行を出さない）。
 * worldEpilogue は「生の終わり」の画面・記録にだけ立てる
 * （W-04、docs/08 §7：転生の年代記に世界の行方の後日談を1節残す）
 */
export function bioLines(
  state: GameState,
  cause?: "retire" | "death",
  worldEpilogue = false,
): string[] {
  const m = biographyMaterial(state, cfg.pinnacles);
  const titleNames = m.titleIds
    .map((id) => titles.titles.find((x) => x.id === id)?.name ?? id)
    .join("、");
  const goalNames = m.achievedGoalIds
    .map((id) => society.lifeGoals.find((g) => g.id === id)?.name ?? id)
    .join("、");
  // 頂点ルート名（T-41）：達成したルートの表示名を繋ぐ
  const pinnacleNames = m.pinnacleIds
    .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
    .join("、");
  const lines = narrator.narrate(
    {
      scene: "biography",
      name: m.name,
      days: m.days,
      deeds: m.deeds,
      origin: origins.origins.find((o) => o.id === m.originId)?.name ?? m.originId,
      standing: society.standings.find((s) => s.id === m.standingId)?.name ?? m.standingId,
      ...(m.professionId !== null
        ? {
            profession:
              society.professions.find((p) => p.id === m.professionId)?.name ?? m.professionId,
          }
        : {}),
      ...(titleNames !== "" ? { titles: titleNames } : {}),
      ...(goalNames !== "" ? { goals: goalNames } : {}),
      ...(m.bestWork !== null
        ? {
            work: {
              name: workName(m.bestWork, state),
              quality: m.bestWork.quality,
              tier: m.bestWork.tier,
            },
          }
        : {}),
      ...(m.peakSkill !== null
        ? {
            peakSkill: {
              name: skills.skills.find((s) => s.id === m.peakSkill!.id)?.name ?? m.peakSkill.id,
              value: Math.round(m.peakSkill.value * 10) / 10,
            },
          }
        : {}),
      ...(pinnacleNames !== "" ? { pinnacle: pinnacleNames } : {}),
      ...(cause !== undefined ? { cause } : {}),
    },
    // 同じ死には同じ伝記（通算死亡数でシードを分ける）
    createRng(`${state.seed}:bio:${m.days}:${m.deaths}`),
  );
  // 危機の後日談（W-04）：その生の終わり時点で、世界がどうなるかを1節添える
  return worldEpilogue ? [...lines, ...crisisEpilogueLines(state)] : lines;
}

/**
 * 危機の後日談（W-04、docs/08 §7）：その生の終わり時点の世界の行方を1節。
 * 決着を見届けた生なら「見届けた」、未決着なら世界の結末の先読みを語る。
 * 危機の無い世界では空（何も足さない）
 */
export function crisisEpilogueLines(state: GameState): string[] {
  if (cfg.crisis === undefined) return [];
  const ep = crisisEpilogue(state, cfg.crisis, cfg.time);
  if (ep === null) return [];
  const type = crisisTypeOf(state, cfg.crisis);
  const key = ep.witnessed
    ? ep.outcome === "ruin"
      ? "witnessedRuin"
      : "witnessedResolved"
    : ep.outcome; // resolved / ruin / ongoing
  const text = narration.crisis.epilogue[key];
  return text === undefined ? [] : [tpl(text, { type: type?.name ?? "", name: state.player.name })];
}

const SAVE_KEY = "trace.save.v1";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    // K-01：旧セーブに無い技能はコンテンツの技能一覧で空レコードに補う
    return raw
      ? deserialize(raw, {
          skillIds: skills.skills.map((s) => s.id),
          initialPotential: balance.player.initialPotential,
        })
      : null;
  } catch {
    return null;
  }
}
export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(state));
}
export function resetSave(): void {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(CHRONICLE_KEY);
}

// 年代記（T-38。周回をまたぐのでセーブとは別キー・別バージョンで保存）
const CHRONICLE_KEY = "trace.chronicle.v1";

export function loadChronicle(): Chronicle {
  try {
    const raw = localStorage.getItem(CHRONICLE_KEY);
    return raw ? deserializeChronicle(raw) : emptyChronicle();
  } catch {
    return emptyChronicle();
  }
}
export function saveChronicle(chronicle: Chronicle): void {
  localStorage.setItem(CHRONICLE_KEY, serializeChronicle(chronicle));
}

/**
 * その周の運命の選び方（T-45/T-46。06 §3C）。
 * tendency 省略時は calm（中立）、vows 省略時は誓約なし
 */
export interface FateChoice {
  tendency?: TendencyId;
  vows?: readonly string[];
}

/**
 * このブラウザセッションで遊ぶ地図の出所（G-01、docs/10）。
 * 既定は "gen"（世界シードから生成する地方 —— シードごとに違う世界）。
 * `?world=legacy` で固定マップ（アルディ・ベルン）を選べる —— e2e や
 * 確認用の互換経路として残す。旧セーブは読み込んだ時点で legacy の世界
 */
export function worldMode(): "gen" | "legacy" {
  const q =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("world");
  return q === "legacy" ? "legacy" : "gen";
}

/** 新規開始・転生で共通の newGame 初期値（出自は呼び出し側で選ぶ） */
const gameInit = (
  origin: Origin,
  legacy?: Legacy,
  fate?: FateChoice,
  flags?: readonly string[],
): NewGameConfig => ({
  // 世界の地図（G-01）：新しい周はこのセッションの地図で始まる。
  // 生成世界の始まりの町は常に "t0"（generateWorld の約束）
  world:
    worldMode() === "gen" ? { kind: "gen", recipe: WORLD_RECIPE } : { kind: "legacy", recipe: 0 },
  ...(worldMode() === "gen" ? { initialTown: "t0" } : {}),
  skillIds: skills.skills.map((s) => s.id),
  initialPotential: balance.player.initialPotential,
  origin,
  potentialInitMin: balance.player.potentialInitMin,
  potentialInitMax: balance.player.potentialInitMax,
  initialStatValue: balance.player.initialStatValue,
  initialMoney: balance.player.initialMoney,
  ...(legacy !== undefined ? { legacy } : {}),
  ...(fate?.tendency !== undefined ? { tendency: fate.tendency } : {}),
  ...(fate?.vows !== undefined ? { vows: fate.vows } : {}),
  ...(flags !== undefined && flags.length > 0 ? { flags } : {}),
  // 世界の危機（W-01）：この世界の危機をシードから抽選する
  ...(cfg.crisis !== undefined ? { crisis: cfg.crisis } : {}),
  // 初期装備の武器（K-01、weapons.json の initial/defaultWeapon）
  initialWeapons: weapons.initial,
  initialWeapon: weapons.defaultWeapon,
  // 気力・魔力（K-02）：新しい旅立ちは上限いっぱいで始まる
  arts: { defs: allArtDefs, ...balance.arts },
});

/** 新規開始のシード。?seed= で固定できる（e2e・リプレイ用）。それ以外は一意に */
export function newSession(originId?: string, fate?: FateChoice): GameState {
  const param = new URLSearchParams(window.location.search).get("seed");
  const seed = param ?? `web-${Math.random().toString(36).slice(2, 10)}`;
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return newGame(seed, t.text.playerName, gameInit(origin, undefined, fate));
}

/**
 * 転生した周の開始（T-40。06 §1）：新しいシードの世界へ。
 * シードは環境変数・乱数ではなく前世の状態から決定論的に派生する。
 * 生まれ変わった世の傾向と新たな誓約は fate で選ぶ（T-45/T-46）
 */
export function nextLife(
  prev: GameState,
  originId: string | undefined,
  legacy: Legacy,
  fate?: FateChoice,
  flags?: readonly string[],
): GameState {
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return newGame(nextWorldSeed(prev), t.text.playerName, gameInit(origin, legacy, fate, flags));
}

/**
 * 次代を継ぐ周の開始（T-48。06 §1）：同じシードの世界で新キャラを始める。
 * 転生とは別系統で、legacy より弱い引継ぎ（balance.heir の素質補正のみ。
 * 記憶称号・遺物は渡さない）。同じ世界なので傾向は前世のものを継ぎ、
 * 誓約は生ごとの選択として選び直す（D-38）。年代記には刻まない
 */
export function heirLife(
  prev: GameState,
  originId: string | undefined,
  vows?: readonly string[],
): { state: GameState; kind: HeirKind; legacy: Legacy } {
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return succeedLife(
    prev,
    t.text.playerName,
    gameInit(origin, undefined, {
      tendency: prev.tendency,
      ...(vows !== undefined ? { vows } : {}),
    }),
    balance.heir,
  );
}

/**
 * 一生の終わりを年代記に刻む（T-40）。引退・老衰は冪等：同じ世界・終わり方・
 * 日数・名の頁は二度書かない（転生フローの中断→再開や、再読み込み後の同じ死の
 * 再生で安全）。戦闘死は蘇生して続く別の死なので毎回刻む（T-38 どおり）。
 * 戻り値は「今回書き込んだか」
 */
export function recordLifeEnd(state: GameState, cause: LifeCause, biography: string): boolean {
  const chronicle = loadChronicle();
  if (cause !== "death" && hasLifeRecord(chronicle, state, cause)) return false;
  saveChronicle(
    recordLife(chronicle, state, cause, {
      titleDefs: cfg.titles,
      // 頂点に至ったルートの記録（T-41。伝記とは別に構造化して残す）
      pinnacles: reachedPinnacles(state, cfg.pinnacles ?? []),
      biography,
    }),
  );
  return true;
}

/** 遺物の表示名（Legacy の name は注文IDかスキルIDなので表示名に解決する） */
export function legacyArtifactName(a: { name: string; kind: string }): string {
  return (
    orders.orders.find((o) => o.id === a.name.split("#")[0])?.name ??
    skills.skills.find((s) => s.id === a.name)?.name ??
    skills.skills.find((s) => s.id === a.kind)?.name ??
    a.name
  );
}

/** 継承の自動選択（台帳上位・称号ランク順）と候補一覧。転生画面の初期値に使う */
export function legacyDefaults(prev: GameState): {
  auto: Legacy;
  topWorks: Work[];
} {
  return {
    auto: legacyOf(prev, balance.legacy, { titleDefs: cfg.titles }),
    topWorks: [...prev.ledger]
      .sort((a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day)
      .slice(0, 5),
  };
}

export const originList = origins.origins;

export { canAct, step };

export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function offerName(id: string): string {
  return (
    society.standings.find((s) => s.id === id)?.name ??
    society.professions.find((p) => p.id === id)?.name ??
    id
  );
}

/**
 * 危機の段階・決着の場面の表示名（W-01。型定義から id で引く。
 * 出来事ログの定型文（text/cli.json crisisLog）に差し込む）
 */
export function crisisRefName(ref: string, list: "stages" | "finales"): string {
  for (const ty of cfg.crisis?.types ?? []) {
    const hit = ty[list].find((x) => x.id === ref);
    if (hit !== undefined) return hit.name;
  }
  return ref;
}
/** 出来事ログの種別 → 定型文（{name} を差し込める） */
export function crisisLogLine(kind: string, name?: string): string | null {
  const text = t.text.crisisLog[kind];
  return text === undefined ? null : tpl(text, { name: name ?? "" });
}

/** 勝負所の行事の表示名（X-10。occasions.json から id で引く） */
export function occasionName(id: string): string {
  return cfg.occasions !== undefined ? (occasionDef(cfg.occasions, id)?.name ?? id) : id;
}

/**
 * 隠し要素の噂ヒント（X-11）：未発見の発見があれば当日の一件を返す。
 * 世界シードで抽選された時刻パラメータは display 名で差し込む
 * （{weekday}→曜日名、{moon}→月齢名 など）。発見済みは二度と出ない
 */
export function discoveryHintLine(state: GameState): string | null {
  if (cfg.discoveries === undefined) return null;
  const def = dailyDiscoveryHint(state, cfg.discoveries);
  return def === null
    ? null
    : discoveryHintText(def, state.seed, cfg.time, {
        weekday: (i) => `${t.display.weekdayNames[i] ?? i}曜日`,
        moon: (p) => t.display.moonNames[p] ?? p,
        season: (i) => t.display.seasonNames[i] ?? String(i),
        dayOfSeason: (i) => `${i + 1}日目`,
      });
}

/**
 * ユニークの持ち主の表示名（K-03）：state.uniques の holder（"player" /
 * "rival.<index>"）を名前に解く。ライバルの名はランキング・危機の英雄と
 * 同じ抽選（drawRivalCast）から —— 世界の顔ぶれは一貫している
 */
export function uniqueHolderName(state: GameState | undefined, holder: string): string {
  if (holder === "player") return state?.player.name ?? "あなた";
  if (state !== undefined && holder.startsWith("rival.")) {
    const index = Number.parseInt(holder.slice("rival.".length), 10);
    return (
      drawRivalCast(state.seed, { names: rivals.names, epithets: rivals.epithets }, balance.rivals)[
        index
      ]?.name ?? holder
    );
  }
  return holder;
}

/**
 * 合成の噂ヒント（K-03、09 §7）：未獲得のレシピのヒントを当日の一件返す。
 * 条件そのものは明かさない —— 「技と技が響き合う」手がかりだけが噂になる
 * （dailyDiscoveryHint と同じく seed×日付で決定的。レシピの無い世界では null）
 */
export function synthesisHintLine(state: GameState): string | null {
  if (cfg.synthesis === undefined) return null;
  const recipe = synthesisHintOf(
    state.seed,
    state.time.day,
    cfg.synthesis.recipes,
    state.player.arts,
  );
  return recipe?.hint ?? null;
}

/** イベント → 表示行（CLIの applyTitles 相当）。state を渡すとライバル名まで解ける（W-03） */
export function eventLines(events: ActionEvent[], state?: GameState): string[] {
  return events.flatMap((e) => {
    switch (e.type) {
      case "gainApplied": {
        const name = skills.skills.find((s) => s.id === e.skill)?.name ?? e.skill;
        return [`${name} +${e.amount.toFixed(1)}（未定着）`];
      }
      case "titleGained": {
        const def = titles.titles.find((x) => x.id === e.id);
        if (e.suppressed) return [tpl(t.text.titleSuppressed, { name: def?.name ?? e.id })];
        return [def?.message ?? tpl(t.text.titleGainedFallback, { name: def?.name ?? e.id })];
      }
      case "kehai":
        return [t.text.kehai];
      // ランク帯を越えた（F-01）：起床ログの節目行。名は skillRankNames で解く
      case "skillRankUp": {
        const name = skills.skills.find((s) => s.id === e.skill)?.name ?? e.skill;
        const rank = t.display.skillRankNames[e.toRank] ?? String(e.toRank);
        return [tpl(t.text.wake.rankUp, { name, rank })];
      }
      // 強個体の討伐（T-44）：図鑑に刻んだ旨を1行出す
      case "uniqueDefeated":
        return [
          tpl(t.text.uniqueDefeated, {
            name: enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId,
          }),
        ];
      case "pinnacleStageReached": {
        // 頂点ルートの段（T-41）：通知文は pinnacles.json 側に書かれている
        const notice = pinnacles.pinnacles
          .find((r) => r.id === e.route)
          ?.stages.find((s) => s.id === e.stage)?.notice;
        return [notice ?? `――頂点への段《${e.stage}》に至りました。`];
      }
      case "skillUnlocked":
        return [
          tpl(t.text.skillUnlocked, {
            name: skills.skills.find((s) => s.id === e.id)?.name ?? e.id,
          }),
        ];
      case "offerReceived":
        return [tpl(t.text.offerReceived, { name: offerName(e.id) })];
      case "offerAccepted":
        return [tpl(t.text.societyAccepted, { name: offerName(e.id) })];
      case "goalDeclared":
        return [
          tpl(t.text.societyDeclared, {
            name: society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id,
          }),
        ];
      case "goalAchieved":
        return [
          tpl(t.text.goalAchieved, {
            name: society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id,
          }),
        ];
      case "factLearned":
        return [
          tpl(t.text.factLearned, {
            text: canon.facts.find((f) => f.id === e.id)?.text ?? e.id,
          }),
        ];
      case "loreConnection":
        return [
          tpl(t.text.loreConnection, {
            name: canon.events.find((x) => x.id === e.id)?.name ?? e.id,
          }),
        ];
      // 深層ダンジョンのラン結果（T-43）：到達深度と自己ベスト更新を1行ずつ出す
      case "abyssEnded": {
        const lines = [tpl(t.text.abyssResult, { depth: e.depth, best: e.best })];
        if (e.newBest) lines.push(tpl(t.text.abyssBest, { best: e.best }));
        return lines;
      }
      // 有限迷宮の潜り結果（G-03）：抜いた室数と制覇を1行ずつ出す
      case "dungeonEnded": {
        const d =
          state === undefined ? undefined : genWorld(state)?.dungeons.find((x) => x.id === e.id);
        const name = d?.name ?? e.id;
        const lines = [
          tpl(t.text.dungeonResult, {
            name,
            rooms: e.rooms,
            cleared: e.cleared,
            total: e.total,
          }),
        ];
        if (e.done) lines.push(tpl(t.text.dungeonConquered, { name }));
        else if (e.end === "camp") lines.push(t.text.dungeonCamp);
        else if (e.end === "light") lines.push(t.text.dungeonLightOut);
        else if (e.end === "retreat") lines.push(t.text.dungeonRetreat);
        return lines;
      }
      // 迷宮の主の討伐（G-03）：制覇の潜りの報せ。ユニークは「世界に1体」と出す
      case "bossDefeated": {
        const d =
          state === undefined
            ? undefined
            : genWorld(state)?.dungeons.find((x) => x.id === e.dungeon);
        const base = enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId;
        const name = d !== undefined ? bossName(d, base) : e.enemyId;
        return [
          e.unique
            ? tpl(t.text.dungeonUniqueDown, { name })
            : tpl(t.text.dungeonBossDown, { name }),
        ];
      }
      case "moneyPaid":
        return [tpl(t.text.moneyPaid, { amount: e.amount })];
      // 街への寄付（X-9 領主ルート）：納めた額を1行で返す
      case "donated":
        return [tpl(t.text.societyDonated, { amount: e.amount })];
      // 老衰死（T-36）：起床ログに続いて表示する。老いの兆候（oldAgeSign）は
      // report.surprises に既出なのでここでは行を出さない
      case "deathByAge":
        return [tpl(t.text.deathByAge, { age: e.age })];
      case "bookBought": {
        const name = books.books.find((b) => b.id === e.id)?.name ?? e.id;
        return [tpl(t.text.bookBought, { name })];
      }
      // 武器の購入・持ち替え（K-01）：武器の棚でのできごとを1行ずつ返す
      case "weaponBought": {
        const name = weaponDefs[e.id]?.name ?? e.id;
        return [tpl(t.text.armsBought, { name })];
      }
      case "weaponEquipped": {
        const name = weaponDefs[e.id]?.name ?? e.id;
        return [tpl(t.text.armsEquipped, { name })];
      }
      // 武技（K-02）：新しい技を閃いた（通知Bランク相当）・構成を整えた
      case "artLearned": {
        const name = allArtDefs[e.id]?.name ?? e.id;
        return [tpl(t.text.artLearned, { name })];
      }
      case "buildChanged":
        return [t.text.buildSaved];
      // 技の進化・合成・ユニーク（K-03、09 §7）：形を変えた技・響き合いで
      // 生まれた技・世界に刻まれたユニーク。進化形の名はここで初めて明かされる
      // （傾き表示では分岐の向きだけが見え、進化先は「？？？」だった）
      case "artEvolved": {
        const from = allArtDefs[e.from]?.name ?? e.from;
        const to = allArtDefs[e.to]?.name ?? e.to;
        return [
          tpl(e.hidden ? t.text.artEvolvedHidden : t.text.artEvolved, {
            from,
            to,
            reason: e.reason,
          }),
        ];
      }
      case "artSynthesized": {
        const name = allArtDefs[e.id]?.name ?? e.id;
        return [tpl(t.text.artSynthesized, { name })];
      }
      case "uniqueGained": {
        const name = allArtDefs[e.art]?.name ?? e.art;
        return [
          e.suppressed
            ? tpl(t.text.uniqueSuppressed, { name })
            : tpl(t.text.uniqueGained, { name }),
        ];
      }
      case "uniqueClaimed": {
        const name = allArtDefs[e.art]?.name ?? e.art;
        return [tpl(t.text.uniqueClaimed, { name, rival: uniqueHolderName(state, e.rival) })];
      }
      // 生活魔法（M-01）：唱えた呪文と、掛かった先の一行
      case "magicCast": {
        const def = allArtDefs[e.id];
        const line = t.text.lifeSpellLines[e.hook] ?? "";
        return [tpl(t.text.magicCast, { name: def?.name ?? e.id, line })];
      }
      // 付与（M-01）：武器に刻んだ段を1行で返す
      case "enchanted": {
        const name = weaponDefs[e.weapon]?.name ?? e.weapon;
        return [tpl(t.text.enchanted, { name, level: e.level })];
      }
      case "bookRead": {
        const def = books.books.find((b) => b.id === e.id);
        const name = def?.name ?? e.id;
        const lines: string[] = [];
        for (const r of e.recovered) {
          lines.push(
            tpl(t.text.bookRecovered, {
              skill: skills.skills.find((s) => s.id === r.skill)?.name ?? r.skill,
              amount: r.amount,
            }),
          );
        }
        if (e.flag !== undefined) lines.push(t.text.bookFlag);
        if (def?.effect !== undefined && def.durationDays !== undefined) {
          lines.push(tpl(t.text.bookEffectDays, { days: def.durationDays }));
        }
        if (lines.length === 0) lines.push(tpl(t.text.bookReadDone, { name }));
        return lines;
      }
      case "mentorApprenticed": {
        const name = mentors.mentors.find((m) => m.id === e.id)?.name ?? e.id;
        return [tpl(t.text.mentorApprenticed, { name })];
      }
      case "mentorLeft": {
        const name = mentors.mentors.find((m) => m.id === e.id)?.name ?? e.id;
        return [tpl(t.text.mentorLeft, { name })];
      }
      case "mentorTrained": {
        const lines: string[] = [];
        for (const r of e.recovered) {
          lines.push(
            tpl(t.text.bookRecovered, {
              skill: skills.skills.find((s) => s.id === r.skill)?.name ?? r.skill,
              amount: r.amount,
            }),
          );
        }
        if (e.flag !== undefined) lines.push(t.text.mentorSecret);
        return lines;
      }
      case "mentorAway": {
        // R-01：師匠が今日は街にいない（人の揺らぎ）
        const name = mentors.mentors.find((m) => m.id === e.id)?.name ?? e.id;
        return [tpl(t.text.mentorAway, { name })];
      }
      case "tierUp":
        return [tpl(t.text.workResultTier, { tier: e.tier })];
      // 世界の危機（W-01）：季節の変わり目の出来事を定型文で出す。
      // 危機の型名や段階番号は出さない（世界の出来事として「報せ」だけ届く）
      case "crisisDrawn": {
        const line = crisisLogLine("draw");
        return line === null ? [] : [line];
      }
      case "crisisStageChanged": {
        const line = crisisLogLine("stage", crisisRefName(e.stage, "stages"));
        return line === null ? [] : [line];
      }
      case "crisisFinale": {
        const line = crisisLogLine(
          e.success ? "finale.win" : "finale.loss",
          crisisRefName(e.id, "finales"),
        );
        return line === null ? [] : [line];
      }
      case "crisisEnded": {
        const line = crisisLogLine(e.outcome === "resolved" ? "end.resolved" : "end.ruin");
        return line === null ? [] : [line];
      }
      // 接点を果たした（W-02）：備えに足された旨を1行出す（淡々とした機械的な口調）
      case "crisisTouchpoint":
        return [
          tpl(t.text.crisisTouchpointDone, {
            field: t.display.crisisFieldNames[e.field] ?? e.field,
          }),
        ];
      // 決着の場面への打診・参加・勝負所・起こし（W-03、docs/08 §6）
      case "crisisFinaleOffered":
        return [tpl(t.text.crisisFinaleOffered, { name: crisisRefName(e.id, "finales") })];
      case "crisisFinaleJoined":
        return [tpl(t.text.crisisFinaleJoined, { name: crisisRefName(e.id, "finales") })];
      case "crisisFinaleAttempt":
        return [tpl(t.text.crisisFinaleAttempt, { name: crisisRefName(e.id, "finales") })];
      case "crisisFinaleLed": {
        const line = crisisLogLine(
          e.success ? "finale.hero" : "finale.heroFail",
          crisisRefName(e.id, "finales"),
        );
        return line === null ? [] : [line];
      }
      // ライバルが英雄として記録された（W-03）：名はライバルの抽選から解決する
      case "crisisRivalHero": {
        const name =
          cfg.crisis !== undefined && state !== undefined
            ? crisisRivalName(state, cfg.crisis, `rival.${e.index}`)
            : `rival.${e.index}`;
        const line = crisisLogLine("rival.hero", name);
        return line === null ? [] : [line];
      }
      // 勝負所の行事（X-10、docs/03 §2）：打診は人物の口から届き、
      // 勝敗は機械的な一行として刻む（数値・名の解決は core の刻印から）。
      // 話者の名簿はこの世界の住人で引く（X-21 —— 生成地方では canon の
      // 持ちかけ人は居ないので、名簿を cfgFor でこの世界の名簿に替えて
      // 引かないと canon の名がそのまま出てしまう）
      case "occasionOffered": {
        const oc = (state !== undefined ? cfgFor(state) : cfg).occasions;
        const def = oc !== undefined ? occasionDef(oc, e.id) : undefined;
        const name = def?.name ?? e.id;
        const speaker =
          oc !== undefined && def !== undefined && state !== undefined
            ? occasionSpeaker(state, oc, def)
            : undefined;
        return [
          tpl(t.text.occasionOffered, { name }),
          ...(speaker !== undefined
            ? [tpl(t.text.occasionSpeakerLine, { speaker: speaker.name, line: def!.line })]
            : []),
        ];
      }
      case "occasionJoined":
        return [tpl(t.text.occasionJoined, { name: occasionName(e.id) })];
      case "occasionAttempted":
        return [
          tpl(e.won ? t.text.occasionWon : t.text.occasionLost, { name: occasionName(e.id) }),
        ];
      // 隠し要素の発見（X-11）：通知Bランク —— 発見名＋発見の語り
      case "discovery": {
        const def = cfg.discoveries?.find((d) => d.id === e.id);
        return [
          tpl(t.text.discoveryFound, { name: def?.name ?? e.id }),
          ...(def?.foundText !== undefined ? [def.foundText] : []),
        ];
      }
      // NPCの歳月（X-12）：通知Bランク —— 街の人物の物語が動いた一行。
      // 記事文は core が {name} 解決済みで渡す（引退・結婚・死去・栄転・旅立ち）
      case "npcEvent":
        return [tpl(t.text.npcEvent, { name: e.name, text: e.text })];
      // 日々の出来事（F-05）：届いた旨を1行告げる（会話の窓は出来事画面が開く）。
      // 結末は core が {name} 解決済みの文を text に載せて渡す
      case "incidentOffered":
        return [
          tpl(t.text.incidentOffered, {
            name:
              cfg.incidents !== undefined ? (incidentDef(cfg.incidents, e.id)?.name ?? e.id) : e.id,
          }),
        ];
      case "incidentResolved":
        return [e.text];
      // 手がかり（F-05）：出来事の結果でアトムが読み終えたとき。
      // 見聞録画面からの readAtom ではこの行を出さない（画面側が atomRead を除く）
      case "atomRead":
        return [
          tpl(t.text.incidentAtom, {
            title: atoms.find((a) => a.id === e.id)?.title ?? e.id,
          }),
        ];
      // ---- 日々の営み（P-02「行動の種類を増やす」） ----
      // 出来事の行はすべて記録行（ログ）だけ —— 通知の窓・札は足さない
      // （賭けの勝敗・仲・到着は生活の中の小さなできごと。通知ランク：行のみ）
      case "strollOutcome":
        return [e.text];
      case "itemGot":
        return [tpl(t.text.life.itemGot, { name: itemName(e.id), n: e.n })];
      case "itemBought":
        return [tpl(t.text.life.itemBought, { name: itemName(e.id), n: e.n, amount: e.amount })];
      case "itemSold":
        return [tpl(t.text.life.itemSold, { name: itemName(e.id), n: e.n, amount: e.amount })];
      // 料理の材料・贈り物の消費は行動の内側 —— 行は出さない（作った・渡した行が語る）
      case "itemSpent":
        return [];
      case "cooked":
        return [
          tpl(t.text.life.cooked, {
            name: itemName(e.out),
            quality: Math.round(e.quality),
          }),
        ];
      case "ate":
        return [tpl(t.text.life.ate, { name: itemName(e.id) })];
      case "gambled":
        return [
          e.won
            ? tpl(t.text.life.gambleWon, { amount: e.amount })
            : tpl(t.text.life.gambleLost, { stake: e.stake }),
        ];
      case "prayed":
        return [
          e.alms !== undefined ? tpl(t.text.life.prayedAlms, { alms: e.alms }) : t.text.life.prayed,
        ];
      case "bonded":
        return [
          e.amount > 0
            ? tpl(t.text.life.bonded, { name: npcName(state, e.npc) })
            : tpl(t.text.life.bondMissed, { name: npcName(state, e.npc) }),
        ];
      case "errandDone": {
        // 依頼名はその世界の依頼表から引く（G-01：生成地方は生成の掲示依頼）
        const lifeCfg = state !== undefined ? lifeCfgFor(state) : cfg.life;
        const def = lifeCfg?.errands.find((x) => x.id === e.id);
        return [tpl(t.text.life.errandDone, { name: def?.name ?? e.id })];
      }
      case "journeyStarted":
        // 通い方のある旅（G-02）：徒歩以外は通い方の名を添えた行になる
        return [
          e.way !== undefined
            ? tpl(t.text.life.journeyStartedWay, {
                town: townName(state, e.to),
                way: journeyWayName(e.way),
                days: e.days,
              })
            : tpl(t.text.life.journeyStarted, { town: townName(state, e.to), days: e.days }),
        ];
      case "journeyArrived":
        // 到着の一行は起床の「驚き」の列に既に出る（sleep 側が texts.arrive を載せる）
        return [];
      case "roadEncounter": {
        // 道中の遭遇（G-02）：敵の気配の一行。戦いは画面側が combat へ進める
        const name = enemies.enemies.find((x) => x.id === e.enemy)?.name ?? e.enemy;
        return [tpl(t.text.roadEncounterLine, { name })];
      }
      case "mapHeard":
        // 噂・朝刊で名を聞き覚えた（G-02。地図の霧が晴れる）
        return [tpl(t.text.life.mapHeard, { name: mapPlaceName(state, e.place) })];
      case "landmarkFound":
        // 名所の初訪（X-29）：踏んだ記録が残る一行
        return [tpl(t.text.life.landmarkFound, { name: mapPlaceName(state, e.place) })];
      case "mapRevealed":
        // 地方の地図を手に入れた（G-02。地方すべての名が聞き覚えに刻まれる）
        return [t.text.life.mapRevealed];
      case "repGained":
        // 町ごとの評判（G-01）：顔が売れた一行は記録にだけ残す（通知ではない）
        return [tpl(t.text.life.repGained, { town: townName(state, e.town) })];
      default:
        return [];
    }
  });
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** 睡眠の質の数値 → 表示語（qualityBands。q <= upTo の最初の帯） */
export function qualityLabel(q: number): string {
  const bands = [...t.display.qualityBands].sort((a, b) => a.upTo - b.upTo);
  return (bands.find((b) => q <= b.upTo) ?? bands[bands.length - 1]!).label;
}

/** 起床ログ（CLI wakeBlock と同じ組み立て）＋ 朝の新聞（07 §6：語り層の呼び出し） */
export function wakeLines(state: GameState, events: ActionEvent[], atHome = false): string[] {
  const report = events.find(
    (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
  )?.report;
  if (!report) return [];
  const w = t.text.wake;
  const lines: string[] = [w.header];
  // 旅の途中の眠りは野営（P-02。到着の朝は journey が空でも journeyArrived で判る）。
  // 迷宮内野営（G-03）も野営の眠り —— slept.camp で判る（step が camp を立てる）
  const camping =
    state.life.journey !== null ||
    events.some((e) => e.type === "journeyArrived") ||
    events.some((e) => e.type === "slept" && e.camp === true);
  lines.push(
    tpl(w.qualityLine, {
      quality: qualityLabel(report.quality),
      inn: camping
        ? t.display.campName
        : atHome
          ? t.display.homeName
          : t.display.innNames[report.inn],
      dinner: !atHome && report.dinner ? t.display.dinnerNames.with : t.display.dinnerNames.without,
    }),
  );
  for (const l of report.lines.filter((x) => x.kind === "skill")) {
    const name = skills.skills.find((s) => s.id === l.id)?.name ?? l.id;
    lines.push(tpl(w.skillLine, { name, from: fmt(l.from), to: fmt(l.to), delta: fmt(l.delta) }));
    // F-01：上限で削られた分は消えず持ち越される —— その旨を1行滲ませる
    if (l.carried !== undefined) {
      lines.push(tpl(w.carryoverLine, { name, amount: fmt(l.carried) }));
    }
  }
  const statLines = report.lines.filter((x) => x.kind === "stat");
  if (statLines.length > 0) {
    lines.push(
      statLines
        .map((l) => `${t.display.statNames[l.id] ?? l.id} +${fmt(l.delta)}`)
        .join(w.statJoiner),
    );
  }
  // 武技の定着（K-02）：使って貯めた経験が眠りで Lv になって出る
  for (const a of report.arts ?? []) {
    lines.push(tpl(w.artLevelUp, { name: allArtDefs[a.id]?.name ?? a.id, to: a.to }));
  }
  if (report.lines.length === 0) lines.push(w.noChange);
  if (report.restDay) lines.push(w.restDayLine);
  // 天候（X-13）：今朝の空の風景を1行滲ませる（常時のステータス表示にはしない）
  if (report.weather !== undefined) {
    lines.push(tpl(w.weatherLine, { weather: report.weather.name, line: report.weather.line }));
  }
  const winds = report.tailwinds.map((x) => x.label).join(" ／ ");
  lines.push(winds ? tpl(w.windsLine, { winds }) : w.windsNone);
  for (const s of report.surprises) lines.push(s);
  for (const m of eventLines(events, state)) lines.push(m);
  lines.push(w.footer);

  const slept = events.find(
    (e): e is Extract<ActionEvent, { type: "slept" }> => e.type === "slept",
  );
  const day = slept?.from.day ?? 0;
  const deeds = state.actionLog.filter((a) => a.day === day).map((a) => a.kind);
  // 台帳由来の記事：その日に記録された作品を新聞の材料にする（03 §5）。
  // 表示名は注文名（特別注文は元の注文名）＞スキル名の順で解決する
  const works = state.ledger
    .filter((w) => w.day === day)
    .map((w) => {
      const orderId = w.order?.split("#")[0];
      const name = orderId
        ? (orders.orders.find((o) => o.id === orderId)?.name ?? w.order ?? w.kind)
        : (skills.skills.find((s) => s.id === w.kind)?.name ?? w.kind);
      return { name, quality: w.quality, tier: w.tier };
    });
  const deaths = state.counters["death.count"] ?? 0;
  const title = events.find(
    (e): e is Extract<ActionEvent, { type: "titleGained" }> =>
      e.type === "titleGained" && !e.suppressed,
  );
  const offer = events.find(
    (e): e is Extract<ActionEvent, { type: "offerReceived" }> => e.type === "offerReceived",
  );
  // 前世の伝説（T-42）：年代記が非空なら最新の人生の名・二つ名が噂に混ざる
  const lastLife = loadChronicle().lives.at(-1);
  const prevLife =
    lastLife === undefined
      ? undefined
      : {
          name: lastLife.name,
          epithet:
            lastLife.epithet === undefined
              ? undefined
              : (titles.titles.find((x) => x.id === lastLife.epithet)?.name ?? lastLife.epithet),
        };
  // ライバルの噂（T-47）：ランキングの筆頭ライバルが話題に混ざる
  const topRival = rivalsOf(state, rivals, balance.rivals).entries.find((e) => !e.isPlayer);
  // 勝負所の行事（X-10）：昨日臨んだ勝負所の結果は必ず記事になる
  // （行動ログの occasion/target/variant から行事名と勝敗を解く）
  const occasionResults = state.actionLog
    .filter((a) => a.day === day && a.kind === "occasion")
    .map((a) => ({ name: occasionName(a.target ?? ""), won: a.variant === "win" }));
  // 隠し要素のヒント（X-11）：未発見の発見は噂として新聞に必ず混ぜる
  const hint = discoveryHintLine(state);
  // 合成の噂（K-03）：未獲得のレシピのヒントも噂に混ぜる（条件は明かさない）
  const synthHint = synthesisHintLine(state);
  // NPCの歳月（X-12）：今日起きた街の人物の出来事は必ず記事になる
  const npcEvents = npcLifeToday(state, cfg.npcLife).map((e) => ({
    name: e.name,
    text: e.text,
  }));
  lines.push(
    ...narrator.narrate(
      {
        scene: "newspaper",
        deeds,
        works,
        deaths,
        ...(report.weather !== undefined
          ? { weather: { name: report.weather.name, line: report.weather.line } }
          : {}),
        ...(occasionResults.length > 0 ? { occasions: occasionResults } : {}),
        ...(npcEvents.length > 0 ? { npcEvents } : {}),
        ...(hint !== null || synthHint !== null
          ? { hints: [hint, synthHint].filter((h): h is string => h !== null) }
          : {}),
        ...(prevLife !== undefined ? { prevLife } : {}),
        ...(topRival !== undefined ? { rival: topRival } : {}),
        ...(title
          ? { newTitle: titles.titles.find((x) => x.id === title.id)?.name ?? title.id }
          : {}),
        ...(offer ? { newOffer: offerName(offer.id) } : {}),
      },
      createRng(`${state.seed}:news:${day}`),
    ),
  );
  return lines;
}

/** 宿の質プレビュー・料金（寝る画面用） */
export const inns = ["cheap", "normal", "good"] as const;
export function innQuality(inn: (typeof inns)[number], dinner: boolean): number {
  return sleepQuality(inn, dinner, balance.sleep);
}
export function innCost(inn: (typeof inns)[number], state?: GameState): number {
  const base = balance.sleep.innCost?.[inn] ?? 0;
  // 運命の傾向・誓約の世界補正（T-45/T-46：飢饉の世・高い宿の誓い）。実際の支払いは step 側
  if (state === undefined) return base;
  return Math.round(base * worldFactor(worldMods(state, cfg.tendency, cfg.vows), "innCostFactor"));
}

/**
 * 強化版ユニーク（T-44、06 §3B）：同種を unique.afterKills 体倒すと現れる。
 * 表示名は cli.json の uniqueName テンプレート。戦闘ルールの拡張は core の enhancedEnemy
 */
export type UniqueEnemy = EnemyJson & { uniqueVariant: true };
export function uniqueOf(state: GameState, enemy: EnemyJson): UniqueEnemy | null {
  const u = balance.combat.unique;
  if (u === undefined || !canFightUnique(state, enemy.id, u)) return null;
  return {
    ...enemy,
    ...enhancedEnemy(enemy, u),
    name: tpl(t.text.uniqueName, { name: enemy.name }),
    uniqueVariant: true,
  };
}

/** その日の特別注文（街の出来事。判定は core/src/town、コンテンツはここで注入） */
export interface SpecialOrder extends Order {
  expFactor: number;
  special: true;
}
export function specialOrderOf(seed: string, day: number): SpecialOrder | null {
  return coreSpecialOrderOf(seed, day, orders.orders, {
    chance: balance.town.specialOrderChance,
    expFactor: balance.town.specialOrderExpFactor,
    rewardFactor: balance.town.specialOrderRewardFactor,
    qualityFactor: balance.town.specialOrderQualityFactor,
  }) as SpecialOrder | null;
}

/**
 * その日の「勝負所」の注文（F-05、03 §2「使い所の原則」）。
 * showdown の印のある注文から日替わりで1件だけ選ぶ —— 一覧に並ぶ勝負所は
 * 特別注文（0〜1件）と合わせても1日2件に収まる。日常の注文は簡易判定が標準
 */
export function showdownOrderOf(state: GameState): Order | null {
  return coreShowdownOrderOf(state.seed, state.time.day, orders.orders);
}

/**
 * 危機の接点が仕事の注文に混ざる品（W-02、docs/08 §5）。
 * 「異変：」の印でさりげなく示すだけ —— 受けても受けなくてもよい日替わりの注文。
 * 判定（何が出るか）は core、ここでは表示用の形だけ作る
 */
export interface CrisisOrder extends Order {
  crisis: true;
}
export function crisisOrders(state: GameState): CrisisOrder[] {
  return crisisTouchpointOffers(state, cfg.crisis, cfg.time, condEnv).flatMap((o) =>
    o.order !== undefined
      ? [
          {
            id: o.order.id,
            kind: o.order.kind,
            name: `${t.text.touchpointTag}${o.order.name}`,
            targetQuality: o.order.targetQuality,
            rewardMoney: o.order.rewardMoney,
            crisis: true as const,
          },
        ]
      : [],
  );
}

/** 狩りの敵ID → 今日の接点ID（接点の相手には「異変：」の印を付ける。W-02） */
export function crisisEnemyTouchpoints(state: GameState): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of crisisTouchpointOffers(state, cfg.crisis, cfg.time, condEnv)) {
    if (o.vessel === "combat" && o.enemyId !== undefined) map.set(o.enemyId, o.def.id);
  }
  return map;
}

// ---- ミニゲーム（手動プレイ） ----
export const engines = {
  smithing: smithingGame(balance.minigame.smithing),
  performance: performanceGame(balance.minigame.performance),
  fishing: fishingGame(balance.minigame.fishing),
  mining: miningGame(balance.minigame.mining),
  appraisal: appraisalGame(balance.minigame.appraisal),
  negotiation: negotiationGame(balance.minigame.negotiation),
};

export type MinigameKind =
  "smithing" | "performance" | "fishing" | "mining" | "appraisal" | "negotiation";

/** タイミングエンジンの皮（鍛冶・演奏・釣り） */
const TIMING_KINDS = new Set<MinigameKind>(["smithing", "performance", "fishing"]);
/** 盤面推理エンジンの皮（採掘・鑑定） */
const BOARD_KINDS = new Set<MinigameKind>(["mining", "appraisal"]);
export const isTimingKind = (k: MinigameKind): boolean => TIMING_KINDS.has(k);
export const isBoardKind = (k: MinigameKind): boolean => BOARD_KINDS.has(k);

function timingEngineOf(kind: MinigameKind) {
  if (kind === "performance") return engines.performance;
  if (kind === "fishing") return engines.fishing;
  return engines.smithing;
}
function boardEngineOf(kind: MinigameKind) {
  return kind === "appraisal" ? engines.appraisal : engines.mining;
}

function minigameCtx(state: GameState, kind: MinigameKind, skillId?: string): MiniGameCtx {
  // K-01：皮と技能は別 —— 木工の注文を鍛冶の皮で遊ぶとき、
  // 腕の根拠になるのは注文の技能（木工）であって皮の技能（鍛冶）ではない
  const sid = skillId ?? (kind === "negotiation" ? "eloquence" : kind);
  return {
    skill: state.player.skills[sid]?.value ?? 0,
    skills: Object.fromEntries(Object.entries(state.player.skills).map(([k, v]) => [k, v.value])),
    seed: `${state.seed}:${kind}:${state.time.day}:${state.time.action}`,
  };
}

export function startMinigame(
  kind: MinigameKind,
  state: GameState,
  /** 難度の根拠にする技能（K-01。省略時は皮の技能） */
  skillId?: string,
): TimingState | BoardState | DealState {
  const ctx = minigameCtx(state, kind, skillId);
  if (BOARD_KINDS.has(kind)) return boardEngineOf(kind).init(ctx);
  if (kind === "negotiation") return engines.negotiation.init(ctx);
  return timingEngineOf(kind).init(ctx);
}

export function tickMinigame(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
  input: TimingInput | BoardInput | DealInput,
): TimingState | BoardState | DealState {
  if (BOARD_KINDS.has(kind)) return boardEngineOf(kind).tick(gs as BoardState, input as BoardInput);
  if (kind === "negotiation") return engines.negotiation.tick(gs as DealState, input as DealInput);
  return timingEngineOf(kind).tick(gs as TimingState, input as TimingInput);
}

export function minigameResult(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
): { quality: number; flags: string[]; done: boolean; detail: string } {
  if (TIMING_KINDS.has(kind)) {
    const s = gs as TimingState;
    const r = timingEngineOf(kind).result(s);
    const detail =
      kind === "performance"
        ? tpl(t.text.performanceDetail, { hits: r.hits, total: r.total })
        : kind === "fishing"
          ? tpl(t.text.fishingDetail, { hits: r.hits, total: r.total })
          : `${r.hits}/${r.total} 命中`;
    return { quality: r.quality, flags: r.flags, done: s.done, detail };
  }
  if (BOARD_KINDS.has(kind)) {
    const s = gs as BoardState;
    const r = boardEngineOf(kind).result(s);
    const detail =
      kind === "appraisal"
        ? tpl(t.text.appraisalDetail, { found: s.ores, total: s.oresTotal })
        : `鉱石 ${s.ores}/${s.oresTotal}`;
    return { quality: r.quality, flags: r.flags, done: s.done, detail };
  }
  const s = gs as DealState;
  const r = engines.negotiation.result(s);
  return {
    quality: r.quality,
    flags: r.flags,
    done: s.done,
    detail: r.won ? `交渉成立（${r.rounds} ラウンド）` : "交渉決裂",
  };
}

/** 簡易判定（03 §2） */
export function simpleQuality(state: GameState, kind: string): number {
  const hist = state.ledger
    .filter((w) => w.kind === kind)
    .slice(-balance.minigame.simpleHistorySize)
    .map((w) => w.quality);
  return simpleJudgmentQuality(hist, state.player.skills[kind]?.value ?? 0);
}

// ---- 戦闘 ----
function toEnemyDef(e: EnemyJson): EnemyDef {
  return {
    id: e.id,
    name: e.name,
    hp: e.hp,
    intervalTicks: e.intervalTicks,
    challenge: e.challenge,
    agility: e.agility,
    // 獣（K-01）：beast.attack / beast.exp の技能リンクが効く印
    ...(e.beast === true ? { beast: true as const } : {}),
    // 系統（G-04）：foe.<family> の使用タグに使う
    ...(e.family !== undefined ? { family: e.family } : {}),
    attack: e.attack,
    moves: e.moves,
    pattern: e.pattern,
    // K-02：耐性・弱点・状態耐性・壊せる部位（enemies.json からそのまま渡す）
    ...(e.resist !== undefined ? { resist: e.resist } : {}),
    ...(e.statusResist !== undefined ? { statusResist: e.statusResist } : {}),
    ...(e.parts !== undefined ? { parts: [...e.parts] } : {}),
  };
}

function combatCtx(state: GameState): MiniGameCtx {
  // K-01：ミニゲーム系乱数の「技能値」は装備中の武器の技能（持ち替えで変わる）
  const weaponSkillId = weaponDefOf(cfg.combat, state.player.weapon).skill;
  return {
    skill: state.player.skills[weaponSkillId]?.value ?? 0,
    skills: { observation: state.player.skills.observation?.value ?? 0 },
    seed: `${state.seed}:combat:${state.time.day}:${state.time.action}`,
  };
}

/**
 * 深層ダンジョン（T-43、06 §3B）：ランの開始とその層の敵。
 * 敵列は run.seed × floor で決定論的。強化は core の floorEnemy が行う
 */
export function newAbyssRun(state: GameState): AbyssRun {
  return startRun(abyssRunSeed(state.seed, state.counters["abyss.runs"] ?? 0), balance.abyss);
}
export function abyssFloorEnemy(run: AbyssRun): EnemyJson {
  return floorEnemy(run.seed, run.floor, enemies.enemies, balance.abyss);
}
export { endRun, killFloor, spendLight };

export function beginCombat(
  state: GameState,
  enemy: EnemyJson,
  /** 個体差の抽選鍵（深層はラン×層で別々に渡す。省略時は日付×敵種×行動序数） */
  encounterKey?: string,
  /**
   * プレイヤー情報の差し替え（K-02。深層の連戦で気力を次の層へ持ち越すときに
   * 前の層の残りを入れた player を渡す。省略時は state.player）
   */
  player?: CombatPlayer,
): CombatState {
  // 称号・認定職・師匠・読了書物の与ダメージ効果（T-35・T-27・T-26。例《百狼斬り》の damageVs.wolf）
  const fx = damageFactor(
    [
      ...activeEffects(
        state,
        cfg.titles,
        cfg.society.professions,
        cfg.mentors?.mentors,
        cfg.legacy?.artifactGainFactor,
      ),
      ...activeBookEffects(state, cfg.books),
    ],
    enemy.id,
  );
  // 運命の傾向・誓約の世界補正（T-45/T-46。戦乱の世・強敵の誓で敵が強くなる）
  const def = worldEnemyDef(state, enemy, encounterKey);
  const p: CombatPlayer = player ?? state.player;
  // M-01：魔力・属性適性（出自とシードの引き。同じ世界なら同じ適性）と、
  // 装備中の武器に刻まれた付与の威力を畳む
  const origin = origins.origins.find((o) => o.id === state.player.origin);
  const withMagic: CombatPlayer = {
    ...p,
    mana: p.mana ?? state.player.mana,
    aptitude:
      p.aptitude ??
      (cfg.magic === undefined ? {} : playerAptitudes(state, cfg.magic, origin?.elementBias)),
  };
  const withEnchant = attackFactorWithEnchant(
    state,
    p.weapon ?? state.player.weapon,
    fx,
    cfg.magic,
  );
  return startCombat(def, cfg.combat, withMagic, withEnchant);
}

/**
 * 個体差の抽選鍵（R-01）：出会いごとに決まる。既定は日×敵種×行動序数
 * （同じ日の同じ種の再戦は別の個体として抽選される）。深層など別の
 * 遭遇文脈では呼び出し側が鍵を渡す
 */
function individualKey(state: GameState, enemy: EnemyJson, encounterKey?: string): string {
  return `${state.seed}:ind:${encounterKey ?? `${state.time.day}:${enemy.id}:${state.counters["action.total"] ?? 0}`}`;
}

/** 個体差の対象か（強個体 uniqueVariant は固定の特別な相手なので重ねない） */
function individualApplies(enemy: EnemyJson): boolean {
  return (
    cfg.combat.individual !== undefined &&
    !("uniqueVariant" in enemy && enemy.uniqueVariant === true)
  );
}

/**
 * 敵に世界補正を掛ける（傾向・誓約 T-45/T-46 ＋ 危機の段階の影響 W-01）。
 * 危機由来の強化は傾向・誓約の係数に掛け合わされる。
 * その上で個体差（R-01）を出会いごとの決定的な抽選で掛ける
 */
function worldEnemyDef(state: GameState, enemy: EnemyJson, encounterKey?: string): EnemyDef {
  const fate = worldMods(state, cfg.tendency, cfg.vows);
  const cm = crisisEnemyMods(state, cfg.crisis, { id: enemy.id, area: enemy.area });
  const base = withWorldMods(toEnemyDef(enemy), {
    ...fate,
    enemyHpFactor: (fate.enemyHpFactor ?? 1) * cm.enemyHpFactor,
    enemyPowerFactor: (fate.enemyPowerFactor ?? 1) * cm.enemyPowerFactor,
  });
  if (!individualApplies(enemy)) return base;
  return rollIndividual(
    base,
    createRng(individualKey(state, enemy, encounterKey)),
    cfg.combat.individual!,
  ).def;
}

export function playCombatTurn(
  cs: CombatState,
  action: CombatAction,
  enemy: EnemyJson,
  state: GameState,
  /** 逃走判定などの乱数源（深層はラン×層で別々に渡す。省略時は日付×行動） */
  seed?: string,
  /** 個体差の抽選鍵（beginCombat と同じものを渡すこと） */
  encounterKey?: string,
): CombatState {
  const ctx = combatCtx(state);
  // beginCombat と同じ世界補正を敵に掛ける（T-45/T-46。ターン解決も同じ強さでないと不整合）
  const def = worldEnemyDef(state, enemy, encounterKey);
  return combatTurn(cs, action, def, cfg.combat, seed === undefined ? ctx : { ...ctx, seed });
}

/**
 * 戦闘画面が使う、世界補正済みの敵定義（F-04）。
 * beginCombat/playCombatTurn と同じ def を返すので、表示（予兆の名前・次行動）が
 * 解決側とずれない。個体差（R-01）も同じ鍵で掛かっている
 */
export function enemyDefOf(state: GameState, enemy: EnemyJson, encounterKey?: string): EnemyDef {
  return worldEnemyDef(state, enemy, encounterKey);
}

/**
 * 個体差の気質（R-01）：精悍（strong）・臆病（timid）・普通（normal）。
 * worldEnemyDef と同じ抽選鍵で引くので表示と解決が一致する
 */
export function enemyTraitOf(
  state: GameState,
  enemy: EnemyJson,
  encounterKey?: string,
): EnemyTrait {
  if (!individualApplies(enemy)) return "normal";
  return rollIndividual(
    toEnemyDef(enemy),
    createRng(individualKey(state, enemy, encounterKey)),
    cfg.combat.individual!,
  ).trait;
}

/** 個体差の気質に応じた表示名（精悍な狼・臆病な狼。normal は素の名） */
export function enemyDisplayName(
  state: GameState,
  enemy: EnemyJson,
  encounterKey?: string,
): string {
  const trait = enemyTraitOf(state, enemy, encounterKey);
  const adj = trait === "normal" ? undefined : t.display.enemyTraitNames[trait];
  return adj === undefined ? enemy.name : `${adj}${enemy.name}`;
}

/**
 * 師匠が今日は街にいないか（R-01、人の揺らぎ）。step の apprentice/trainWithMentor
 * と同じ抽選 —— この日に会おうとしてもいない。歳月・危機の退場（mentorAbsent）
 * とは別系統で、今日だけの不在
 */
export function mentorAwayToday(state: GameState, def: { id: string; npc?: string }): boolean {
  const v = cfg.variance;
  if (v === undefined) return false;
  return npcAway(state.seed, state.time.day, def.npc ?? def.id, v.npc);
}

/**
 * 今日の市場の相場係数（R-01。日×種目のジッター＋季節波）。
 * 注文画面の「相場▲/相場▼」の印に使う —— 表示用なので step 内の報酬計算と同じ式
 */
export function marketFactorOf(state: GameState, kind: string): number {
  const v = cfg.variance;
  if (v === undefined) return 1;
  return marketFactor(
    state.seed,
    state.time.day,
    kind,
    describe(state.time, cfg.time).season,
    cfg.time.seasonsPerYear,
    v.market,
  );
}

export { combatResult, combatIntent, telegraphLines, suggestGoals, sleepQuality };
export {
  crisisAreaClosed,
  crisisEnemyChallengeBonus,
  crisisFinaleOffers,
  crisisInvolvement,
  crisisOfferSpeaker,
  crisisRivalName,
  crisisSceneHaze,
  crisisTypeOf,
  occasionDef,
  occasionOffers,
  occasionSpeaker,
  incidentDef,
  incidentPendingChoice,
  incidentSpeaker,
  type IncidentOffer,
};

/**
 * 街の記録の「勝負所」欄（X-10）：行動ログの occasion から読む。
 * 勝敗の語りは新聞が担うので、ここは淡々とした結果の一覧だけ（最新10件）
 */
export function occasionRecordLines(state: GameState): string[] {
  const log = state.actionLog.filter((a) => a.kind === "occasion");
  const out: string[] = [t.text.recordsOccasions];
  if (log.length === 0) {
    out.push(t.text.recordsOccasionsNone);
    return out;
  }
  for (const a of log.slice(-10)) {
    out.push(
      tpl(t.text.recordsOccasionsLine, {
        day: a.day + 1,
        name: occasionName(a.target ?? ""),
        result:
          t.display.occasionResultNames[a.variant === "win" ? "win" : "loss"] ?? a.variant ?? "",
      }),
    );
  }
  return out;
}

/**
 * 街の記録の「世界の出来事」欄（W-01、docs/08）：危機の記録を
 * 出来事ログ（crisis.log）から表示行にする。段階や結末の語りは新聞・噂が担うので、
 * ここは淡々とした出来事の一覧だけ（最新10件）
 */
/** 世界の記録の ref（段階・場面・NPC・ライバルの id）→ 表示名（W-01〜W-04 共通） */
function crisisLogRefName(state: GameState, entry: { kind: string; ref?: string }): string {
  if (entry.ref === undefined) return "";
  const type = cfg.crisis !== undefined ? crisisTypeOf(state, cfg.crisis) : undefined;
  if (entry.kind === "stage") {
    return type?.stages.find((s) => s.id === entry.ref)?.name ?? entry.ref;
  }
  if (entry.kind.startsWith("finale.")) {
    return type?.finales.find((f) => f.id === entry.ref)?.name ?? entry.ref;
  }
  // ライバルの参照（"rival.<index>"）：英雄の記録（rival.hero）と歳月の記録
  // （npc.retire など、X-12）の両方が指す。ライバルの抽選から名を解決する
  if (entry.ref.startsWith("rival.")) {
    return cfg.crisis !== undefined ? crisisRivalName(state, cfg.crisis, entry.ref) : entry.ref;
  }
  if (entry.kind.startsWith("npc.")) {
    // G-01：生成地方の住人の参照は生成の名簿から引く
    const n = npcNameOf(state, entry.ref);
    if (n !== entry.ref) return n;
    return canon.figures.find((f) => f.id === entry.ref)?.name ?? entry.ref;
  }
  return entry.ref;
}

export function crisisRecordLines(state: GameState): string[] {
  const crisis = state.crisis;
  const out: string[] = [t.text.recordsCrisis];
  if (crisis === null || crisis.log.length === 0) {
    out.push(t.text.recordsCrisisNone);
    return out;
  }
  for (const entry of crisis.log.slice(-10)) {
    const text = crisisLogLine(entry.kind, crisisLogRefName(state, entry));
    if (text === null) continue;
    out.push(tpl(t.text.recordsCrisisLine, { day: entry.day + 1, text }));
  }
  return out;
}

/**
 * 街の記録の「ユニーク」欄（K-03、09 §7）：その世界で一人だけ持てる技の
 * 記録。state.uniques（技ID → 持ち主と獲得日）を淡々とした行にする。
 * 世界の記録は次代にも継がる（succeedLife）ので、前代の持ち主も列に残る
 */
export function uniqueRecordLines(state: GameState): string[] {
  const out: string[] = [t.text.recordsUniques];
  const entries = Object.entries(state.uniques).sort(
    (a, b) => a[1].day - b[1].day || a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) {
    out.push(t.text.recordsUniquesNone);
    return out;
  }
  for (const [id, u] of entries.slice(-10)) {
    const holder =
      u.holder === "player"
        ? t.text.recordsUniqueYou
        : tpl(t.text.recordsUniqueRival, { rival: uniqueHolderName(state, u.holder) });
    out.push(
      tpl(t.text.recordsUniqueLine, { day: u.day + 1, name: allArtDefs[id]?.name ?? id, holder }),
    );
  }
  return out;
}

/**
 * 終幕の素材（W-04、docs/08 §7）：決着/滅びの紙の層の語り＋関与の段階の痕跡。
 * 表示名（NPC・ライバル・役割・段階・作品）はここで解決する。
 * 進行中・危機の無い世界では null（終幕の画面は出さない）
 */
export function endingOf(state: GameState): CrisisEnding | null {
  return crisisEnding(state, cfg.crisis, narration.crisis, {
    stage: (s) => t.display.crisisStageNames[String(s)] ?? String(s),
    role: (r) => t.display.crisisRoleNames[r] ?? r,
    npc: (id) =>
      // G-01：生成地方の住人の名は生成の名簿から引く
      (npcNameOf(state, id) !== id ? npcNameOf(state, id) : undefined) ??
      canon.figures.find((f) => f.id === id)?.name ??
      id,
    rival: (ref) => (cfg.crisis !== undefined ? crisisRivalName(state, cfg.crisis, ref) : ref),
    work: (w) => workName(w, state),
  });
}

/** その世界の年代記の一頁（終幕の画面の右紙。世界の記録を日付つきの行にする） */
export function endingPageLines(state: GameState): { day: number; text: string }[] {
  const ending = endingOf(state);
  if (ending === null) return [];
  return ending.page.flatMap((entry) => {
    const text = crisisLogLine(entry.kind, crisisLogRefName(state, entry));
    return text === null ? [] : [{ day: entry.day + 1, text }];
  });
}
export type { BoardState, CombatState, DealState, TimingState };
export type { Order };

/* ======== UI-01: 画面表示用ヘルパー（読み出しと整形だけ。ルールはcore） ======== */

/** 日付の表示ラベル（「第2年 芽吹きの季 11日目」相当） */
export function dateLabel(state: GameState): string {
  const d = describe(state.time, cfg.time);
  const season = t.display.seasonNames[d.season] ?? "";
  return `${d.year + 1}年目 ${season}${d.dayOfSeason + 1}日目`;
}

/** あなたへの風（新聞のサイド枠・メニューの追い風表示用） */
export function windChips(state: GameState): { direction: WindDirection; label: string }[] {
  return state.today.winds.map((w) => ({ direction: w.direction, label: w.label }));
}

/** 技能の状態チップ（ステータスの技能行）：風＞錆＞平常の優先度で1個 */
export function skillChip(
  state: GameState,
  skillId: string,
): { tone: "gold" | "warn" | "plain"; text: string } {
  const wind = state.today.winds.find((w) => w.target.kind === "skill" && w.target.id === skillId);
  if (wind) {
    return {
      tone: wind.direction === "tailwind" ? "gold" : "warn",
      text: `${wind.direction === "tailwind" ? "▲" : "▼"}${wind.label}`,
    };
  }
  const st = state.player.skills[skillId];
  const rust = cfg.sleep?.rust;
  if (!st || !rust) return { tone: "plain", text: "―" };
  const total = Object.values(state.player.skills).reduce((a, s) => a + s.value, 0);
  const idle = state.time.day - st.lastUsedDay;
  const grace = effectiveGraceDays(total, rust);
  if (idle > grace && rustedValue(st.value, st.peak, idle, total, rust) < st.value) {
    return { tone: "warn", text: "錆びている" };
  }
  const left = grace - idle;
  // 猶予が近い技能だけ警告を出す表示上のしきい値（ルールではなく見た目の閾値）
  const RUST_SOON_DAYS = 3;
  if (left <= RUST_SOON_DAYS && st.value > 0) return { tone: "plain", text: `錆まで${left}日` };
  return { tone: "plain", text: "―" };
}

/** 行動 kind の表示名（新聞の「昨日の記録」欄用） */
function deedLabel(state: GameState, kind: string, target?: string): string {
  switch (kind) {
    case "train":
      return `${skills.skills.find((s) => s.id === target)?.name ?? target ?? ""}の鍛錬`;
    case "work":
      return "仕事";
    case "combat":
      return `${enemies.enemies.find((e) => e.id === target)?.name ?? "魔物"}との戦い`;
    case "abyss":
      return "深層への潜行";
    case "dungeon":
      return "迷宮の探索";
    case "occasion":
      // 勝負所の行事（X-10）：臨んだ行事の名を記録欄に出す
      return `《${occasionName(target ?? "")}》に臨んだ`;
    case "read":
      return "読書";
    case "donate":
      return "街への奉仕";
    case "wait":
      return "休息";
    case "travel":
      // 街の外への移動（P-01）：行き先の場所名まで記録欄に出す
      return `${placeName(state, target)}への移動`;
    // ---- 日々の営み（P-02） ----
    case "stroll":
      return "散策";
    case "gather":
      return `${placeName(state, target)}での採集`;
    case "cook":
      return `${itemName(target ?? "")}の料理`;
    case "gamble":
      return "賭け事";
    case "pray":
      return "祈り";
    case "spot":
      // 地点への立ち寄り（G-01）：地点の名は生成の場所・行動から引く
      return "地点への立ち寄り";
    case "social":
      return `${npcName(state, target ?? "")}との時間`;
    case "errand": {
      const name = lifeCfgFor(state)?.errands.find((e) => e.id === target)?.name ?? target ?? "";
      return `依頼《${name}》`;
    }
    case "journey":
      return `${townName(state, target ?? "")}への旅`;
    default:
      return kind;
  }
}

/** 朝刊（News 画面・起床画面の「新聞を見る」用）。材料は前日の記録 */
export interface NewsPack {
  /** 何日目の出来事を載せた紙面か（-1 なら前日なし＝創刊前） */
  day: number;
  /** 第N号（発行日＝今日） */
  issueDay: number;
  dateLabel: string;
  /** 一面の見出し（narrate newspaper の先頭行以外。header は紙の題字に置き換わる） */
  lead: string;
  /** 三栏「昨日の記録」の事実リスト */
  record: string[];
  /** 二栏の続報・噂（事実＋勘違い混じり） */
  rumors: string[];
  /** 街の声（voices.json の住人） */
  voices: { name: string; role: string; text: string }[];
  winds: { direction: WindDirection; label: string }[];
  /** 号外級か（世界初・強個体・S級の出来事があった日） */
  extra: boolean;
}

export function newsPack(state: GameState, events: readonly ActionEvent[] = []): NewsPack {
  // 紙面は「今朝届いた朝刊」＝昨日までの記録を載せる（起床直後＝新しい日の朝）
  const day = state.time.day - 1;
  const rng = (tag: string) => createRng(`${state.seed}:news:${day}:${tag}`);
  const deeds = state.actionLog.filter((a) => a.day === day).map((a) => a.kind);
  const works = state.ledger
    .filter((w) => w.day === day)
    .map((w) => ({ name: workName(w, state), quality: w.quality, tier: w.tier }));
  const deaths = state.counters["death.count"] ?? 0;
  const lastLife = loadChronicle().lives.at(-1);
  const prevLife =
    lastLife === undefined
      ? undefined
      : {
          name: lastLife.name,
          epithet:
            lastLife.epithet === undefined
              ? undefined
              : (titles.titles.find((x) => x.id === lastLife.epithet)?.name ?? lastLife.epithet),
        };
  const topRival = rivalsOf(state, rivals, balance.rivals).entries.find((e) => !e.isPlayer);
  // 勝負所の行事（X-10）：昨日臨んだ勝負所の結果は必ず記事になる
  const occasionResults = state.actionLog
    .filter((a) => a.day === day && a.kind === "occasion")
    .map((a) => ({ name: occasionName(a.target ?? ""), won: a.variant === "win" }));
  // 隠し要素のヒント（X-11）：未発見の発見は噂として紙面に必ず混ぜる
  const hint = discoveryHintLine(state);
  // 合成の噂（K-03）：未獲得のレシピのヒントも噂に混ぜる（条件は明かさない）
  const synthHint = synthesisHintLine(state);
  // NPCの歳月（X-12）：今日起きた街の人物の出来事は続報・噂の欄に必ず混ざる
  const npcEvents = npcLifeToday(state, cfg.npcLife).map((e) => ({
    name: e.name,
    text: e.text,
  }));
  // 天候（X-13）：朝刊は今日の空の風景を滲ませる（seed+day の導出値）
  const weatherReq =
    cfg.weather === undefined
      ? undefined
      : (() => {
          const w = weatherOf(state.seed, state.time.day, cfg.weather, cfg.time);
          return { name: w.kind.name, line: w.line };
        })();
  const req = {
    deeds,
    works,
    deaths,
    ...(weatherReq !== undefined ? { weather: weatherReq } : {}),
    ...(occasionResults.length > 0 ? { occasions: occasionResults } : {}),
    ...(npcEvents.length > 0 ? { npcEvents } : {}),
    ...(hint !== null || synthHint !== null
      ? { hints: [hint, synthHint].filter((h): h is string => h !== null) }
      : {}),
    ...(prevLife !== undefined ? { prevLife } : {}),
    ...(topRival !== undefined ? { rival: topRival } : {}),
  };
  const lead = narrator.narrate({ scene: "newspaper", ...req }, rng("lead"))[1] ?? "";
  // 続報欄：別の言い回しをもう2本（同じ行が出たら1本減らす）
  const rumors = [
    ...narrator.narrate({ scene: "newspaper", ...req }, rng("r1")),
    ...narrator.narrate({ scene: "newspaper", ...req }, rng("r2")),
  ]
    .slice(1)
    .concat(narrator.narrate({ scene: "newspaper", ...req }, rng("r3"))[1] ?? "")
    .filter((x, i, a) => x !== "" && x !== lead && a.indexOf(x) === i)
    .slice(0, 2);
  // 危機の記事（W-04、docs/08 §3「画面に危機の段階を常に出さない」）：
  // 段階は欄を設けて見せず、世界の出来事として続報の先頭に混ぜる
  const crisisLine =
    cfg.crisis !== undefined
      ? crisisStageLine(state, cfg.crisis, narration.crisis, rng("crisis"))
      : null;
  if (crisisLine !== null) rumors.unshift(crisisLine);
  // ユニークの記事（K-03）：その世界で一人だけの技が動いた（得た／先取られた）
  // 出来事は世界の記事として続報の先頭に来る —— 号外級の材料そのもの
  const uniqueLines = events.flatMap((e) => {
    if (e.type === "uniqueGained" && !e.suppressed) {
      return [tpl(t.text.newsUniqueGained, { name: allArtDefs[e.art]?.name ?? e.art })];
    }
    if (e.type === "uniqueClaimed") {
      return [
        tpl(t.text.newsUniqueClaimed, {
          name: allArtDefs[e.art]?.name ?? e.art,
          rival: uniqueHolderName(state, e.rival),
        }),
      ];
    }
    return [];
  });
  // 迷宮の主の討伐（G-03）：制覇・ユニークモンスターの討伐は続報の先頭に載る
  const bossLines = events.flatMap((e) => {
    if (e.type !== "bossDefeated") return [];
    const d = dungeonOf(state, e.dungeon);
    const base = enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId;
    const name = d !== undefined ? bossName(d, base) : e.enemyId;
    const at = d?.name ?? e.dungeon;
    return [
      e.unique
        ? tpl(t.text.newsUniqueBoss, { name, name2: at })
        : tpl(t.text.newsBossDefeated, { name: at }),
    ];
  });
  rumors.unshift(...bossLines, ...uniqueLines);
  rumors.splice(3);

  // 昨日の記録：行動種別ごとにまとめる
  const grouped = new Map<string, number>();
  for (const a of state.actionLog.filter((x) => x.day === day)) {
    const key = deedLabel(state, a.kind, a.target);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const recordLines = [...grouped.entries()].map(([label, n]) =>
    n > 1 ? `${label} ×${n}` : label,
  );
  for (const w of works) recordLines.push(`《${w.name}》を仕上げた`);

  // 街の声：住人を2〜3人選び、話題があれば respect、無ければ greet。
  // 危機の段階・歳月の退場で街に居なくなった住人は紙面に出ない（W-04/X-12：人の不在で伝える）
  const deed = deeds.includes("combat")
    ? "狩り"
    : deeds.includes("work")
      ? "仕事"
      : deeds.includes("donate")
        ? "奉仕"
        : undefined;
  const npcRng = rng("npc");
  const rest = [...voiceNpcsOf(state)].filter((n) => npcGoneReason(state, n.id) === null);
  const pool = [0, 1, 2].flatMap(() =>
    rest.length > 0 ? [rest.splice(npcRng.int(0, rest.length - 1), 1)[0]!] : [],
  );
  // 歳月の出来事の話題（X-12）：最近の街の出来事を「聞いたかい？」と囁く声が
  // 噂が残る期間のあいだ混ざる（口調は人物のまま、話題だけ差し替える）
  const recent = npcLifeRecent(state, cfg.npcLife, balance.town.npcRumorDays);
  const voiceLines = pool.map((npc, i) => {
    if (i === 0 && recent.length > 0 && rng("vcomment").next() < 0.5) {
      const ev = rng("vcomment-ev").pick(recent.map((r) => r.text));
      return {
        name: npc.name,
        role: npc.role,
        text: tpl(t.text.npcTownComment, { name: npc.name, text: ev }),
      };
    }
    const lr = npc.lines;
    const standing = state.society.standing;
    const by = lr.byStanding?.[standing];
    const text =
      deed !== undefined
        ? tpl(
            (by?.respect ?? lr.respect)[
              rng(`v:${npc.id}`).int(0, (by?.respect ?? lr.respect).length - 1)
            ]!,
            {
              name: state.player.name,
              deed,
            },
          )
        : tpl(
            (by?.greet ?? lr.greet)[rng(`v:${npc.id}`).int(0, (by?.greet ?? lr.greet).length - 1)]!,
            {
              name: state.player.name,
            },
          );
    return { name: npc.name, role: npc.role, text };
  });

  // 号外級：この朝に届く号外＝世界初の記録か強個体討伐・ユニークの行方が
  // 昨夜までに刻まれた日（K-03：一人だけの技は世界の出来事）
  const extra = events.some(
    (e) =>
      (e.type === "titleGained" && !e.suppressed && e.rank === "S") ||
      e.type === "uniqueDefeated" ||
      e.type === "uniqueGained" ||
      e.type === "uniqueClaimed" ||
      (e.type === "bossDefeated" && e.unique) ||
      (e.type === "pinnacleStageReached" && e.rank === "S"),
  );
  return {
    day,
    issueDay: state.time.day,
    dateLabel: dateLabel(state),
    lead,
    record: recordLines,
    rumors,
    voices: voiceLines,
    winds: windChips(state),
    extra,
  };
}

/** メイン画面の会話窓：その日の街の住人の一言（日替わり・決定的）。
    P-02：声を掛けるのは今いる町の場所に住む人だけ（ベルンにベルンの人） */
export function townVoice(state: GameState): { name: string; role: string; text: string } {
  const rng = createRng(`${state.seed}:voice:${state.time.day}`);
  // 危機の段階・歳月の退場で街に居なくなった住人は窓に出ない（W-04/X-12：人の不在で伝える）
  const locals = new Set(townPlacesIn(state, townOf(state)).flatMap((p) => p.npcs));
  const all = voiceNpcsOf(state);
  const pool = all.filter((n) => locals.has(n.id) && npcGoneReason(state, n.id) === null);
  const npc = rng.pick(pool.length > 0 ? pool : [...all]);
  return npcVoiceLine(state, rng, npc);
}

/**
 * 場所の会話窓（P-01）：その場所に居る人の一言（日替わり・決定的）。
 * 居る人が皆いなくなっていたら null —— 場所の描写だけが残る
 */
export function placeVoice(
  state: GameState,
  place: PlaceLike,
): { name: string; role: string; text: string } | null {
  const pool = voiceNpcsOf(state).filter(
    (n) => place.npcs.includes(n.id) && npcGoneReason(state, n.id) === null,
  );
  if (pool.length === 0) return null;
  const rng = createRng(`${state.seed}:pvoice:${place.id}:${state.time.day}`);
  return npcVoiceLine(state, rng, rng.pick(pool));
}

/** 住人の一言を決める（townVoice/placeVoice 共用） */
function npcVoiceLine(
  state: GameState,
  rng: Rng,
  npc: VoiceLike,
): { name: string; role: string; text: string } {
  const deeds = state.actionLog.filter((a) => a.day === state.time.day - 1).map((a) => a.kind);
  const deed = deeds.includes("combat")
    ? "狩り"
    : deeds.includes("work")
      ? "仕事"
      : deeds.includes("train")
        ? "鍛錬"
        : deeds.includes("donate")
          ? "奉仕"
          : undefined;
  // 歳月の出来事の話題（X-12）：最近の街の出来事を「聞いたかい？」と囁く。
  // 噂が残る期間のあいだ、半分ほどの日で挨拶の代わりにこの話題になる
  const recent = npcLifeRecent(state, cfgFor(state).npcLife, balance.town.npcRumorDays);
  if (recent.length > 0 && rng.next() < 0.5) {
    const ev = rng.pick(recent.map((r) => r.text));
    return {
      name: npc.name,
      role: npc.role,
      text: tpl(t.text.npcTownComment, { name: npc.name, text: ev }),
    };
  }
  const by = npc.lines.byStanding?.[state.society.standing];
  const lines =
    deed !== undefined ? (by?.respect ?? npc.lines.respect) : (by?.greet ?? npc.lines.greet);
  const text = tpl(lines[rng.int(0, lines.length - 1)]!, {
    name: state.player.name,
    deed: deed ?? "",
  });
  return { name: npc.name, role: npc.role, text };
}

/** 下帯の「噂」（新聞の rumor 系を1本、日替わり・決定的） */
export function townRumor(state: GameState): string {
  const rng = createRng(`${state.seed}:rumor:${state.time.day}`);
  // 危機は噂で知る（W-04、docs/08 §3）：進行中は一日おきに、滅びた世は毎日、
  // 世界の噂が下帯に混ざる。段階の数字は出さない
  const crisis =
    cfg.crisis !== undefined ? crisisStageLine(state, cfg.crisis, narration.crisis, rng) : null;
  if (crisis !== null && (state.crisis?.outcome === "ruin" || state.time.day % 2 === 0)) {
    return `噂 ―「${crisis}」`;
  }
  // 歳月の噂（X-12）：街の人物の出来事は噂が残る期間（balance.town.npcRumorDays）
  // だけ下帯に混ざる。起きた日は必ず、あとは4日おきに取り上げられる
  const recent = npcLifeRecent(state, cfgFor(state).npcLife, balance.town.npcRumorDays);
  if (recent.length > 0 && (recent[0]!.day === state.time.day || state.time.day % 4 === 3)) {
    return `噂 ―「${rng.pick(recent.map((r) => r.text))}」`;
  }
  // 隠し要素の噂（X-11）：未発見の発見のヒントを下帯の噂ローテーションに混ぜる。
  // 新聞には毎日載るので下帯では一日おき（危機の噂が優先する偶数日と交互）
  const hint = discoveryHintLine(state);
  if (hint !== null && state.time.day % 2 === 1) {
    return `噂 ―「${hint}」`;
  }
  const deeds = state.actionLog.filter((a) => a.day === state.time.day - 1).map((a) => a.kind);
  const line = narrator.narrate({ scene: "newspaper", deeds, works: [], deaths: 0 }, rng)[1];
  return `噂 ―「${line ?? "今日は静かだ"}」`;
}

/** 通知（UI-01：Notice見本）。Sは全画面・Aは光る窓。引数は1回の step のイベント列 */
export interface Notice {
  rank: "S" | "A";
  /** 見出し（称号名など） */
  title: string;
  /** 副題 */
  sub: string;
  /** 報酬の行（称号・作品・見聞の断片など） */
  rewards: { label: string; name: string; sub?: string }[];
  /** 欧文の小見出し（S=帯の上段・A=窓の頭。省略時は WORLD FIRST / NOTICE） */
  kicker?: string;
  /** 帯の導入文（S。省略時は「この世界で、初めての記録です」） */
  lead?: string;
  /** 帯の末尾の小文（S。省略時は年代記への言及） */
  footnote?: string;
  /**
   * 人物からの会話として出す（W-04：決着の場面への打診は
   * 会話の窓で人物が持ちかける。speaker/行を持つと DialogueBox で描く）
   */
  dialogue?: { speaker: string; lines: string[]; hint?: string };
  /** 閉じたあと結末画面（世界の年代記の一頁）を開く（W-04：終幕の通知） */
  openEnding?: boolean;
  /** 開くときの効果音（F-02。省略時はランクの既定：S=world・A=notice） */
  sound?: SoundId;
}

export function noticesOf(events: ActionEvent[], state?: GameState): Notice[] {
  const out: Notice[] = [];
  for (const e of events) {
    if (e.type === "titleGained" && !e.suppressed && e.rank === "S") {
      const def = titles.titles.find((x) => x.id === e.id);
      const rewards: Notice["rewards"] = [{ label: "称号", name: `《${def?.name ?? e.id}》` }];
      // 同じ出来事で世界に刻まれたものを報酬欄に並べる
      const facts = events.filter((x) => x.type === "factLearned").length;
      if (facts > 0) rewards.push({ label: "見聞録", name: `新しい断片 ${facts}` });
      const work = events.find(
        (x): x is Extract<ActionEvent, { type: "workRecorded" }> => x.type === "workRecorded",
      );
      if (work) {
        rewards.push({
          label: "作品",
          name: `《${workName(work.work, state)}》`,
          sub: `品質${Math.round(work.work.quality)}`,
        });
      }
      out.push({
        rank: "S",
        title: def?.name ?? e.id,
        sub: "世界で初めての記録です",
        rewards,
        sound: "world",
      });
    }
    // Aランクの称号（F-02）：珍しい称号は扇の音とともに光る窓で届く
    if (e.type === "titleGained" && !e.suppressed && e.rank === "A") {
      const def = titles.titles.find((x) => x.id === e.id);
      const name = def?.name ?? e.id;
      out.push({
        rank: "A",
        kicker: "NEW TITLE",
        title: `《${name}》`,
        sub: "――新しい称号を獲得しました。",
        rewards: [{ label: "称号", name: `《${name}》` }],
        sound: "fanfare",
      });
    }
    // 自己ベストの更新（F-02）：ティアの切れ目は Aランクの出来事
    if (e.type === "tierUp") {
      const kind = skills.skills.find((s) => s.id === e.kind)?.name ?? e.kind;
      out.push({
        rank: "A",
        kicker: "NEW RECORD",
        title: `ティア ${e.tier} ―― 自己ベスト`,
        sub: `《${kind}》の作品が、あなたの記録を塗り替えました。`,
        rewards: [{ label: "記録", name: `${kind}・ティア${e.tier}` }],
        sound: "rankup",
      });
    }
    // 派生スキルの解放（F-02。03 §6：派生スキルはAランク）
    if (e.type === "skillUnlocked") {
      const name = skills.skills.find((s) => s.id === e.id)?.name ?? e.id;
      out.push({
        rank: "A",
        kicker: "NEW SKILL",
        title: `《${name}》`,
        sub: "――身体が理屈を掴んだ。新しい技能を鍛えられるようになりました。",
        rewards: [{ label: "技能", name: `《${name}》` }],
        sound: "rankup",
      });
    }
    // 立場・職業の認定の打診（03 §1。通知Aランク相当）
    if (e.type === "offerReceived") {
      const name = offerName(e.id);
      out.push({
        rank: "A",
        kicker: "OFFER",
        title: `《${name}》への打診`,
        sub: "――認定の話が届きました。目標と認定で応えられます。",
        rewards: [{ label: "打診", name: `《${name}》` }],
        sound: "notice",
      });
    }
    // 深層の自己ベスト（T-43。newBest は Aランク相当の出来事）
    if (e.type === "abyssEnded" && e.newBest) {
      out.push({
        rank: "A",
        kicker: "BEST DEPTH",
        title: `深層 第${e.best}層`,
        sub: tpl(t.text.abyssBest, { best: e.best }),
        rewards: [{ label: "深層", name: `第${e.best}層` }],
        sound: "rankup",
      });
    }
    if (e.type === "uniqueDefeated") {
      const name = enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId;
      out.push({
        rank: "A",
        title: `《${name}》を討伐`,
        sub: "強個体は図鑑に刻まれました",
        rewards: [{ label: "図鑑", name: `《${name}》` }],
        sound: "fanfare",
      });
    }
    // 迷宮の制覇（G-03）：最後の潜りで主を討ったとき —— Aランクの窓
    if (e.type === "dungeonEnded" && e.done) {
      const d = state === undefined ? undefined : dungeonOf(state, e.id);
      const name = d?.name ?? e.id;
      out.push({
        rank: "A",
        kicker: "DUNGEON CLEARED",
        title: `《${name}》を制覇`,
        sub: tpl(t.text.dungeonConquered, { name }),
        rewards: [{ label: "迷宮", name: `《${name}》` }],
        sound: "fanfare",
      });
    }
    // 迷宮の主の討伐（G-03）：通常の主はA、世界に1体のユニークはS ——
    // 「世界初」の記録として一番大きな帯で届く
    if (e.type === "bossDefeated") {
      const d = state === undefined ? undefined : dungeonOf(state, e.dungeon);
      const base = enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId;
      const name = d !== undefined ? bossName(d, base) : e.enemyId;
      if (e.unique) {
        out.push({
          rank: "S",
          kicker: "UNIQUE MONSTER",
          title: `《${name}》`,
          sub: "世界で初めての記録です ―― この世界に1体の魔物を討ち取りました。",
          rewards: [{ label: "ユニーク", name: `《${name}》` }],
          sound: "world",
        });
      } else {
        out.push({
          rank: "A",
          kicker: "BOSS DOWN",
          title: `《${name}》`,
          sub: tpl(t.text.dungeonBossDown, { name }),
          rewards: [{ label: "主", name: `《${name}》` }],
          sound: "fanfare",
        });
      }
    }
    // 技の進化（K-03）：積み重ねの形が変わる節目 —— Aランクの窓。
    // 隠し分岐は「見知らぬ形」として同じ格で届く（進化形の名はここで初めて明かされる）
    if (e.type === "artEvolved") {
      const to = allArtDefs[e.to]?.name ?? e.to;
      out.push({
        rank: "A",
        kicker: e.hidden ? "UNKNOWN FORM" : "EVOLVED",
        title: `《${to}》`,
        sub: tpl(e.hidden ? t.text.artEvolvedHidden : t.text.artEvolved, {
          from: allArtDefs[e.from]?.name ?? e.from,
          to,
          reason: e.reason,
        }),
        rewards: [{ label: "進化", name: `《${to}》` }],
        sound: "rankup",
      });
    }
    // ユニークを得た（K-03）：「その世界で一人だけ」の技 —— 世界初の記録として
    // Sランクの帯で届く（suppressed の分は札へ：tagsOf）
    if (e.type === "uniqueGained" && !e.suppressed) {
      const name = allArtDefs[e.art]?.name ?? e.art;
      out.push({
        rank: "S",
        kicker: "UNIQUE ART",
        title: `《${name}》`,
        sub: "世界で初めての記録です ―― この技は、この世界であなただけのものです。",
        rewards: [{ label: "ユニーク", name: `《${name}》` }],
        sound: "world",
      });
    }
    // ライバルに先取られた（K-03）：世界が動いた記録 —— Aランクの窓
    if (e.type === "uniqueClaimed") {
      const name = allArtDefs[e.art]?.name ?? e.art;
      out.push({
        rank: "A",
        kicker: "UNIQUE LOST",
        title: `《${name}》`,
        sub: tpl(t.text.uniqueClaimed, {
          name,
          rival: uniqueHolderName(state, e.rival),
        }),
        rewards: [{ label: "ユニーク", name: `《${name}》` }],
        sound: "notice",
      });
    }
    if (e.type === "pinnacleStageReached" && e.rank !== "B") {
      const route = pinnacles.pinnacles.find((r) => r.id === e.route);
      const stage = route?.stages.find((s) => s.id === e.stage);
      out.push({
        rank: e.rank === "S" ? "S" : "A",
        title: stage?.name ?? e.stage,
        sub: `${route?.name ?? e.route} ―― 頂点への段`,
        rewards: [{ label: "頂点", name: `《${route?.name ?? e.route}》` }],
        sound: e.rank === "S" ? "world" : "rankup",
      });
    }
    if (e.type === "goalAchieved") {
      const name = society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id;
      out.push({
        rank: "A",
        title: `人生目標《${name}》を達成`,
        sub: "誓いは果たされました",
        rewards: [{ label: "人生目標", name: `《${name}》` }],
        sound: "fanfare",
      });
    }
    // 決着の場面への打診（W-03・W-04、docs/08 §6）：関与が段階3・4に届いた証。
    // 会話の窓で人物から持ちかけられる形にする（その場面に備えを積んだ勢力の使い）
    if (e.type === "crisisFinaleOffered") {
      const name = crisisRefName(e.id, "finales");
      const faction =
        state !== undefined && cfg.crisis !== undefined
          ? crisisOfferSpeaker(state, cfg.crisis, e.id)
          : null;
      const offer = narration.crisis.offer;
      const speaker = tpl(offer.speaker, { faction: faction ?? "街" });
      out.push({
        rank: "A",
        title: `《${name}》への打診`,
        sub: "世界の決着に、あなたの名が挙がりました",
        rewards: [{ label: "決着の場面", name: `《${name}》` }],
        dialogue: {
          speaker,
          lines: [tpl(offer.line, { name })],
          hint: offer.hint,
        },
        sound: "notice",
      });
    }
    // 終幕（W-04、docs/08 §7）：危機の決着は世界級の出来事 ―― ランクSの通知。
    // このあと結末画面（紙の層の語り＋世界の年代記の一頁）が開く
    if (e.type === "crisisEnded") {
      const type =
        state !== undefined && cfg.crisis !== undefined
          ? crisisTypeOf(state, cfg.crisis)
          : undefined;
      const stage =
        state !== undefined && cfg.crisis !== undefined
          ? (t.display.crisisStageNames[String(crisisInvolvement(state, cfg.crisis).stage)] ?? "")
          : "";
      const n = narration.crisis.notice;
      const resolved = e.outcome === "resolved";
      out.push({
        rank: "S",
        openEnding: true,
        kicker: n.kicker,
        lead: n.lead,
        footnote: n.footnote,
        title: resolved ? n.resolvedTitle : n.ruinTitle,
        sub: tpl(resolved ? n.resolvedSub : n.ruinSub, { type: type?.name ?? "" }),
        rewards: [
          { label: n.worldPage, name: `《${type?.name ?? ""}》` },
          ...(stage !== "" ? [{ label: n.involvement, name: `《${stage}》` }] : []),
        ],
        sound: "world",
      });
    }
    // 自分で起こした決着（W-03）：英雄の記録は世界級の出来事。成がS、不成でもA
    if (e.type === "crisisFinaleLed") {
      const name = crisisRefName(e.id, "finales");
      out.push({
        rank: e.success ? "S" : "A",
        title: e.success ? `《${name}》を率いた` : `《${name}》は届かなかった`,
        sub: e.success
          ? "あなたが率いた決着は、世界の記録に刻まれました"
          : "備えは足りませんでした",
        rewards: [{ label: "決着の場面", name: `《${name}》` }],
        sound: e.success ? "world" : "notice",
      });
    }
    // 勝負所の行事（X-10、docs/03 §2）：勝ちは物語を動かすAランクの出来事。
    // 打診（occasionOffered）はB＝記録の一行だけ、負けも記録に留める（新聞が語る）
    if (e.type === "occasionAttempted" && e.won) {
      const name = occasionName(e.id);
      out.push({
        rank: "A",
        kicker: "VICTORY",
        title: `《${name}》で勝ちを収めた`,
        sub: "勝負所の結果は、あなたの評判を動かします",
        rewards: [{ label: "勝負所", name: `《${name}》` }],
        sound: "fanfare",
      });
    }
    // ライバルの英雄（W-03）：自分でなくとも世界は進む ―― 記録として届くAランク
    if (e.type === "crisisRivalHero") {
      const name =
        cfg.crisis !== undefined && state !== undefined
          ? crisisRivalName(state, cfg.crisis, `rival.${e.index}`)
          : `rival.${e.index}`;
      out.push({
        rank: "A",
        title: `${name} が英雄となった`,
        sub: "世界はあなたを待たずに、決着へ進みました",
        rewards: [{ label: "英雄", name }],
        sound: "notice",
      });
    }
  }
  return out;
}

/** 起床画面用の分解（WakeReport を見本の行構成に分ける） */
export interface WakePack {
  quality: string;
  inn: string;
  dinner: string;
  /** 技能の変化行（名前・前→後・差分・翌日への持ち越し分） */
  skillLines: { name: string; from: number; to: number; delta: number; carried?: number }[];
  statLines: { name: string; delta: number }[];
  /**
   * この睡眠で越えたランク帯（F-01。名前・到達ランク名は解決済み。
   * F-02 の節目演出がここを読む）
   */
  rankUps: { name: string; rank: string; fromRank: number; toRank: number }[];
  gifts: string[];
  /**
   * この眠りで新しい技能・武技を得たか（X-07。surprises は錆・体調・加齢の
   * 知らせで「新しい技能」は絶対に入らない —— 帯のキッカーを NEW SKILL に
   * してよいかは、獲得系イベントの有無でだけ決める）
   */
  newSkill: boolean;
  winds: { direction: WindDirection; label: string }[];
  /**
   * 今朝の天候の1行（X-13。テンプレート cli.json wake.weatherLine 済みの文。
   * 天候表の無い世界では null —— 窓の外の風景としてだけ滲ませる）
   */
  weather: string | null;
  overwork: boolean;
  restDay: boolean;
  others: string[];
}

export function wakePack(
  report: WakeReport,
  events: ActionEvent[],
  atHome: boolean,
  state?: GameState,
): WakePack {
  // 旅の途中の眠りは野営（P-02。到着の朝は journey が空でも journeyArrived で判る）。
  // 迷宮内野営（G-03）も野営の眠り —— slept.camp で判る
  const camping =
    (state !== undefined && state.life.journey !== null) ||
    events.some((e) => e.type === "journeyArrived") ||
    events.some((e) => e.type === "slept" && e.camp === true);
  return {
    quality: qualityLabel(report.quality),
    inn: camping
      ? t.display.campName
      : atHome
        ? t.display.homeName
        : t.display.innNames[report.inn],
    dinner:
      !atHome && report.dinner ? t.display.dinnerNames.with : t.display.dinnerNames.withoutShort,
    skillLines: report.lines
      .filter((l) => l.kind === "skill")
      .map((l) => ({
        name: skills.skills.find((s) => s.id === l.id)?.name ?? l.id,
        from: l.from,
        to: l.to,
        delta: l.delta,
        ...(l.carried !== undefined ? { carried: l.carried } : {}),
      })),
    rankUps: report.rankUps.map((r) => ({
      name: skills.skills.find((s) => s.id === r.skill)?.name ?? r.skill,
      rank: t.display.skillRankNames[r.toRank] ?? String(r.toRank),
      fromRank: r.fromRank,
      toRank: r.toRank,
    })),
    statLines: report.lines
      .filter((l) => l.kind === "stat")
      .map((l) => ({ name: t.display.statNames[l.id] ?? l.id, delta: l.delta })),
    gifts: report.surprises,
    newSkill: events.some(
      (e) => e.type === "skillUnlocked" || e.type === "artLearned" || e.type === "artEvolved",
    ),
    winds: report.tailwinds.map((x) => ({ direction: x.direction, label: x.label })),
    weather:
      report.weather === undefined
        ? null
        : tpl(t.text.wake.weatherLine, {
            weather: report.weather.name,
            line: report.weather.line,
          }),
    overwork: report.overwork.active,
    restDay: report.restDay,
    others: eventLines(events, state),
  };
}

/* ======== F-02: 演出層（B通知の札・セッションのS予算） ======== */

/**
 * B通知の札の一条（F-02、docs/03 §6）。画面右上に滑り込み数秒で消える軽い知らせ。
 * 文は cli.json の定型文か event の解決済みテキストを使う（文体の一元管理）
 */
export interface FxTag {
  text: string;
  /** title=称号（金） / coin=報酬（金） / whisper=気配・世界の動き（銀青） / plain=平常 */
  tone: "title" | "coin" | "whisper" | "plain";
}

/**
 * step のイベント列 → Bランクの札（F-02）。
 * 記録の1行しか無かった出来事（通常称号・納品・報酬・発見・歳月・気配など）を
 * 右上の札として映す。モーダルにはしない ―― 下の画面の操作は通る。
 * S/A になる出来事（noticesOf で窓になるもの）はここには入れない
 */
export function tagsOf(events: ActionEvent[], state?: GameState): FxTag[] {
  const out: FxTag[] = [];
  for (const e of events) {
    switch (e.type) {
      case "titleGained": {
        const def = titles.titles.find((x) => x.id === e.id);
        const name = def?.name ?? e.id;
        if (e.suppressed) {
          // 今日の世界の刻印が尽きた称号（S予算超過）：控えめな囁きの札
          out.push({ text: tpl(t.text.titleSuppressed, { name }), tone: "whisper" });
        } else if (e.rank === "B") {
          out.push({
            text: def?.message ?? tpl(t.text.titleGainedFallback, { name }),
            tone: "title",
          });
        }
        break;
      }
      // 納品・報酬の小さな演出（F-02 §4：お金・作品の受け取りを目に見える形に）
      case "workRecorded":
        out.push({
          text: tpl(t.text.workDelivered, { name: workName(e.work, state) }),
          tone: "plain",
        });
        break;
      case "moneyPaid":
        out.push({ text: tpl(t.text.moneyPaid, { amount: e.amount }), tone: "coin" });
        break;
      case "donated":
        out.push({ text: tpl(t.text.societyDonated, { amount: e.amount }), tone: "coin" });
        break;
      // 気配（03 §6）：条件は明かさず、銀青の囁きとして滲ませる
      case "kehai":
        out.push({ text: t.text.kehai, tone: "whisper" });
        break;
      // 頂点ルートの中間段（Bランクの段）：pinnacles.json の通知文を札で届ける
      case "pinnacleStageReached": {
        if (e.rank !== "B") break;
        const notice = pinnacles.pinnacles
          .find((r) => r.id === e.route)
          ?.stages.find((s) => s.id === e.stage)?.notice;
        out.push({ text: notice ?? `――頂点への段《${e.stage}》に至りました。`, tone: "title" });
        break;
      }
      // 隠し要素（X-11）：発見名だけ札で知らせる（語りは記録と新聞が担う）
      case "discovery": {
        const def = cfg.discoveries?.find((d) => d.id === e.id);
        out.push({ text: tpl(t.text.discoveryFound, { name: def?.name ?? e.id }), tone: "plain" });
        break;
      }
      // 名所の初訪（X-29）：通知Bランク —— 踏んだ名だけ札で知らせる
      case "landmarkFound":
        out.push({
          text: tpl(t.text.life.landmarkFound, { name: mapPlaceName(state, e.place) }),
          tone: "plain",
        });
        break;
      // NPCの歳月（X-12）：街の人物の物語が動いた一行
      case "npcEvent":
        out.push({ text: tpl(t.text.npcEvent, { name: e.name, text: e.text }), tone: "plain" });
        break;
      // 技の合成（K-03）：通知Bランク —— 生まれた技の名だけ札で知らせる
      // （レシピは伏せたまま。進化はAの窓、ユニークはSの帯が担う）
      case "artSynthesized":
        out.push({
          text: tpl(t.text.artSynthesized, { name: allArtDefs[e.id]?.name ?? e.id }),
          tone: "plain",
        });
        break;
      // S予算超過のユニーク獲得（K-03）：帯は出ないが記録は残る —— 囁きの札
      case "uniqueGained":
        if (e.suppressed) {
          out.push({
            text: tpl(t.text.uniqueSuppressed, { name: allArtDefs[e.art]?.name ?? e.art }),
            tone: "whisper",
          });
        }
        break;
      // 勝負所の行事（X-10）：打診と敗北は札で届く（勝ちはAの窓）
      case "occasionOffered":
        out.push({
          text: tpl(t.text.occasionOffered, { name: occasionName(e.id) }),
          tone: "plain",
        });
        break;
      case "occasionAttempted":
        if (!e.won) {
          out.push({ text: tpl(t.text.occasionLost, { name: occasionName(e.id) }), tone: "plain" });
        }
        break;
      // 世界の危機の機微（W-01）：季節の変わり目・決着の場面の結果は
      // 銀青の囁きとして滲ませる（終幕はSの窓が担う）
      case "crisisStageChanged": {
        const line = crisisLogLine("stage", crisisRefName(e.stage, "stages"));
        if (line !== null) out.push({ text: line, tone: "whisper" });
        break;
      }
      case "crisisFinale": {
        const line = crisisLogLine(
          e.success ? "finale.win" : "finale.loss",
          crisisRefName(e.id, "finales"),
        );
        if (line !== null) out.push({ text: line, tone: "whisper" });
        break;
      }
      // 接点を果たした（W-02）：世界の備えに足された旨
      case "crisisTouchpoint":
        out.push({
          text: tpl(t.text.crisisTouchpointDone, {
            field: t.display.crisisFieldNames[e.field] ?? e.field,
          }),
          tone: "plain",
        });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * S通知は「1日に1回まで」（03 §6・D-13・F-02）。称号のS予算はcoreが
 * suppressedで握るが、称号以外のS（頂点の段・決着の成功）も同じ日に
 * 重なった場合は表示側で畳む ―― その日に既に S を出していれば（sShown=true）、
 * 後続の S は A の窓として届ける（刻印・報酬は失わない）。
 * 例外：終幕への接続（openEnding）は世界に一度の結末なので予算の外 ――
 * 数えも畳みもしない（W-04：率いた決着の帯のあとに、必ず終幕の帯が来る）
 */
export function applySessionCap(
  notices: Notice[],
  sShown: boolean,
): { notices: Notice[]; sShown: boolean } {
  let shown = sShown;
  const out = notices.map((n) => {
    if (n.rank !== "S" || n.openEnding === true) return n;
    if (shown) return { ...n, rank: "A" as const };
    shown = true;
    return n;
  });
  return { notices: out, sShown: shown };
}
