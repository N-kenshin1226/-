import type { Cond } from "../conditions/index.js";
import type { MentorDefLike } from "../mentors/index.js";
import type { ErrandDef, GatherTable, JourneyDef, LifeOutcome } from "../life/index.js";
import { createRng, type Rng } from "../rng/index.js";
import type { GameState } from "../state/types.js";

/**
 * 地方の生成（G-01、docs/10_world_generation.md）。
 *
 * 「型」は packages/content/world.json（町9種・地域14種＋特別・地点）、
 * 生成の数値ルールは balance.json の world 節（WorldGenConfig）が持つ。
 * このモジュールは世界シードから地方を決定論的に組み立てるだけ ——
 * 同じ seed・同じ recipe なら同じ地方が出るので、生成結果は GameState に
 * 保存せず state.world = {kind:"gen", recipe} の刻印だけを残し、
 * 必要なときにここへ問い合わせて引き直す。
 *
 * 生成の約束（world.schema.ts のコメントと同じ）：
 *   町 id        … `t0`〜（t0 が始まりの町）
 *   町の場所 id  … `<町id>.<key>`（例: t3.market）
 *   地域 id      … `<型id>` / `<型id>.<連番>`（同じ型が複数あると .2 .3 …。
 *                  先頭の地域は旧マップと同じ語彙になる —— 危機の閉鎖や
 *                  発見・名所の条件が地域 id で読み替えられる）
 *   住人 id      … `npc.<町id>.<役割>`（voices.json と同じ語彙）
 *   師匠 id      … `mentor.<町id>.<役割>`（mentors.json と同じ語彙）
 *   地点 id      … `<地域id>.spot.<連番>`
 *   掲示依頼 id  … `err.<町id>.<key>`
 */

/** 生成レシピの版（state.world.recipe に刻む。生成器の形が変わったら上げる） */
export const WORLD_RECIPE = 1;

/* ── balance.json world 節の形（生成ルールの数値） ── */

export interface WorldGenConfig {
  /** 町の数の範囲（docs/10 §3「6〜9」） */
  towns: { min: number; max: number };
  /** 地域の数の範囲（同「15〜25」） */
  areas: { min: number; max: number };
  /** 同じ町の型が1つの世界に出る上限 */
  typeMaxPerWorld: number;
  /** 町グラフに足す追加の道の確率 */
  extraEdgeChance: number;
  /** 町と町の間の旅日数の範囲 */
  journeyDays: { min: number; max: number };
  /** 危険度：輪1つあたりの加算 */
  ringDangerFactor: number;
  /** 輪ごとに出られる型の危険度上限の伸び */
  ringDangerStep: number;
  /** 始まりの町の周りに必ず欲しい安全な地域の危険度上限 */
  safeDanger: number;
  /** 危険度のゆらぎの半幅 */
  dangerJitter: number;
  dangerMin: number;
  dangerMax: number;
  /** 町にぶら下がる地域の最低数（足りない町優先の配分） */
  areasPerTownMin: number;
  /** 遠い町ほど地域が多い量（輪1つあたりの重み） */
  areasExtraPerRing: number;
  /** 地域に出る敵の種類数の範囲 */
  areaEnemies: { min: number; max: number };
  /** 敵の強さの蓋：挑戦差の上限 = base + 危険度 × per */
  dangerChallengeBase: number;
  dangerChallengePer: number;
  /** 地域に作る地点の数の範囲 */
  spots: { min: number; max: number };
  /** 見取り図の位置ゆらぎ（%） */
  placeJitter: number;
  market: { cheapFactor: number; dearFactor: number; townJitter: number };
  mentor: {
    feeMin: number;
    feeMax: number;
    potentialRecover: number;
    gainVs: number;
    condition: number;
  };
  rep: { max: number; errand: number; work: number; donate: number; pricePer: number };
  /** 掲示依頼の仲の増分（その町の宿屋の主） */
  errandBond: number;
}

/* ── world.json の型の最小形（core は定義の形だけを知る） ── */

/** 場所でできる行動（生成される場所に付く。places.schema の action と同じ形） */
export interface WorldPlaceAction {
  type: string;
  kinds?: readonly string[];
  default?: true;
  to?: string;
  spot?: string;
  label?: string;
}

/** 町テンプレートの場所（townBase.places / townTypes[].places） */
export interface WorldTownPlace {
  key: string;
  name: string;
  scene: string;
  pos: readonly [number, number];
  desc: string;
  actions: readonly WorldPlaceAction[];
  gather?: GatherTable;
}

/** 住人テンプレート */
export interface WorldNpcTemplate {
  id: string;
  label: string;
  place: string;
  mentorSkills?: readonly string[];
}

/** 市場の傾向 */
export interface WorldTownMarket {
  stock?: readonly string[];
  cheap?: readonly string[];
  dear?: readonly string[];
}

/** 町ごとの掲示依頼テンプレート */
export interface WorldTownErrand {
  id: string;
  name: string;
  text: string;
  need: Record<string, number>;
  reward: {
    money?: number;
    gain?: { skill: string; amount: number };
    items?: Record<string, number>;
    /** true ならその町の宿屋の主との仲が育つ */
    bond?: true;
  };
}

/** 町の型 */
export interface WorldTownType {
  id: string;
  name: string;
  desc: string;
  names: readonly string[];
  startWeight: number;
  weight: number;
  omit?: readonly string[];
  placeNames?: Record<string, string>;
  places?: readonly WorldTownPlace[];
  npcs?: readonly WorldNpcTemplate[];
  market?: WorldTownMarket;
  errands?: readonly WorldTownErrand[];
  stroll?: readonly LifeOutcome[];
}

/** 地域の型 */
export interface WorldAreaType {
  id: string;
  name: string;
  names: readonly string[];
  descs: readonly string[];
  scene: string;
  danger: number;
  special?: "farm" | "abyss";
  hunt?: boolean;
  fish?: boolean;
  work?: { kinds: readonly string[] };
  gather?: GatherTable;
  enemies?: readonly { id: string; weight: number }[];
  spots?: readonly { kind: string; weight: number }[];
  stroll?: readonly LifeOutcome[];
}

/** 地点の型 */
export interface WorldSpotKind {
  id: string;
  names: readonly string[];
  outcomes: readonly LifeOutcome[];
}

/** world.json 全体の形（型定義表） */
export interface WorldTypeFile {
  townBase: {
    places: readonly WorldTownPlace[];
    npcs: readonly WorldNpcTemplate[];
    market: WorldTownMarket;
  };
  townTypes: readonly WorldTownType[];
  areaTypes: readonly WorldAreaType[];
  spotKinds: readonly WorldSpotKind[];
  npcNames: readonly string[];
  npcVoice: { greet: readonly string[]; respect: readonly string[] };
  mentorText: { desc: string; note: string };
}

/* ── 生成される世界の形（シリアライズ可能なプレーンデータ） ── */

/** 生成される場所（places.json の場所と同じ形。画面側は区別しない） */
export interface GenPlace {
  id: string;
  name: string;
  kind: "town" | "region";
  town?: string;
  scene: string;
  pos?: readonly [number, number];
  desc: string;
  npcs: string[];
  actions: WorldPlaceAction[];
}

/** 生成される町 */
export interface GenTown {
  id: string;
  name: string;
  /** 町の型の id・表示名 */
  typeId: string;
  typeName: string;
  /** 始まりの町からの距離（町グラフの輪。危険度・地域数の基準） */
  ring: number;
}

/** 地域の中の小さな地点 */
export interface GenSpot {
  id: string;
  kind: string;
  name: string;
}

/** 生成される地域 */
export interface GenArea {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  /** 属する町（この町の門から出る） */
  town: string;
  ring: number;
  /** 実効の危険度（型の danger ＋ 輪×係数 ± ゆらぎ、min〜max で切る） */
  danger: number;
  /** 出てくる敵（enemies.json の id＋重み。危険度で絞り込み済み） */
  enemies: readonly { id: string; weight: number }[];
  spots: readonly GenSpot[];
}

/** 生成される住人（voices.json の npc と同じ形） */
export interface GenNpc {
  id: string;
  name: string;
  role: string;
  lines: { greet: readonly string[]; respect: readonly string[] };
}

/** 生成される師匠（mentors.json の形＋画面用の desc/note/居所） */
export interface GenMentor extends MentorDefLike {
  name: string;
  desc: string;
  note: string;
  /** 居所の場所 id */
  place: string;
}

/** LifeConfig への寄与分（呼び出し側が life.json の表と畳み込む） */
export interface GenLifeContrib {
  /** 町の表（id → 名と型。LifeConfig.towns にそのまま使える） */
  towns: Record<string, { name: string; type: string }>;
  /** 町グラフの道（双方向） */
  journeys: JourneyDef[];
  /** 型別の散策表（"town.<型>" / "region.<型>"） */
  stroll: Record<string, LifeOutcome[]>;
  /** 場所ごとの採集表（地域・畑のある町の場所） */
  gather: Record<string, GatherTable>;
  /** 町ごとの品揃え（market.stock の towns 付きエントリ） */
  marketStock: { id: string; towns?: string[] }[];
  /** 町ごとの相場係数（market.townFactor） */
  townFactor: Record<string, Record<string, number>>;
  /** 町ごとの掲示依頼 */
  errands: ErrandDef[];
  /** 場所の帰属（場所 id → 町・型。LifeConfig.places） */
  places: Record<string, { town: string; type: string }>;
  /** 地点の出来事表（LifeConfig.spots） */
  spots: Record<string, LifeOutcome[]>;
}

/** 生成された地方（seed から導出するので state には保存しない） */
export interface GeneratedWorld {
  /** 生成に使った世界シード */
  seed: string;
  /** 生成レシピの版 */
  recipe: number;
  /** 始まりの町の id（t0） */
  startTown: string;
  towns: readonly GenTown[];
  areas: readonly GenArea[];
  /** 町グラフの道（双方向。旅日数つき） */
  roads: readonly { from: string; to: string; days: number }[];
  /** 生成される場所すべて（町の場所＋地域） */
  places: readonly GenPlace[];
  /** 生成される住人 */
  npcs: readonly GenNpc[];
  /** 生成される師匠 */
  mentors: readonly GenMentor[];
  /** LifeConfig への寄与分 */
  life: GenLifeContrib;
}

/* ── 生成 ── */

/** プールから重複なく名を引く。尽きたら "<名><連番>" で続ける */
const makeNamer = (rng: Rng) => {
  const used = new Set<string>();
  const counts = new Map<string, number>();
  return (pool: readonly string[]): string => {
    const rest = pool.filter((n) => !used.has(n));
    let name: string;
    if (rest.length > 0) {
      name = rng.pick(rest);
    } else {
      // 候補を使い切った型は名を使い回して連番で分ける
      const base = pool[rng.int(0, pool.length - 1)]!;
      const n = (counts.get(base) ?? 1) + 1;
      counts.set(base, n);
      name = `${base}${n}`;
    }
    used.add(name);
    return name;
  };
};

/** 重みつきで型を1つ選ぶ（use 済みカウントが cap に達した型は外す） */
function pickTownType(
  rng: Rng,
  types: readonly WorldTownType[],
  counts: Map<string, number>,
  cap: number,
  start: boolean,
): WorldTownType {
  const pool = types
    .filter((t) => (counts.get(t.id) ?? 0) < cap && (start ? t.startWeight > 0 : true))
    .map((t) => ({ item: t, weight: start ? t.startWeight : t.weight }));
  if (pool.length === 0) {
    // cap で尽きたときは上限を広げて選ぶ（町数 > 型数×cap への保険）
    const rest = types.map((t) => ({ item: t, weight: t.weight }));
    const t = rng.weighted(rest);
    counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    return t;
  }
  const t = rng.weighted(pool);
  counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
  return t;
}

/**
 * 世界シードから地方を生成する（docs/10 §3〜5）。
 * 町6〜9・地域15〜25・道のグラフ。始まりの町の周りは安全、遠いほど危険。
 * 乱数は seed 派生の fork ごとに独立 —— 同じ seed なら同じ世界。
 *
 * enemyChallenge は enemies.json の id → 挑戦差の表（危険度の蓋で敵を
 * 絞るためだけに使う。省略時は型の敵表をそのまま重み抽選する）
 */
export function generateWorld(
  seed: string,
  file: WorldTypeFile,
  cfg: WorldGenConfig,
  enemyChallenge?: Record<string, number>,
): GeneratedWorld {
  const rng = createRng(`${seed}:world`);
  const rngTown = rng.fork("towns");
  const rngName = rng.fork("names");
  const rngGraph = rng.fork("graph");
  const rngArea = rng.fork("areas");
  const rngDetail = rng.fork("detail");

  // ── 町：数・型・名 ──
  const nTowns = rngTown.int(cfg.towns.min, cfg.towns.max);
  const typeCounts = new Map<string, number>();
  const townTypes: WorldTownType[] = [];
  // 始まりの町の型（startWeight>0 の型から）
  townTypes.push(pickTownType(rngTown, file.townTypes, typeCounts, cfg.typeMaxPerWorld, true));
  for (let i = 1; i < nTowns; i++) {
    townTypes.push(pickTownType(rngTown, file.townTypes, typeCounts, cfg.typeMaxPerWorld, false));
  }
  const townName = makeNamer(rngName);
  const towns: GenTown[] = townTypes.map((t, i) => ({
    id: `t${i}`,
    name: townName(t.names),
    typeId: t.id,
    typeName: t.name,
    ring: 0, // グラフができてから上書き
  }));

  // ── 道のグラフ：各町を既出の町のどれかに繋ぐ（必ず連結）＋追加の道 ──
  const adj = new Map<string, Set<string>>(towns.map((t) => [t.id, new Set()]));
  const roads: { from: string; to: string; days: number }[] = [];
  const link = (a: string, b: string) => {
    if (adj.get(a)!.has(b)) return;
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
    roads.push({ from: a, to: b, days: rngGraph.int(cfg.journeyDays.min, cfg.journeyDays.max) });
  };
  for (let i = 1; i < towns.length; i++) {
    // 親は近い町ほど選ばれやすい（先に生まれた町ほど街として育つイメージ）
    const parents = towns.slice(0, i).map((t, j) => ({ item: t.id, weight: i - j + 1 }));
    link(towns[i]!.id, rngGraph.weighted(parents));
  }
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 2; j < towns.length; j++) {
      if (rngGraph.next() < cfg.extraEdgeChance) link(towns[i]!.id, towns[j]!.id);
    }
  }

  // ── 輪（始まりの町からの距離）：BFS ──
  const ringOf = new Map<string, number>([[towns[0]!.id, 0]]);
  const queue = [towns[0]!.id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur)!) {
      if (!ringOf.has(nx)) {
        ringOf.set(nx, ringOf.get(cur)! + 1);
        queue.push(nx);
      }
    }
  }
  for (const t of towns) t.ring = ringOf.get(t.id)!;

  // ── 地域：数・型・配置・危険度 ──
  const nAreas = rngArea.int(cfg.areas.min, cfg.areas.max);
  const specials = new Map(
    file.areaTypes.filter((a) => a.special !== undefined).map((a) => [a.special!, a] as const),
  );
  const normals = file.areaTypes.filter((a) => a.special === undefined);
  const maxRing = Math.max(...towns.map((t) => t.ring));
  const farthest = towns.filter((t) => t.ring === maxRing);
  const abyssTown = rngArea.pick(farthest).id;
  const areaTypesById = new Map(file.areaTypes.map((a) => [a.id, a]));

  /** その輪で出られる型（型の danger が輪の許容内） */
  const typesForRing = (ring: number): WorldAreaType[] => {
    const cap = cfg.safeDanger + ring * cfg.ringDangerStep;
    const pool = normals.filter((a) => a.danger <= cap);
    return pool.length > 0 ? pool : [...normals].sort((a, b) => a.danger - b.danger).slice(0, 1);
  };

  interface AreaSeed {
    type: WorldAreaType;
    town: string;
    ring: number;
  }
  const plan: AreaSeed[] = [];
  // 特別な地域：始まりの町の開墾地・最遠の町の深層の穴（必ず1つずつ）
  const farmType = specials.get("farm");
  if (farmType !== undefined) {
    plan.push({ type: farmType, town: towns[0]!.id, ring: 0 });
  }
  const abyssType = specials.get("abyss");
  if (abyssType !== undefined) {
    plan.push({ type: abyssType, town: abyssTown, ring: maxRing });
  }
  // 町ごとの地域配分：まず全町に1つずつ（門から必ずどこかへ出られる硬い保証）、
  // そのあと areasPerTownMin を目指し、残りは遠い町ほど多い重みで配る
  const countByTown = new Map<string, number>(towns.map((t) => [t.id, 0]));
  for (const p of plan) countByTown.set(p.town, countByTown.get(p.town)! + 1);
  const townsByRing = [...towns].sort((a, b) => a.ring - b.ring || a.id.localeCompare(b.id));
  const addArea = (t: GenTown) => {
    const type = rngArea.weighted(typesForRing(t.ring).map((a) => ({ item: a, weight: 1 })));
    plan.push({ type, town: t.id, ring: t.ring });
    countByTown.set(t.id, countByTown.get(t.id)! + 1);
  };
  for (const t of townsByRing) {
    if (countByTown.get(t.id)! === 0 && plan.length < nAreas) addArea(t);
  }
  for (const t of townsByRing) {
    while (countByTown.get(t.id)! < cfg.areasPerTownMin && plan.length < nAreas) {
      addArea(t);
    }
  }
  // 残りは遠い町ほど多い重みで配る
  while (plan.length < nAreas) {
    const town = rngArea.weighted(
      towns.map((t) => ({ item: t, weight: 1 + t.ring * cfg.areasExtraPerRing })),
    );
    const type = rngArea.weighted(typesForRing(town.ring).map((a) => ({ item: a, weight: 1 })));
    plan.push({ type, town: town.id, ring: town.ring });
    countByTown.set(town.id, countByTown.get(town.id)! + 1);
  }

  // ── 地域の名・id・危険度・敵・地点 ──
  const areaName = makeNamer(rngName);
  const typeSeen = new Map<string, number>();
  const spotKindById = new Map(file.spotKinds.map((s) => [s.id, s]));
  const areas: GenArea[] = plan.map(({ type, town, ring }) => {
    const seen = (typeSeen.get(type.id) ?? 0) + 1;
    typeSeen.set(type.id, seen);
    const id = seen === 1 ? type.id : `${type.id}.${seen}`;
    const jitter = (rngDetail.next() * 2 - 1) * cfg.dangerJitter;
    const danger = Math.max(
      cfg.dangerMin,
      Math.min(cfg.dangerMax, Math.round(type.danger + ring * cfg.ringDangerFactor + jitter)),
    );
    // 敵：挑戦差の蓋で絞り、重みつきで areaEnemies.min〜max 種選ぶ
    const cap = cfg.dangerChallengeBase + danger * cfg.dangerChallengePer;
    const nEnemy = rngDetail.int(cfg.areaEnemies.min, cfg.areaEnemies.max);
    const enemies = pickAreaEnemies(rngDetail, type, cap, nEnemy, enemyChallenge);
    // 地点：型の出やすい表から spots.min〜max 個
    const nSpots = rngDetail.int(cfg.spots.min, cfg.spots.max);
    const spots: GenSpot[] = [];
    const spotPool =
      type.spots !== undefined && type.spots.length > 0
        ? type.spots
        : file.spotKinds.map((s) => ({ kind: s.id, weight: 1 }));
    const spotName = makeNamer(rngName);
    for (let i = 0; i < nSpots; i++) {
      const kindId = rngDetail.weighted(spotPool.map((s) => ({ item: s.kind, weight: s.weight })));
      const kind = spotKindById.get(kindId);
      if (kind === undefined) continue;
      spots.push({ id: `${id}.spot.${i + 1}`, kind: kindId, name: spotName(kind.names) });
    }
    return {
      id,
      name: areaName(type.names),
      typeId: type.id,
      typeName: type.name,
      town,
      ring,
      danger,
      enemies,
      spots,
    };
  });

  // ── 場所：町の見取り図＋地域 ──
  const places: GenPlace[] = [];
  const npcById = new Map<string, GenNpc>();
  const mentors: GenMentor[] = [];
  const lifeTowns: GenLifeContrib["towns"] = {};
  const lifeStroll: GenLifeContrib["stroll"] = {};
  const lifeGather: GenLifeContrib["gather"] = {};
  const lifeErrands: GenLifeContrib["errands"] = [];
  const lifePlaces: GenLifeContrib["places"] = {};
  const lifeSpots: GenLifeContrib["spots"] = {};
  const marketStockByTown = new Map<string, Set<string>>();
  const lifeTownFactor: GenLifeContrib["townFactor"] = {};
  const npcName = makeNamer(rngName);

  const townTypeById = new Map(file.townTypes.map((t) => [t.id, t]));
  for (const town of towns) {
    const type = townTypeById.get(town.typeId)!;
    const omit = new Set(type.omit ?? []);
    lifeTowns[town.id] = { name: town.name, type: type.id };
    if (type.stroll !== undefined) lifeStroll[`town.${type.id}`] = [...type.stroll];

    // 場所：基本 −omit ＋ 型固有。gate は道・地域への出口が乗る
    const tmpl = [...file.townBase.places.filter((p) => !omit.has(p.key)), ...(type.places ?? [])];
    const areaIds = areas.filter((a) => a.town === town.id).map((a) => a.id);
    const neighbors = [...(adj.get(town.id) ?? [])].sort();
    for (const p of tmpl) {
      const id = `${town.id}.${p.key}`;
      const pos: readonly [number, number] = [
        Math.max(
          0,
          Math.min(
            100,
            p.pos[0] + Math.round(rngDetail.next() * 2 * cfg.placeJitter) - cfg.placeJitter,
          ),
        ),
        Math.max(
          0,
          Math.min(
            100,
            p.pos[1] + Math.round(rngDetail.next() * 2 * cfg.placeJitter) - cfg.placeJitter,
          ),
        ),
      ];
      const actions: WorldPlaceAction[] = p.actions.map((a) => ({ ...a }));
      if (p.key === "gate") {
        for (const nb of neighbors) actions.push({ type: "journey", to: nb });
        for (const a of areaIds) actions.push({ type: "travel", to: a });
      }
      places.push({
        id,
        name: type.placeNames?.[p.key] ?? p.name,
        kind: "town",
        town: town.id,
        scene: p.scene,
        pos,
        desc: p.desc.replaceAll("{town}", town.name),
        npcs: [],
        actions,
      });
      lifePlaces[id] = { town: town.id, type: type.id };
      if (p.gather !== undefined) lifeGather[id] = p.gather;
    }

    // 住人：基本＋型固有。師匠になれる技能を持つ住人は師匠としても登録
    const npcTmpl = [...file.townBase.npcs, ...(type.npcs ?? [])];
    for (const n of npcTmpl) {
      const placeId = `${town.id}.${n.place}`;
      const npcId = `npc.${town.id}.${n.id}`;
      const name = npcName(file.npcNames);
      npcById.set(npcId, {
        id: npcId,
        name,
        role: n.label,
        lines: { greet: file.npcVoice.greet, respect: file.npcVoice.respect },
      });
      const place = places.find((pl) => pl.id === placeId);
      place?.npcs.push(npcId);
      if (n.mentorSkills !== undefined && n.mentorSkills.length > 0) {
        const skill = rngDetail.pick(n.mentorSkills);
        const mentorId = `mentor.${town.id}.${n.id}`;
        mentors.push({
          id: mentorId,
          name,
          npc: npcId,
          skill,
          condition: { skill, gte: cfg.mentor.condition } as Cond,
          fee: rngDetail.int(cfg.mentor.feeMin, cfg.mentor.feeMax),
          potentialRecover: cfg.mentor.potentialRecover,
          effect: { gainVs: { [skill]: cfg.mentor.gainVs } },
          flag: `taught.${town.id}.${n.id}`,
          place: placeId,
          desc: file.mentorText.desc
            .replaceAll("{town}", town.name)
            .replaceAll("{skill}", skillNameOr(skill)),
          note: file.mentorText.note
            .replaceAll("{skill}", skillNameOr(skill))
            .replaceAll("{condition}", String(cfg.mentor.condition)),
        });
      }
    }

    // 掲示依頼（bond:true → その町の宿屋の主）
    for (const e of type.errands ?? []) {
      lifeErrands.push({
        id: `err.${town.id}.${e.id}`,
        name: e.name,
        text: e.text,
        town: town.id,
        need: { ...e.need },
        reward: {
          ...(e.reward.money !== undefined ? { money: e.reward.money } : {}),
          ...(e.reward.gain !== undefined ? { gain: { ...e.reward.gain } } : {}),
          ...(e.reward.items !== undefined ? { items: { ...e.reward.items } } : {}),
          ...(e.reward.bond === true
            ? { bond: { npc: `npc.${town.id}.innkeeper`, amount: cfg.errandBond } }
            : {}),
        },
      });
    }

    // 市場：基本の品揃え＋型の品揃え。特産は安く・不足は高く・町ごとの揺らぎ
    const stock = new Set([...(file.townBase.market.stock ?? []), ...(type.market?.stock ?? [])]);
    marketStockByTown.set(town.id, stock);
    const townJitter = 1 + (rngDetail.next() * 2 - 1) * cfg.market.townJitter;
    const factor: Record<string, number> = { "*": round3(townJitter) };
    for (const id of type.market?.cheap ?? [])
      factor[id] = round3(cfg.market.cheapFactor * townJitter);
    for (const id of type.market?.dear ?? [])
      factor[id] = round3(cfg.market.dearFactor * townJitter);
    lifeTownFactor[town.id] = factor;
  }

  // 地域の場所（門から出る先）。行動は型＋地点＋道で組み立てる
  for (const area of areas) {
    const type = areaTypesById.get(area.typeId)!;
    if (type.stroll !== undefined) lifeStroll[`region.${type.id}`] = [...type.stroll];
    const actions: WorldPlaceAction[] = [];
    if (area.enemies.length > 0) actions.push({ type: "hunt" });
    // 深層の穴（special:"abyss"）は潜る行動が付く —— 最遠の町に必ず1つある
    if (type.special === "abyss") actions.push({ type: "abyss" });
    if (type.fish === true) actions.push({ type: "fish" });
    if (type.gather !== undefined) {
      actions.push({ type: "gather" });
      lifeGather[area.id] = type.gather;
    }
    actions.push({ type: "stroll" });
    if (type.work !== undefined) actions.push({ type: "work", kinds: [...type.work.kinds] });
    for (const s of area.spots) {
      actions.push({ type: "spot", spot: s.id, label: s.name });
      const kind = spotKindById.get(s.kind);
      if (kind !== undefined) lifeSpots[s.id] = [...kind.outcomes];
    }
    actions.push({ type: "travel", to: `${area.town}.gate` });
    for (const sib of areas.filter((a) => a.town === area.town && a.id !== area.id).slice(0, 5)) {
      actions.push({ type: "travel", to: sib.id });
    }
    places.push({
      id: area.id,
      name: area.name,
      kind: "region",
      town: area.town,
      scene: type.scene,
      desc: rngDetail.pick(type.descs),
      npcs: [],
      actions,
    });
    lifePlaces[area.id] = { town: area.town, type: type.id };
  }

  // 市場の品揃え：品 → 並ぶ町（market.stock の towns 付きエントリに畳む）
  const stockUnion = new Map<string, string[]>();
  for (const [town, set] of marketStockByTown) {
    for (const id of set) {
      const list = stockUnion.get(id) ?? [];
      list.push(town);
      stockUnion.set(id, list);
    }
  }
  const marketStock = [...stockUnion.entries()].map(([id, townIds]) => ({
    id,
    towns: [...townIds].sort(),
  }));

  return {
    seed,
    recipe: WORLD_RECIPE,
    startTown: towns[0]!.id,
    towns,
    areas,
    roads,
    places,
    npcs: [...npcById.values()],
    mentors,
    life: {
      towns: lifeTowns,
      journeys: roads.map((r) => ({ ...r })),
      stroll: lifeStroll,
      gather: lifeGather,
      marketStock,
      townFactor: lifeTownFactor,
      errands: lifeErrands,
      places: lifePlaces,
      spots: lifeSpots,
    },
  };
}

/** 小数の丸め（相場係数の見た目を揃える） */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 師匠の説明文に使う技能名（skills.json は core から見えないので id のまま） */
function skillNameOr(id: string): string {
  return id;
}

/**
 * その地域に出る敵を選ぶ。型の敵表から挑戦差の蓋以下だけを取り、
 * 重みつきで重複なく n 種まで。蓋で全部落ちたときは弱い順に n 種
 * （安全な地域にも獲物は居る）。enemyChallenge は enemies.json の
 * id → 挑戦差の表（省略時は蓋を掛けず型の表のまま選ぶ）
 */
function pickAreaEnemies(
  rng: Rng,
  type: WorldAreaType,
  challengeCap: number,
  n: number,
  enemyChallenge?: Record<string, number>,
): { id: string; weight: number }[] {
  const all = type.enemies ?? [];
  if (all.length === 0 || n <= 0) return [];
  let pool = [...all];
  if (enemyChallenge !== undefined) {
    const fit = pool.filter((e) => (enemyChallenge[e.id] ?? 0) <= challengeCap);
    if (fit.length >= n) {
      pool = fit;
    } else {
      // 蓋を満たす種が足りない：満たす分＋残りを弱い順に埋める
      const rest = pool
        .filter((e) => !fit.includes(e))
        .sort((a, b) => (enemyChallenge[a.id] ?? 0) - (enemyChallenge[b.id] ?? 0));
      pool = [...fit, ...rest.slice(0, n - fit.length)];
    }
  }
  const picked: { id: string; weight: number }[] = [];
  while (picked.length < n && pool.length > 0) {
    const e = rng.weighted(pool.map((p) => ({ item: p, weight: p.weight })));
    picked.push({ id: e.id, weight: e.weight });
    pool.splice(pool.indexOf(e), 1);
  }
  return picked;
}

/* ── 参照（state → 世界） ── */

/** この state の世界の出所（v21 より前の形でも legacy に倒す） */
export function worldKindOf(state: GameState): "legacy" | "gen" {
  return state.world?.kind ?? "legacy";
}

/**
 * state の世界を引き直す。legacy の世界は固定マップ（生成しない）なので
 * null を返す —— 呼び出し側は固定コンテンツ（places.json 等）を使う。
 * gen の世界は seed と recipe で再生成する（同じ版なら必ず同じ地方）
 */
export function worldFor(
  state: GameState,
  file: WorldTypeFile,
  cfg: WorldGenConfig,
  enemyChallenge?: Record<string, number>,
): GeneratedWorld | null {
  if (worldKindOf(state) !== "gen") return null;
  // recipe の版差し替えはここに足す（今は v1 のみ。同じ版なら必ず同じ地方）
  return generateWorld(state.seed, file, cfg, enemyChallenge);
}

/**
 * 場所 id → 属する町（生成世界。LifeConfig.places と同じ結線）。
 * 町の場所・地域どちらも属する町が分かる
 */
export function placeTownOf(world: GeneratedWorld, place: string): string | undefined {
  return world.life.places[place]?.town;
}

/** 場所 id → 型の id（町の場所なら町の型、地域なら地域の型） */
export function placeTypeOf(world: GeneratedWorld, place: string): string | undefined {
  return world.life.places[place]?.type;
}
