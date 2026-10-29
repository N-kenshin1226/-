import { createRng } from "../rng/index.js";
import type { GameState } from "../state/types.js";

/**
 * 日々の営み（P-02「行動の種類を増やす」、docs/03 §2）。
 * 散策・採集・料理・賭け事・人との時間・市場・掲示板・祈り・旅の定義と、
 * それらが引く決定的な抽選・値段のヘルパー。
 * 数値の表は content/life.json＋balance.json の life 節をまとめた
 * LifeConfig として step() に注入される —— core は定義の形だけを知る。
 *
 * 抽選はすべて「世界シード×日×用途×回目」の独立した乱数列で行い、
 * state.rng は消費しない（同じ日の同じ行為には同じ結果が来る）。
 */

/** 品物（items.json）。kind は 採集物/素材/料理。food は食べられる品の食事の質 */
export interface ItemDef {
  id: string;
  name: string;
  kind: "gather" | "material" | "meal";
  price: number;
  food?: number;
  /**
   * 買うと地方の地図の霧が晴れる（G-02、docs/10 §7「噂・新聞・地図の購入で
   * 霧が晴れる」）。"map" は地方すべての町と地域の名を聞き覚えに書き込む
   */
  reveal?: "map";
}

/** 散策・道中の出来事1件：結末の文と小さな効果 */
export interface LifeOutcome {
  weight: number;
  text: string;
  money?: number;
  items?: Record<string, number>;
  npc?: string;
  bond?: number;
  atom?: string;
  gain?: { skill: string; amount: number };
  fatigue?: number;
  flag?: string;
  /** 祈りの刻印（G-01。祠などの地点の出来事。その日の眠りが少し深くなる） */
  pray?: true;
  /**
   * 噂話（G-02、docs/10 §7）：聞き覚えのある町・地域が1つ増える
   * （旅人・行商人の口から届く名。map.heard に書き込まれ、地図の霧が晴れる）
   */
  reveal?: true;
}

/** 採集の品1件 */
export interface GatherEntry {
  item: string;
  weight: number;
  /** 1回に取れる数の幅（min〜max） */
  n: readonly [number, number];
  seasons?: readonly number[];
  weather?: readonly string[];
}

/** 採集の表（場所ごと） */
export interface GatherTable {
  skill: string;
  difficulty: number;
  entries: readonly GatherEntry[];
}

/** 料理のレシピ */
export interface RecipeDef {
  id: string;
  name: string;
  inputs: Record<string, number>;
  out: string;
  skill: string;
  difficulty: number;
}

/** 掲示板の依頼（納品系の日々の頼み） */
export interface ErrandDef {
  id: string;
  name: string;
  text: string;
  town?: string;
  need: Record<string, number>;
  reward: {
    money?: number;
    bond?: { npc: string; amount: number };
    gain?: { skill: string; amount: number };
    items?: Record<string, number>;
  };
}

/** 旅の通い方（G-02、docs/10 §7）：徒歩・隊商への同行・騎乗・船（港町） */
export type JourneyWay = "foot" | "caravan" | "horse" | "ship";

/** 町と町の間の道（双方向） */
export interface JourneyDef {
  from: string;
  to: string;
  /** 道中に要する日数（野営の回数） */
  days: number;
  /**
   * 道の危険度（1〜10。G-02）。散策の道中遭遇（野営前に敵が出る
   * 街道）の濃さ —— 遠い町ほど危険な道が続く。省略時は安全な道
   */
  danger?: number;
  /**
   * 道の種別（"highway"=街道 / "mountain"=山道 / "sea"=海路）。
   * 危機の closeRoads は種別か道idで封じる（省略時は "highway" 扱い）
   */
  kind?: string;
  /** 道の上の関所（通過に料金が掛かる。G-02） */
  checkpoint?: { fee: number };
  /** 通行止めになる季節（季節のインデックス。省略時は通年通行可。G-02） */
  closedSeasons?: readonly number[];
  /** 街道で遭遇する敵（enemies.json の id＋重み。空なら遭遇は起きない。G-02） */
  enemies?: readonly { id: string; weight: number }[];
}

/** life.json＋balance.life をまとめた実行時設定 */
export interface LifeConfig {
  /**
   * 町の表（id → 表示名）。G-01 の生成世界では type に町の型の id が入り、
   * 型ごとの散策表（stroll["town.<型>"]）の選択に使う。
   * pos（G-02）は地方の地図での町の位置（% 座標。地図画面が引く）
   */
  towns: Record<string, { name: string; type?: string; pos?: readonly [number, number] }>;
  journeys: readonly JourneyDef[];
  /**
   * 散策の出来事の表（"town" / "region" / "road" が基本キー。
   * G-01 では "town.<町の型>"・"region.<地域の型>" の型別表もここに乗る）
   */
  stroll: Record<string, readonly LifeOutcome[]>;
  /** 採集の表（場所 id → 表） */
  gather: Record<string, GatherTable>;
  /**
   * 場所の帰属（場所 id → 属する町 id・型 id・表示名）。散策の型別表の
   * 選択と町の結線に使う（G-01）。G-02 では name を地域・場所の表示名
   * として地図・噂の文が引く。省略時（固定マップ）は解決しない。
   * landmark は名所（X-25、docs/10 §3「手作りの特別な場所」）——
   * 訪れた町に属しても地図の霧から自動では晴れず、噂や発見で聞き覚えた
   * ときだけ名が出る
   */
  places?: Record<string, { town?: string; type?: string; name?: string; landmark?: true }>;
  /**
   * 地域の中の小さな地点の出来事表（G-01。地点 id → 表）。
   * spot 行動がここから1件引く
   */
  spots?: Record<string, readonly LifeOutcome[]>;
  /**
   * 町ごとの評判（G-01、docs/10 §4）。省略時は評判を積まない。
   * errand/work/donate はその行動1回で増える評判、pricePer は評判1点あたりの
   * 市場価格への効き（買いは安く・売りは高くなる）
   */
  rep?: { max: number; errand: number; work: number; donate: number; pricePer: number };
  /**
   * 旅の道中（G-02、docs/10 §7）：通い方の料金・速さ、道中の遭遇と
   * 朝刊の噂の係数（balance.life.journey）。省略時は徒歩のみ・
   * 道中の遭遇と噂の霧晴れは起きない
   */
  journey?: {
    /** 道中の遭遇の基準率（道の危険度1点あたりの散策1回の遭遇率） */
    encounterPerDanger: number;
    /** 通い方：隊商への同行・騎乗・船（徒歩は無料で常に選べる） */
    ways: {
      /** 隊商への同行：安全だが料金が掛かる（遭遇率に encounterFactor を乗せる） */
      caravan: { feePerDay: number; encounterFactor: number };
      /** 騎乗：日数が daysFactor 倍に縮む。料金は縮んだ日数で計る */
      horse: { feePerDay: number; daysFactor: number; encounterFactor: number };
      /** 船（海路）：日数が daysFactor 倍に縮む定額料金。海路にだけ出せる */
      ship: { fee: number; daysFactor: number };
    };
    /** 朝刊の噂で未知の町・地域が聞き覚えに加わる1日あたりの確率（町にいる眠りにだけ） */
    newsRevealChance: number;
  };
  recipes: readonly RecipeDef[];
  market: {
    stock: readonly { id: string; towns?: readonly string[] }[];
    sellFactor: number;
    buyFactor: number;
    townFactor: Record<string, Record<string, number>>;
  };
  gamble: { stakes: readonly number[]; winFactor: number };
  social: {
    talk: { bond: number };
    drink: { cost: number; bond: number };
    gift: { bondPerPrice: number; cap: number };
  };
  errands: readonly ErrandDef[];
  // ---- balance.life 係数 ----
  /** 食べた食事の眠りへの効き（眠りの質 += 食事の質 × この値） */
  mealSleepFactor: number;
  /** 祈った日の眠りの質への加算 */
  praySleepBonus: number;
  /** 野営（旅の道中の眠り）の質 */
  campQuality: number;
  /** 採集1回に引く品の数 */
  gatherDraws: number;
  /** 掲示板の依頼を1日にこなせる数 */
  errandPerDay: number;
  /** 市場の日替わりの揺らぎの半幅 */
  marketJitter: number;
  /** 仲の値がこの値を超えると挨拶が親しいものに変わる */
  bondRespectMin: number;
  /** 仲の値の上限 */
  bondMax: number;
  /** 祈りの経験の挑戦差 */
  prayDifficulty: number;
  /** 賭け事の基礎勝率 */
  gambleWinChance: number;
  /** 賭け事の経験の挑戦差 */
  gambleDifficulty: number;
  /** まかせ料理の出来の基準 */
  cookQualityBase: number;
  /**
   * 表示文テンプレート（cli.json 由来。{town} は町の名、{name} は場所の名に置き換わる）。
   * arrive は旅の到着、newsHeard は朝刊の噂で名が知れた行
   */
  texts?: { arrive?: string; newsHeard?: string };
}

/* ── 状態の読み取り ── */

/** 今いる町（life.town。旅行中も出発町のまま —— 到着で変わる） */
export function townOf(state: GameState): string {
  return state.life.town;
}

/** 町の表示名（未定義は id のまま返す） */
export function townName(town: string, cfg: LifeConfig): string {
  return cfg.towns[town]?.name ?? town;
}

/** 旅の途中か */
export function journeying(state: GameState): boolean {
  return state.life.journey !== null;
}

/** from↔to を結ぶ道（双方向） */
export function journeyBetween(cfg: LifeConfig, from: string, to: string): JourneyDef | undefined {
  return cfg.journeys.find(
    (j) => (j.from === from && j.to === to) || (j.from === to && j.to === from),
  );
}

/* ── 道と旅（G-02、docs/10 §7） ── */

/**
 * 道の安定した識別子（from/to を昇順に並べたもの。双方向の同一視）。
 * 危機の closeRoads ・道中の遭遇の乱数列・地図画面のキーに使う
 */
export function journeyIdOf(road: Pick<JourneyDef, "from" | "to">): string {
  return [road.from, road.to].sort((a, b) => a.localeCompare(b)).join(".");
}

/** 道の種別（省略時は街道 "highway" 扱い） */
export function roadKindOf(road: JourneyDef): string {
  return road.kind ?? "highway";
}

/** 道がこの季節に通行止めか（季節のインデックスで見る。G-02） */
export function roadSeasonClosed(road: JourneyDef, season: number): boolean {
  return road.closedSeasons !== undefined && road.closedSeasons.includes(season);
}

/** 通い方がその道で使えるか（海路は船だけ、陸路に船は出ない。G-02） */
export function journeyWayOk(road: JourneyDef, way: JourneyWay): boolean {
  if (way === "ship") return roadKindOf(road) === "sea";
  return true;
}

/** 道で使える通い方の一覧（徒歩は常に。海路は船が加わる。G-02） */
export function journeyWaysOf(road: JourneyDef): readonly JourneyWay[] {
  return roadKindOf(road) === "sea" ? ["foot", "ship"] : ["foot", "caravan", "horse"];
}

/** 通い方ごとの実効日数（騎乗・船は速い。G-02） */
export function journeyDaysFor(road: JourneyDef, way: JourneyWay, cfg: LifeConfig): number {
  const ways = cfg.journey?.ways;
  if (way === "horse" && ways !== undefined) {
    return Math.max(1, Math.round(road.days * ways.horse.daysFactor));
  }
  if (way === "ship" && ways !== undefined) {
    return Math.max(1, Math.round(road.days * ways.ship.daysFactor));
  }
  return road.days;
}

/**
 * 旅立ちに掛かる料金（通い方の運賃＋関所の通行料。G-02）。
 * 隊商・馬は日数あたり（馬は縮んだ日数ぶん）、船は定額、関所は通い方によらず一律
 */
export function journeyCost(road: JourneyDef, way: JourneyWay, cfg: LifeConfig): number {
  const ways = cfg.journey?.ways;
  const fare =
    way === "caravan"
      ? Math.round(road.days * (ways?.caravan.feePerDay ?? 0))
      : way === "horse"
        ? Math.round(journeyDaysFor(road, way, cfg) * (ways?.horse.feePerDay ?? 0))
        : way === "ship"
          ? Math.round(ways?.ship.fee ?? 0)
          : 0;
  return fare + (road.checkpoint?.fee ?? 0);
}

/** 道中の遭遇がその日に既に起きたかのカウンタキー（G-02。1日1回まで） */
export function roadEncounterDayKey(): string {
  return "road.enc.day";
}

/**
 * 道中の遭遇の抽選（G-02、docs/10 §7「移動中の出来事・遭遇」）。
 * 旅の途中の散策1回ごとに、道の危険度 × encounterPerDanger（通い方の係数を
 * 乗せる）で遭遇を決定的に引く。1日に遭遇は1回まで（encounteredToday で抑える）。
 * 返すのは敵の id（undefined なら遭遇なし —— 道の敵表が空なら遭遇は起きない）
 */
export function roadEncounter(
  seed: string,
  day: number,
  seq: number,
  road: JourneyDef | undefined,
  way: JourneyWay,
  encounteredToday: boolean,
  cfg: LifeConfig,
): string | undefined {
  const j = cfg.journey;
  if (j === undefined || road === undefined || encounteredToday) return undefined;
  const pool = road.enemies;
  if (pool === undefined || pool.length === 0) return undefined;
  const factor =
    way === "caravan"
      ? j.ways.caravan.encounterFactor
      : way === "horse"
        ? j.ways.horse.encounterFactor
        : 1;
  const chance = Math.min(1, (road.danger ?? 0) * j.encounterPerDanger * factor);
  if (chance <= 0) return undefined;
  const rng = createRng(`${seed}:roadenc:${journeyIdOf(road)}:${day}:${seq}`);
  if (rng.next() >= chance) return undefined;
  return rng.weighted(pool.map((e) => ({ item: e.id, weight: e.weight })));
}

/* ── 地方の地図の霧（G-02、docs/10 §7「行ったことのない場所は霧がかかる」） ──
 * state.life.map に持つ刻印：
 *   visited … 実際に訪れた町・地域（地図に濃い印が出る）
 *   heard   … 噂・新聞・地図で聞き覚えた町・地域（名が知れる＝霧が晴れる）
 * これらは「知っている場所」の刻印で、隣町の名・訪れた町の地域の名は
 * 刻まなくても知れる（mapKnownSet で導出する —— 常識として伝わる噂）
 */

/** 場所を訪れた刻印（visited と heard の両方に足す） */
export function markVisited(
  map: GameState["life"]["map"],
  place: string,
): GameState["life"]["map"] {
  const heard = map.heard.includes(place) ? map.heard : [...map.heard, place];
  const visited = map.visited.includes(place) ? map.visited : [...map.visited, place];
  return { visited, heard };
}

/** 場所の名を聞き覚えた刻印（heard にだけ足す） */
export function markHeard(map: GameState["life"]["map"], place: string): GameState["life"]["map"] {
  return map.heard.includes(place) ? map : { ...map, heard: [...map.heard, place] };
}

/**
 * 地方のすべての場所を聞き覚えた刻印（地図の購入。G-02）。
 * 町と地域の名がすべて書き込まれる —— 訪れた印は立たない（知ることと
 * 行くことは別。霧が晴れても印の濃さは変わらない）。
 * 名所だけは書き込まれない：売り物の地図に載る場所ではない
 */
export function markAllHeard(
  map: GameState["life"]["map"],
  cfg: LifeConfig,
): GameState["life"]["map"] {
  const heard = new Set(map.heard);
  for (const id of Object.keys(cfg.towns)) heard.add(id);
  for (const [id, p] of Object.entries(cfg.places ?? {})) {
    // 名所は売り物の地図にも載らない —— 噂・発見でだけ名が知れる（X-25/X-26）
    if (p.landmark === true) continue;
    heard.add(id);
  }
  return { ...map, heard: [...heard] };
}

/**
 * 知っている場所の集合（G-02）：
 *   ・visited/heard に刻んだ場所
 *   ・訪れた町から道で繋がる町（隣町の名は行き先候補として自然に知れる）
 *   ・訪れた町に属する地域（その町の外の名は知っている）
 */
export function mapKnownSet(state: GameState, cfg: LifeConfig): Set<string> {
  const known = new Set<string>([...state.life.map.visited, ...state.life.map.heard]);
  for (const town of state.life.map.visited) {
    if (cfg.towns[town] === undefined) continue;
    for (const j of cfg.journeys) {
      if (j.from === town) known.add(j.to);
      if (j.to === town) known.add(j.from);
    }
    for (const [id, p] of Object.entries(cfg.places ?? {})) {
      // 名所は訪れた町に属しても噂として知れる —— 聞き覚えるまで霧の中
      if (p.landmark === true) continue;
      if (p.town === town) known.add(id);
    }
  }
  return known;
}

/** 場所の名が知れているか（霧の晴れた場所か） */
export function mapKnown(state: GameState, cfg: LifeConfig, place: string): boolean {
  return mapKnownSet(state, cfg).has(place);
}

/** 実際に訪れたことのある場所か */
export function mapVisited(state: GameState, place: string): boolean {
  return state.life.map.visited.includes(place);
}

/** 場所の表示名（町は町名、場所は places の name。未登録は id そのまま） */
export function placeName(place: string, cfg: LifeConfig): string {
  return cfg.places?.[place]?.name ?? cfg.towns[place]?.name ?? place;
}

/**
 * 噂・朝刊で聞き覚える次の場所（G-02）。知っている町から道で繋がる
 * 未知の町を優先に（噂は外へ広がる）、なければ未知の町、それも尽きたら
 * 未知の地域を、世界シード×日×通し番号で決定的に1つ選ぶ
 */
export function revealPick(
  seed: string,
  day: number,
  seq: number,
  cfg: LifeConfig,
  known: ReadonlySet<string>,
): string | undefined {
  const townCandidates: string[] = [];
  for (const j of cfg.journeys) {
    if (known.has(j.from) && !known.has(j.to)) townCandidates.push(j.to);
    if (known.has(j.to) && !known.has(j.from)) townCandidates.push(j.from);
  }
  const dedup = [...new Set(townCandidates)].sort();
  if (dedup.length > 0) {
    return createRng(`${seed}:mapreveal:${day}:${seq}`).pick(dedup);
  }
  // 町がすべて聞き覚えのあとは未知の地域を知る
  const areaCandidates = Object.keys(cfg.places ?? {})
    .filter((id) => !known.has(id))
    .sort();
  if (areaCandidates.length === 0) return undefined;
  return createRng(`${seed}:mapreveal:${day}:${seq}:area`).pick(areaCandidates);
}

/** 仲の値（0〜bondMax） */
export function bondOf(state: GameState, npc: string, cfg: LifeConfig): number {
  return Math.max(0, Math.min(cfg.bondMax, state.life.bonds[npc] ?? 0));
}

/** 町ごとの評判（G-01。0〜rep.max。rep 係数が無い世界では常に 0） */
export function repOf(state: GameState, town: string, cfg: LifeConfig): number {
  const rep = cfg.rep;
  if (rep === undefined) return 0;
  return Math.max(0, Math.min(rep.max, state.life.rep[town] ?? 0));
}

/**
 * 町の評判を積んだ新しい life（G-01）。評判は行った町の顔売り ——
 * 掲示板・仕事・寄付でその町の分だけ積み上がる（上限 rep.max）
 */
export function withRep(
  state: GameState,
  town: string,
  amount: number,
  cfg: LifeConfig,
): GameState["life"] {
  const rep = { ...state.life.rep };
  rep[town] = repOf(state, town, cfg) + amount;
  return { ...state.life, rep };
}

/** 仲が深まって挨拶が変わる水準に達したか */
export function bondWarm(state: GameState, npc: string, cfg: LifeConfig): boolean {
  return bondOf(state, npc, cfg) >= cfg.bondRespectMin;
}

/** 持ち物の個数 */
export function itemCount(state: GameState, id: string): number {
  return state.life.items[id] ?? 0;
}

/** 持ち物に品を足した新しい life（n は負で減らす。0 以下の欄は消す） */
export function withItem(state: GameState, id: string, n: number): GameState["life"] {
  const items = { ...state.life.items };
  const left = (items[id] ?? 0) + n;
  if (left <= 0) delete items[id];
  else items[id] = left;
  return { ...state.life, items };
}

/** 今日食べた食事の質（食べていない日は 0） */
export function mealToday(state: GameState): number {
  return state.life.mealDay === state.time.day ? state.life.mealQuality : 0;
}

/** 今日祈ったか */
export function prayedToday(state: GameState): boolean {
  return state.life.prayedDay === state.time.day;
}

/* ── 抽選（すべて seed×日×用途×回目の独立した乱数列） ── */

/**
 * 散策の出来事を1件引く。table は "town"/"region"/"road"（＋G-01 の型別表）。
 * seq は同日・同表で何回目の抽選か（カウンタから渡す）
 */
export function drawStroll(
  seed: string,
  day: number,
  table: string,
  seq: number,
  cfg: LifeConfig,
): LifeOutcome | undefined {
  const outcomes = cfg.stroll[table];
  if (outcomes === undefined || outcomes.length === 0) return undefined;
  const rng = createRng(`${seed}:stroll:${table}:${day}:${seq}`);
  return rng.weighted(outcomes.map((o) => ({ item: o, weight: o.weight })));
}

/**
 * 散策の表キーを選ぶ（G-01）。基本は scope（"town"/"region"/"road"）。
 * 生成世界では場所・町の型に応じて "town.<町の型>"・"region.<地域の型>"
 * の型別表があればそちらを使う。place は散策している場所の id（地域なら型解決に使う）
 */
export function strollTableOf(
  cfg: LifeConfig,
  scope: string,
  place: string | undefined,
  town: string,
): string {
  let typeId: string | undefined;
  if (scope === "town") {
    typeId = cfg.towns[town]?.type ?? (place !== undefined ? cfg.places?.[place]?.type : undefined);
  } else if (scope === "region" && place !== undefined) {
    typeId = cfg.places?.[place]?.type;
  }
  if (typeId !== undefined) {
    const key = `${scope}.${typeId}`;
    if (cfg.stroll[key] !== undefined && cfg.stroll[key]!.length > 0) return key;
  }
  return scope;
}

/**
 * 地点（spot）の出来事を1件引く（G-01）。表は spots[地点id]。
 * 引く乱数列は散策とは別系統（地点×日×回目）
 */
export function drawSpot(
  seed: string,
  day: number,
  spot: string,
  seq: number,
  cfg: LifeConfig,
): LifeOutcome | undefined {
  const outcomes = cfg.spots?.[spot];
  if (outcomes === undefined || outcomes.length === 0) return undefined;
  const rng = createRng(`${seed}:spot:${spot}:${day}:${seq}`);
  return rng.weighted(outcomes.map((o) => ({ item: o, weight: o.weight })));
}

/**
 * 採集の抽選：その場所の採集表から draws 回引く。
 * 季節・天候で出ない品は重み0として外れる（全部外れたら何も取れない）。
 * 返すのは {item, n} の並び（同じ品が重複して出ることもある）
 */
export function drawGather(
  seed: string,
  day: number,
  place: string,
  seq: number,
  season: number,
  weather: string | undefined,
  cfg: LifeConfig,
): { item: string; n: number }[] {
  const table = cfg.gather[place];
  if (table === undefined) return [];
  const pool = table.entries.filter(
    (e) =>
      (e.seasons === undefined || e.seasons.includes(season)) &&
      (e.weather === undefined || weather === undefined || e.weather.includes(weather)),
  );
  if (pool.length === 0) return [];
  const rng = createRng(`${seed}:gather:${place}:${day}:${seq}`);
  const got: { item: string; n: number }[] = [];
  for (let i = 0; i < cfg.gatherDraws; i++) {
    const e = rng.weighted(pool.map((x) => ({ item: x, weight: x.weight })));
    got.push({ item: e.item, n: rng.int(e.n[0], e.n[1]) });
  }
  return got;
}

/**
 * 市場の値段（G、整数）。基準値 × 町係数 × 売り買い係数 × 日替わりの揺らぎ。
 * side: "buy" は店で買う値段、"sell" は店に売る値段。
 * rep（G-01、町の評判）は顔が売れている分だけ買いを安く・売りを高くする
 */
export function itemPrice(
  seed: string,
  day: number,
  id: string,
  town: string,
  side: "buy" | "sell",
  cfg: LifeConfig,
  item: ItemDef,
  rep = 0,
): number {
  const townFactor = cfg.market.townFactor[town]?.[id] ?? cfg.market.townFactor[town]?.["*"] ?? 1;
  const pricePer = cfg.rep?.pricePer ?? 0;
  const repFactor =
    rep > 0 && pricePer > 0
      ? side === "buy"
        ? Math.max(0.5, 1 - rep * pricePer)
        : Math.min(1.5, 1 + rep * pricePer)
      : 1;
  const base =
    item.price *
    townFactor *
    repFactor *
    (side === "buy" ? cfg.market.buyFactor : cfg.market.sellFactor);
  const jitter =
    1 + (createRng(`${seed}:life-market:${day}:${id}`).next() * 2 - 1) * cfg.marketJitter;
  return Math.max(1, Math.round(base * jitter));
}

/** その町の市場に並ぶ品の id */
export function marketStock(town: string, cfg: LifeConfig): string[] {
  return cfg.market.stock
    .filter((s) => s.towns === undefined || s.towns.includes(town))
    .map((s) => s.id);
}

/** その町の掲示板に出る依頼（town 限定の依頼はその町にだけ出る） */
export function errandsFor(town: string, cfg: LifeConfig): ErrandDef[] {
  return cfg.errands.filter((e) => e.town === undefined || e.town === town);
}

/** 依頼を最後にこなした日のカウンタキー（同じ日に同じ依頼は1回だけ） */
export function errandDoneDayKey(id: string): string {
  return `errand.day.${id}`;
}

/** 今日こなした掲示板の依頼の数（日またぎで自然にリセットされる形） */
export function errandsToday(state: GameState): number {
  return state.counters["errand.daily.day"] === state.time.day
    ? (state.counters["errand.daily.n"] ?? 0)
    : 0;
}

/** その依頼が今日こなせるか（品が揃い、日限・上限に達していない） */
export function canErrand(state: GameState, def: ErrandDef, cfg: LifeConfig): boolean {
  if ((state.counters[errandDoneDayKey(def.id)] ?? -1) === state.time.day) return false;
  if (errandsToday(state) >= cfg.errandPerDay) return false;
  return Object.entries(def.need).every(([id, n]) => itemCount(state, id) >= n);
}

/** 賭け事の勝率（基礎勝率＋技能リンク分。0〜1） */
export function gambleWinChance(state: GameState, skillBonus: number, cfg: LifeConfig): number {
  return Math.max(0, Math.min(1, cfg.gambleWinChance + skillBonus));
}

/**
 * 賭け事の勝敗を引く。seq は同日何回目の勝負か
 */
export function drawGamble(seed: string, day: number, seq: number, chance: number): boolean {
  return createRng(`${seed}:gamble:${day}:${seq}`).next() < chance;
}

/**
 * まかせ料理（ミニゲーム無し）の出来。cookQualityBase を中央に
 * 器用・技能補正なしの素の出来 ± 揺らぎで決まる
 */
export function cookQuality(seed: string, day: number, seq: number, cfg: LifeConfig): number {
  const v =
    createRng(`${seed}:cook:${day}:${seq}`).next() +
    createRng(`${seed}:cook2:${day}:${seq}`).next() -
    1;
  return Math.max(0, Math.min(100, Math.round(cfg.cookQualityBase + v * 25)));
}
