/**
 * 世界の出所に応じた解決層（G-01、docs/10_world_generation.md）。
 *
 * state.world = "legacy"（旧セーブ・e2e の固定マップ）なら places.json /
 * life.json / voices.json / mentors.json をそのまま返し、"gen"（生成地方）
 * なら世界シードから引き直した生成物を返す。生成は決定論的なので state
 * には刻印だけが載り、ここで seed から毎回同じ地方を引き直す（メモ化）。
 *
 * 画面はこの層だけを見る —— どちらの地図で遊んでいるかを意識しない
 */
import { worldFor, type GameState, type GeneratedWorld, type WorldPlaceAction } from "@trace/core";
import {
  balance,
  enemies,
  life as lifeContent,
  mentors as mentorsContent,
  orders,
  places as placesContent,
  skills as skillsContent,
  voices,
  world as worldFile,
  type EnemyJson,
  type Order,
  type PlaceJson,
} from "@trace/content";

/** 画面が場所に求める形（places.json と生成される場所の共通部分） */
export interface PlaceLike {
  id: string;
  name: string;
  kind: "town" | "region";
  /** 属する町（省略時は基点の町 —— 固定マップの既定値 "ardi" と同じ扱い） */
  town?: string;
  scene: string;
  pos?: readonly [number, number];
  desc: string;
  npcs: readonly string[];
  actions: readonly WorldPlaceAction[];
}

/** 生成世界の場所は PlaceLike のまま画面に渡せる */
const asPlaceLike = (p: PlaceJson | GeneratedWorld["places"][number]): PlaceLike => p;

/* ── 生成世界の引き直し（seed ごとに1度だけ生成して覚える） ── */

const worldCache = new Map<string, GeneratedWorld | null>();

/** 敵の挑戦差（enemies.json id → challenge。危険度の蓋で敵を絞るのに使う） */
const enemyChallenge = Object.fromEntries(enemies.enemies.map((e) => [e.id, e.challenge]));

/**
 * この state の世界。生成世界なら seed から引き直した地方を返し、
 * 固定マップ（legacy・旧セーブ）なら null（呼び出し側は固定コンテンツを使う）
 */
export function genWorld(state: GameState): GeneratedWorld | null {
  const key = `${state.seed}:${state.world?.recipe ?? 0}:${state.world?.kind ?? "legacy"}`;
  const hit = worldCache.get(key);
  if (hit !== undefined) return hit;
  const w = worldFor(
    state,
    worldFile,
    {
      ...balance.world,
      dungeons: balance.dungeons,
      // 師匠の説明文に出る技能名（X-16。core は skills.json を知らない）
      skillNames: Object.fromEntries(skillsContent.skills.map((s) => [s.id, s.name])),
    },
    enemyChallenge,
  );
  worldCache.set(key, w);
  return w;
}

/** この世界が生成地方で遊ばれているか */
export function isGenWorld(state: GameState): boolean {
  return genWorld(state) !== null;
}

/* ── 場所 ── */

/** この state の世界の場所一覧（生成地方なら生成物、固定マップなら places.json） */
export function placesOf(state: GameState): readonly PlaceLike[] {
  const w = genWorld(state);
  return w !== null ? w.places.map(asPlaceLike) : placesContent.places.map(asPlaceLike);
}

export function placeOfState(state: GameState, id: string | undefined): PlaceLike | undefined {
  if (id === undefined) return undefined;
  return placesOf(state).find((p) => p.id === id);
}

export function placeNameOf(state: GameState, id: string | undefined): string {
  return placeOfState(state, id)?.name ?? id ?? "";
}

/** 町の見取り図に出る場所（kind="town"。town 欄の無い場所は基点の町に属する） */
export function townPlacesOf(state: GameState, town: string): PlaceLike[] {
  return placesOf(state).filter((p) => p.kind === "town" && (p.town ?? "ardi") === town);
}

/* ── 町・人の名 ── */

/** この世界の町一覧（生成地方は生成の町、固定マップは life.json towns） */
export function worldTowns(state: GameState): { id: string; name: string }[] {
  const w = genWorld(state);
  if (w !== null) return w.towns.map((t) => ({ id: t.id, name: t.name }));
  return Object.entries(lifeContent.towns).map(([id, t]) => ({ id, name: t.name }));
}

/** 町の型の名（生成地方は生成の型名。固定マップはアルディ＝宿場街のみ分かる） */
export function townTypeNameOf(state: GameState, id: string): string {
  const w = genWorld(state);
  if (w !== null) {
    const t = w.towns.find((x) => x.id === id);
    if (t !== undefined) return t.typeName;
  }
  return id === "ardi" ? "宿場街" : "";
}

/** 「宿場街アルディ」のような型＋名の呼称（導入の文などに使う） */
export function townTitleOf(state: GameState, id: string): string {
  const name = townNameOf(state, id);
  const type = townTypeNameOf(state, id);
  return type === "" ? name : `${type}${name}`;
}

/** 町の表示名（生成地方の町 → 生成名、固定マップ → life.json towns） */
export function townNameOf(state: GameState, id: string): string {
  const w = genWorld(state);
  if (w !== null) {
    const t = w.towns.find((x) => x.id === id);
    if (t !== undefined) return t.name;
  }
  return lifeContent.towns[id]?.name ?? id;
}

/** 人物の表示名（生成地方の住人 → 生成名、固定マップ → voices.json） */
export function npcNameOf(state: GameState, id: string): string {
  const w = genWorld(state);
  if (w !== null) {
    const n = w.npcs.find((x) => x.id === id);
    if (n !== undefined) return n.name;
    const m = w.mentors.find((x) => x.npc === id || x.id === id);
    if (m !== undefined) return m.name;
  }
  return voices.npcs.find((n) => n.id === id)?.name ?? id;
}

/**
 * その人物がこの世界に実在するか（X-19：危機の離散・死亡の記録対象。
 * 生成地方なら生成の住人・師匠の名簿だけ —— canon の人物は居ないので
 * 記録・語りに出さない。固定マップは canon の人物表どおり＝常に居る）
 */
export function npcExistsIn(state: GameState, id: string): boolean {
  const w = genWorld(state);
  if (w !== null) {
    return w.npcs.some((n) => n.id === id) || w.mentors.some((m) => m.npc === id || m.id === id);
  }
  return true;
}

/** 会話・出来事に出せる人の名簿（生成地方なら生成の住人、固定は voices.json） */
export function npcListOf(state: GameState): { id: string; name: string; role: string }[] {
  const w = genWorld(state);
  if (w !== null) {
    return w.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role }));
  }
  return voices.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role }));
}

/** 会話窓の一言を持つ住人（voices.json または生成の住人。greet/respect の行を持つ） */
export interface VoiceLike {
  id: string;
  name: string;
  role: string;
  lines: {
    greet: readonly string[];
    respect: readonly string[];
    byStanding?: Record<string, { greet?: readonly string[]; respect?: readonly string[] }>;
  };
}

/** その町の見取り図に住む人で、一言を持っている人（生成地方は生成の住人） */
export function voiceNpcsOf(state: GameState): VoiceLike[] {
  const w = genWorld(state);
  if (w !== null)
    return w.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, lines: n.lines }));
  return voices.npcs;
}

/** 地域から街へ戻る門の場所 id（生成地方は <町>.gate、固定マップは "gate"） */
export function gatePlaceOf(state: GameState, place: PlaceLike): string | undefined {
  const w = genWorld(state);
  if (w !== null) {
    const town = place.town ?? w.startTown;
    return `${town}.gate`;
  }
  return "gate";
}

/**
 * 町に届く注文（work.tsx）。固定マップでは town 欄の無い注文は基点の町に
 * 届く（従来どおり）。生成地方では town の無い注文はどの町にも届き、
 * 固定町向け（"ardi"/"bergen"）の注文は存在しない町なので届かない
 */
export function ordersForTown(state: GameState, town: string): Order[] {
  return orders.orders.filter((o) => orderReachesTown(state, o, town));
}

/**
 * 注文がその町に届くか（town 無しの注文は、固定マップでは基点の町
 * アルディにだけ、生成地方ではどの町にも届く）
 */
export function orderReachesTown(state: GameState, o: { town?: string }, town: string): boolean {
  if (genWorld(state) !== null) return o.town === undefined || o.town === town;
  return (o.town ?? "ardi") === town;
}

/* ── 師匠 ── */

/** この世界に居る師匠（生成地方なら生成の師匠、固定マップなら mentors.json） */
export function mentorsOf(state: GameState) {
  const w = genWorld(state);
  return w !== null ? w.mentors : mentorsContent.mentors;
}

/** 場所に居る師匠（その場所の住人に師匠の紐付く人が居るかで見る） */
export function mentorsAtPlace(state: GameState, place: PlaceLike) {
  return mentorsOf(state).filter((m) => m.npc !== undefined && place.npcs.includes(m.npc));
}

/* ── 敵 ── */

const enemyById = new Map(enemies.enemies.map((e) => [e.id, e]));

/** 地域 id → 敵の定義（生成地方は地域の敵表から、固定マップは enemies.json の area 欄） */
export function enemiesAt(state: GameState, areaId: string): EnemyJson[] {
  const w = genWorld(state);
  if (w !== null) {
    const area = w.areas.find((a) => a.id === areaId);
    if (area === undefined) return [];
    return area.enemies
      .map((e) => enemyById.get(e.id))
      .filter((e): e is EnemyJson => e !== undefined)
      .sort((a, b) => a.challenge - b.challenge);
  }
  return enemies.enemies.filter((e) => e.area === areaId);
}

/** 狩りの行き先一覧（狩れる地域 id → 敵）。固定マップは敵の area でまとめる */
export function enemyAreasOf(state: GameState): [string, EnemyJson[]][] {
  const w = genWorld(state);
  if (w === null) {
    const byArea = new Map<string, EnemyJson[]>();
    for (const e of enemies.enemies) {
      const list = byArea.get(e.area) ?? [];
      list.push(e);
      byArea.set(e.area, list);
    }
    return [...byArea.entries()];
  }
  return w.areas
    .filter((a) => a.enemies.length > 0)
    .map((a) => [a.id, enemiesAt(state, a.id)] as [string, EnemyJson[]]);
}

/** 地域の表示名（生成地方は生成名。固定マップは cli.json の地域名表 or id） */
export function areaNameOf(
  state: GameState,
  areaId: string,
  fallback?: Record<string, string>,
): string {
  const w = genWorld(state);
  if (w !== null) {
    const a = w.areas.find((x) => x.id === areaId);
    if (a !== undefined) return a.name;
  }
  return fallback?.[areaId] ?? areaId;
}

/* ── 日々の営みの定義表（LifeConfig への寄与分） ── */

/** 生成世界の LifeConfig 寄与分（stroll の型別表・採集・市場・依頼・地点…） */
export function genLifeContrib(state: GameState): GeneratedWorld["life"] | null {
  return genWorld(state)?.life ?? null;
}
