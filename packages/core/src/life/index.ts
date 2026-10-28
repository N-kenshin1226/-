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

/** 町と町の間の道（双方向） */
export interface JourneyDef {
  from: string;
  to: string;
  /** 道中に要する日数（野営の回数） */
  days: number;
}

/** life.json＋balance.life をまとめた実行時設定 */
export interface LifeConfig {
  /**
   * 町の表（id → 表示名）。G-01 の生成世界では type に町の型の id が入り、
   * 型ごとの散策表（stroll["town.<型>"]）の選択に使う
   */
  towns: Record<string, { name: string; type?: string }>;
  journeys: readonly JourneyDef[];
  /**
   * 散策の出来事の表（"town" / "region" / "road" が基本キー。
   * G-01 では "town.<町の型>"・"region.<地域の型>" の型別表もここに乗る）
   */
  stroll: Record<string, readonly LifeOutcome[]>;
  /** 採集の表（場所 id → 表） */
  gather: Record<string, GatherTable>;
  /**
   * 場所の帰属（G-01 生成世界。場所 id → 属する町 id と型 id）。
   * 散策の型別表の選択と町の結線に使う。省略時（固定マップ）は解決しない
   */
  places?: Record<string, { town?: string; type?: string }>;
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
  /** 表示文テンプレート（cli.json 由来。{town} は町の名に置き換わる） */
  texts?: { arrive?: string };
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
