/**
 * Web 版のゲームセッション層（docs/04 §2：UIはcoreを呼ぶだけ）。
 * ルールはすべて core、数値は content、ここでは画面遷移と表示用の整形だけを行う
 */
import {
  abyssRunSeed,
  activeBookEffects,
  activeEffects,
  appraisalGame,
  biographyMaterial,
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
  marketFactor,
  weatherOf,
  weaponDefOf,
  withWorldMods,
  worldFactor,
  worldMods,
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
  type EnemyDef,
  type EnemyTrait,
  type GameState,
  type HeirKind,
  type IncidentOffer,
  type Legacy,
  type LifeCause,
  type MiniGameCtx,
  type NewGameConfig,
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
  mentors,
  narration,
  npcLifecycle,
  occasions,
  orders,
  origins,
  pinnacles,
  places,
  rivals,
  skills,
  society,
  tailwinds,
  titles,
  voices,
  vows,
  weapons,
  weather,
  type EnemyJson,
  type Order,
  type Origin,
  type PlaceJson,
  type VoiceNpc,
  type WeaponJson,
} from "@trace/content";
import type { SoundId } from "./fx/sound.js";

export const t = cliText;

/** 武器の定義表（K-01、weapons.json → id 引き。武器屋・戦闘・新規開始で共有） */
export const weaponList = weapons.weapons;
export const weaponDefs: Record<string, WeaponJson> = Object.fromEntries(
  weapons.weapons.map((w) => [w.id, w]),
);

/** 武技の定義表（K-02、arts.json → id 引き。構成画面・戦闘・ステータスで共有） */
export { artDefs };

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
    arts: { defs: artDefs, ...balance.arts },
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
  arts: { defs: artDefs, ...balance.arts },
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
   * 世界の危機（W-01、docs/08）。ブラウザ経路は公開サンプルの型を使う
   * （hidden/crises は node 側の @trace/content/hidden から読む設計）
   */
  crisis: {
    types: crisisTypes(),
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
  },
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

export function placeOf(id: string | undefined): PlaceJson | undefined {
  return placeList.find((p) => p.id === id);
}
export function placeName(id: string | undefined): string {
  return placeOf(id)?.name ?? id ?? "";
}

/** 場所に居る師匠（npcs と mentors.json の人物紐付けで見る） */
export function mentorsAt(place: PlaceJson) {
  return mentorList.filter((m) => place.npcs.includes(m.npc));
}

/**
 * 場所に届く注文の技能か（work 行動の kinds。default の受け皿は
 * 「どこにも割り当たっていない注文」だけを受ける）
 */
export function placeTakesKind(place: PlaceJson, kind: string): boolean {
  const work = place.actions.filter((a) => a.type === "work");
  if (work.some((a) => a.kinds?.includes(kind))) return true;
  if (!work.some((a) => a.default === true)) return false;
  return !placeList.some(
    (p) => p.id !== place.id && p.actions.some((a) => a.type === "work" && a.kinds?.includes(kind)),
  );
}

/** 街の外への移動が消費する行動数（balance.travel。街の中は 0） */
export function travelOutCost(): number {
  return cfg.travel?.outsideCost ?? 1;
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

/** 新規開始・転生で共通の newGame 初期値（出自は呼び出し側で選ぶ） */
const gameInit = (
  origin: Origin,
  legacy?: Legacy,
  fate?: FateChoice,
  flags?: readonly string[],
): NewGameConfig => ({
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
  arts: { defs: artDefs, ...balance.arts },
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
        const name = artDefs[e.id]?.name ?? e.id;
        return [tpl(t.text.artLearned, { name })];
      }
      case "buildChanged":
        return [t.text.buildSaved];
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
      // 勝敗は機械的な一行として刻む（数値・名の解決は core の刻印から）
      case "occasionOffered": {
        const def = cfg.occasions !== undefined ? occasionDef(cfg.occasions, e.id) : undefined;
        const name = def?.name ?? e.id;
        const speaker =
          cfg.occasions !== undefined && def !== undefined && state !== undefined
            ? occasionSpeaker(state, cfg.occasions, def)
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
  lines.push(
    tpl(w.qualityLine, {
      quality: qualityLabel(report.quality),
      inn: atHome ? t.display.homeName : t.display.innNames[report.inn],
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
    lines.push(tpl(w.artLevelUp, { name: artDefs[a.id]?.name ?? a.id, to: a.to }));
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
        ...(hint !== null ? { hints: [hint] } : {}),
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
  return startCombat(def, cfg.combat, player ?? state.player, fx);
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
    return (
      voices.npcs.find((n) => n.id === entry.ref)?.name ??
      canon.figures.find((f) => f.id === entry.ref)?.name ??
      entry.ref
    );
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
 * 終幕の素材（W-04、docs/08 §7）：決着/滅びの紙の層の語り＋関与の段階の痕跡。
 * 表示名（NPC・ライバル・役割・段階・作品）はここで解決する。
 * 進行中・危機の無い世界では null（終幕の画面は出さない）
 */
export function endingOf(state: GameState): CrisisEnding | null {
  return crisisEnding(state, cfg.crisis, narration.crisis, {
    stage: (s) => t.display.crisisStageNames[String(s)] ?? String(s),
    role: (r) => t.display.crisisRoleNames[r] ?? r,
    npc: (id) =>
      voices.npcs.find((n) => n.id === id)?.name ??
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
function deedLabel(kind: string, target?: string): string {
  switch (kind) {
    case "train":
      return `${skills.skills.find((s) => s.id === target)?.name ?? target ?? ""}の鍛錬`;
    case "work":
      return "仕事";
    case "combat":
      return `${enemies.enemies.find((e) => e.id === target)?.name ?? "魔物"}との戦い`;
    case "abyss":
      return "深層への潜行";
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
      return `${placeName(target)}への移動`;
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
    ...(hint !== null ? { hints: [hint] } : {}),
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
  rumors.splice(3);

  // 昨日の記録：行動種別ごとにまとめる
  const grouped = new Map<string, number>();
  for (const a of state.actionLog.filter((x) => x.day === day)) {
    const key = deedLabel(a.kind, a.target);
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
  const rest = voices.npcs.filter((n) => npcGoneReason(state, n.id) === null);
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

  // 号外級：この朝に届く号外＝世界初の記録か強個体討伐が昨夜までに刻まれた日
  const extra = events.some(
    (e) =>
      (e.type === "titleGained" && !e.suppressed && e.rank === "S") ||
      e.type === "uniqueDefeated" ||
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

/** メイン画面の会話窓：その日の街の住人の一言（日替わり・決定的） */
export function townVoice(state: GameState): { name: string; role: string; text: string } {
  const rng = createRng(`${state.seed}:voice:${state.time.day}`);
  // 危機の段階・歳月の退場で街に居なくなった住人は窓に出ない（W-04/X-12：人の不在で伝える）
  const pool = voices.npcs.filter((n) => npcGoneReason(state, n.id) === null);
  const npc = rng.pick(pool.length > 0 ? pool : [...voices.npcs]);
  return npcVoiceLine(state, rng, npc);
}

/**
 * 場所の会話窓（P-01）：その場所に居る人の一言（日替わり・決定的）。
 * 居る人が皆いなくなっていたら null —— 場所の描写だけが残る
 */
export function placeVoice(
  state: GameState,
  place: PlaceJson,
): { name: string; role: string; text: string } | null {
  const pool = voices.npcs.filter(
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
  npc: VoiceNpc,
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
  const recent = npcLifeRecent(state, cfg.npcLife, balance.town.npcRumorDays);
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
  const recent = npcLifeRecent(state, cfg.npcLife, balance.town.npcRumorDays);
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
  return {
    quality: qualityLabel(report.quality),
    inn: atHome ? t.display.homeName : t.display.innNames[report.inn],
    dinner: !atHome && report.dinner ? t.display.dinnerNames.with : t.display.dinnerNames.without,
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
      // NPCの歳月（X-12）：街の人物の物語が動いた一行
      case "npcEvent":
        out.push({ text: tpl(t.text.npcEvent, { name: e.name, text: e.text }), tone: "plain" });
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
