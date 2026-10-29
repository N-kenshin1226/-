import { describe, expect, it } from "vitest";
import type { EnemyDef } from "../combat/index.js";
import { createRng } from "../rng/index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { WorldGenConfig, WorldTypeFile } from "../world/index.js";
import { generateWorld } from "../world/index.js";
import {
  bossEnemy,
  bossName,
  dgCampKey,
  dgClearedKey,
  dgProgress,
  dgRoomsKey,
  dgUniqueKey,
  dgUniqueTotalKey,
  floorRooms,
  generateDungeons,
  isBossRoom,
  roomAt,
  rollTrap,
  scaleRoomEnemy,
  totalRooms,
  type DungeonConfig,
  type WorldDungeonType,
  type WorldTrapKind,
} from "./index.js";

/**
 * 有限迷宮（G-03、docs/10_world_generation.md §6）の検証。
 * world.json そのものではなく最小の型定義表で回す ——
 * ここで確かめるのは生成ルール（決定性・個数・ユニークの1体性・
 * 部屋の構造）と step への進行の刻み方（抜いた室数・制覇・野営）
 */

/* ── 迷宮の型（7種を最小化したもの。world.json と同じ語彙） ── */
const traps: WorldTrapKind[] = [
  {
    id: "pitfall",
    name: "落とし穴",
    difficulty: 8,
    fatigue: 12,
    light: 2,
    sprungText: "――落とし穴に落ちた。",
    avoidText: "――落とし穴を見破った。",
  },
  {
    id: "darts",
    name: "飛び矢",
    difficulty: 12,
    fatigue: 8,
    light: 1,
    sprungText: "――飛び矢に掠られた。",
    avoidText: "――飛び矢の仕掛けを外した。",
  },
];

const dgType = (id: string, name: string, danger: number): WorldDungeonType => ({
  id,
  name,
  danger,
  names: [`${name}甲`, `${name}乙`, `${name}丙`, `${name}丁`],
  desc: `${name}の説明`,
  enemies: [
    { id: "slime", weight: 3 },
    { id: "wolf", weight: 2 },
  ],
  traps: [
    { id: "pitfall", weight: 3 },
    { id: "darts", weight: 1 },
  ],
  treasure: [
    { item: "ore.copper", weight: 2, n: [1, 2] },
    { item: "herb", weight: 1, n: [1, 3] },
  ],
  bosses: [{ enemy: "golem", weight: 1 }],
  bossTitles: ["主", "覇者"],
  uniqueNames: [`${name}の絶対者`],
});

const types: WorldDungeonType[] = [
  dgType("cave", "洞窟", 1),
  dgType("mine", "坑道", 2),
  dgType("crypt", "地下墓所", 3),
  dgType("nest", "魔物の巣", 4),
  dgType("ruins", "古代遺跡", 5),
  dgType("tower", "塔", 6),
  dgType("sunken", "沈んだ神殿", 8),
];

const dgCfg: DungeonConfig = {
  count: { min: 5, max: 9 },
  typeMaxPerWorld: 2,
  ringWeight: 0.5,
  uniqueBossMinDanger: 4,
  floorsBase: 2.6,
  floorsPerDanger: 0.42,
  floorJitter: 0.8,
  floors: { min: 3, max: 6 },
  rooms: { min: 2, max: 4 },
  roomWeights: { combat: 6, trap: 1, treasure: 1 },
  treasureRolls: 2,
  treasureMoneyBase: 20,
  treasureMoneyPerDanger: 8,
  bossTreasureFactor: 2,
  bossTreasureMoneyBonus: 60,
  enemyBaseFactor: 1.0,
  enemyFloorFactor: 0.15,
  enemyAgilityPerFloor: 0.3,
  bossHpFactor: 1.6,
  bossPowerFactor: 1.2,
  bossChallengeFactor: 1.3,
  bossAgilityBonus: 4,
  uniqueHpFactor: 1.35,
  uniquePowerFactor: 1.15,
  uniqueChallengeFactor: 1.25,
  uniqueAgilityBonus: 6,
  lightPerDive: 16,
  roomLightCost: 1,
  diveCost: 2,
  campQuality: 0.45,
  trapAvoidBase: 0.5,
  trapAvoidPerSkill: 0.02,
};

/** 輪0〜3の町4つ（生成の引き回しを直接確かめる用） */
const towns4 = [
  { id: "t0", ring: 0 },
  { id: "t1", ring: 1 },
  { id: "t2", ring: 2 },
  { id: "t3", ring: 3 },
];

const gen = (seed: string) =>
  generateDungeons(createRng(`${seed}:dungeons`), types, towns4, dgCfg, 2, 2);

/** 出来事の部屋つきの型と生成設定（X-30） */
const typesWithEvents: WorldDungeonType[] = [
  {
    ...dgType("cave", "洞窟", 1),
    events: [
      { weight: 2, text: "清水が滲み出ている", fatigue: -6 },
      { weight: 1, text: "古い絵を見つけた", gain: { skill: "observation", amount: 8 } },
    ],
  },
  ...types.slice(1),
];
const dgCfgEvents: DungeonConfig = {
  ...dgCfg,
  roomWeights: { ...dgCfg.roomWeights, event: 4 },
};
const genWithEvents = (seed: string) =>
  generateDungeons(createRng(`${seed}:dungeons`), typesWithEvents, towns4, dgCfgEvents, 2, 2);

describe("generateDungeons（G-03 迷宮の生成）", () => {
  it("同じシードなら同じ迷宮群が出る（決定性）", () => {
    expect(gen("w")).toEqual(gen("w"));
    expect(gen("w")).not.toEqual(gen("x"));
  });

  it("個数は count の範囲内、始まりの町に必ず1つ（200シード）", () => {
    for (let i = 0; i < 200; i++) {
      const ds = gen(`n${i}`);
      expect(ds.length).toBeGreaterThanOrEqual(dgCfg.count.min);
      expect(ds.length).toBeLessThanOrEqual(dgCfg.count.max);
      // 最初の1つは始まりの町（towns[0]）に必置
      expect(ds[0]!.town).toBe("t0");
      // id は通し番号
      ds.forEach((d, k) => expect(d.id).toBe(`dg${k}`));
    }
  });

  it("ユニークモンスターは世界に1体だけ（200シード、受入条件）", () => {
    for (let i = 0; i < 200; i++) {
      const ds = gen(`u${i}`);
      const uniques = ds.filter((d) => d.boss.unique);
      expect(uniques).toHaveLength(1);
      // ユニークには生成名が付き、危険度が十分な迷宮から選ばれる
      expect(uniques[0]!.boss.name).toBeTruthy();
      expect(uniques[0]!.danger).toBeGreaterThanOrEqual(dgCfg.uniqueBossMinDanger);
    }
  });

  it("全7種の迷宮がシードを変えると出る（型の偏りなし）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const d of gen(`t${i}`)) seen.add(d.type);
    expect(seen).toEqual(new Set(types.map((t) => t.id)));
  });

  it("型の重複は typeMaxPerWorld まで（200シード）", () => {
    for (let i = 0; i < 200; i++) {
      const ds = gen(`m${i}`);
      const counts = new Map<string, number>();
      for (const d of ds) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
      for (const n of counts.values()) expect(n).toBeLessThanOrEqual(dgCfg.typeMaxPerWorld);
    }
  });

  it("出来事の部屋：events のある型だけに出て、どの出来事かは生成で決まる（X-30）", () => {
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      for (const d of genWithEvents(`ev${i}`)) {
        for (const f of d.floors) {
          for (const r of f.rooms) {
            if (r.kind !== "event") continue;
            seen++;
            // 出来事の部屋は出来事を持たない型には出ない
            expect(d.type).toBe("cave");
            // eventIdx は型の表の中（決定的 —— 同じシードで同じ部屋）
            expect(r.eventIdx).toBeDefined();
            expect(r.eventIdx!).toBeGreaterThanOrEqual(0);
            expect(r.eventIdx!).toBeLessThan(2);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    // 決定的：同じシードなら同じ出来事の部屋
    expect(genWithEvents("ev0")).toEqual(genWithEvents("ev0"));
    // events の無い型では従来どおり（重みは加えられない）
    const plain = gen("w").flatMap((d) => d.floors.flatMap((f) => f.rooms));
    expect(plain.every((r) => r.kind !== "event")).toBe(true);
  });

  it("部屋は階層×部屋数で組み立てられ、主の間は最後の1室", () => {
    const ds = gen("rooms");
    for (const d of ds) {
      expect(d.floors.length).toBeGreaterThanOrEqual(dgCfg.floors.min);
      expect(d.floors.length).toBeLessThanOrEqual(dgCfg.floors.max);
      for (const f of d.floors) {
        expect(f.rooms.length).toBeGreaterThanOrEqual(dgCfg.rooms.min);
        expect(f.rooms.length).toBeLessThanOrEqual(dgCfg.rooms.max);
        for (const r of f.rooms) {
          if (r.kind === "combat") expect(r.enemyId).toBeTruthy();
          if (r.kind === "trap") expect(r.trapId).toBeTruthy();
          if (r.kind === "treasure")
            expect(r.loot.length + (r.money > 0 ? 1 : 0)).toBeGreaterThan(0);
        }
      }
      // 主の間は通し番号の最後（非ボス部屋数 == floorRooms）
      expect(isBossRoom(d, floorRooms(d))).toBe(true);
      expect(isBossRoom(d, floorRooms(d) - 1)).toBe(false);
      expect(totalRooms(d)).toBe(floorRooms(d) + 1);
      // roomAt は層・層内番号を返す（範囲外は null）
      const last = roomAt(d, floorRooms(d) - 1);
      expect(last).not.toBeNull();
      expect(last!.floorIndex).toBe(d.floors.length - 1);
      expect(roomAt(d, floorRooms(d))).toBeNull();
      // 主は型の表から、主の宝物は空でない
      expect(d.boss.enemyId).toBe("golem");
      expect(d.bossLoot.length + (d.bossMoney > 0 ? 1 : 0)).toBeGreaterThan(0);
    }
  });
});

describe("部屋の強化・罠（G-03）", () => {
  const mk = (
    id: string,
    hp: number,
    challenge: number,
    agility: number,
    power: number,
  ): EnemyDef => ({
    id,
    name: id,
    hp,
    intervalTicks: 10,
    challenge,
    agility,
    attack: { id: `${id}-atk`, name: "攻撃", power },
    moves: { big: { id: `${id}-big`, name: "大技", power: power * 2 } },
    pattern: [{ type: "attack" }],
  });

  it("部屋の敵は層で強くなる（HP・威力・挑戦差・敏捷）", () => {
    const base = mk("wolf", 20, 15, 5, 4);
    const f2 = scaleRoomEnemy(base, 2, dgCfg); // factor = 1.0 + 0.15*2 = 1.3
    expect(f2.hp).toBe(Math.round(20 * 1.3));
    expect(f2.challenge).toBe(Math.round(15 * 1.3));
    expect(f2.agility).toBe(Math.round(5 + 0.3 * 2));
    expect(f2.attack.power).toBe(Math.round(4 * 1.3));
    expect(f2.pattern).toEqual(base.pattern);
  });

  it("主は最深層の強化に boss 係数、ユニークはさらに unique 係数が乗る", () => {
    const base = mk("golem", 50, 30, 3, 8);
    const d = gen("boss")[0]!;
    const b = bossEnemy(base, d, dgCfg);
    const f = dgCfg.enemyBaseFactor + dgCfg.enemyFloorFactor * d.floors.length;
    const uniqueF = d.boss.unique ? dgCfg.uniqueHpFactor : 1;
    expect(b.hp).toBe(Math.round(50 * f * dgCfg.bossHpFactor * uniqueF));
    expect(b.challenge).toBe(
      Math.round(
        30 * f * dgCfg.bossChallengeFactor * (d.boss.unique ? dgCfg.uniqueChallengeFactor : 1),
      ),
    );
    // ユニーク印：図鑑・個体抽選の扱いを固定する
    expect((b as { uniqueVariant?: boolean }).uniqueVariant).toBe(true);
    // 名は《称号》＋種名（ユニークは生成名）
    const dn = bossName(d, base.name);
    expect(dn.startsWith("《")).toBe(true);
    if (d.boss.unique) expect(dn).toContain(d.boss.name!);
    else expect(dn).toContain(base.name);
  });

  it("罠の見破りは決定的で、観察が高いほど避ける", () => {
    const pit = traps[0]!;
    const a = rollTrap(pit, "k1", 0, dgCfg);
    expect(rollTrap(pit, "k1", 0, dgCfg)).toEqual(a);
    // 同じ鍵・違う観察：高観察は回避側に動く（期待通りの分類になるまで確率的だが、
    // 決定的なので成立する値で確かめる）
    let sprung0 = 0;
    let sprung40 = 0;
    for (let i = 0; i < 200; i++) {
      if (rollTrap(pit, `k${i}`, 0, dgCfg).sprung) sprung0++;
      if (rollTrap(pit, `k${i}`, 40, dgCfg).sprung) sprung40++;
    }
    expect(sprung40).toBeLessThan(sprung0);
    // 踏んだ分だけ疲労・灯りのロスが乗る
    if (a.sprung) {
      expect(a.fatigue).toBe(pit.fatigue);
      expect(a.light).toBe(pit.light);
    } else {
      expect(a.fatigue).toBe(0);
      expect(a.light).toBe(0);
    }
  });
});

/* ── generateWorld との接続（迷宮は世界の場所として門の先に出る） ── */

const worldCfg: WorldGenConfig = {
  towns: { min: 6, max: 9 },
  areas: { min: 15, max: 25 },
  typeMaxPerWorld: 2,
  extraEdgeChance: 0.2,
  journeyDays: { min: 1, max: 3 },
  ringDangerFactor: 1,
  ringDangerStep: 2,
  safeDanger: 2,
  dangerJitter: 0.5,
  dangerMin: 0,
  dangerMax: 10,
  areasPerTownMin: 2,
  areasExtraPerRing: 1.5,
  areaEnemies: { min: 2, max: 4 },
  dangerChallengeBase: 2,
  dangerChallengePer: 2,
  spots: { min: 1, max: 2 },
  placeJitter: 3,
  placeMarkGap: { x: 15, y: 20 },
  market: { cheapFactor: 0.8, dearFactor: 1.25, townJitter: 0.1 },
  mentor: { feeMin: 40, feeMax: 60, potentialRecover: 20, gainVs: 1, condition: 8 },
  rep: { max: 100, errand: 4, work: 2, donate: 3, pricePer: 0.002 },
  errandBond: 8,
  roads: {
    seaPortChance: 0.6,
    mountainRing: 2,
    mountainChance: 0.5,
    dangerBase: 1,
    dangerPerRing: 1.5,
    dangerPerDay: 0.5,
    dangerJitter: 0.5,
    dangerMin: 1,
    dangerMax: 8,
    checkpointChance: 0.3,
    checkpointFee: { min: 8, max: 20 },
    closedSeasons: { mountain: [3], sea: [3] },
    enemies: { min: 1, max: 3 },
  },
  map: {
    center: [50, 50],
    radiusPerRing: 24,
    angleJitter: 0.5,
    radiusJitter: 5,
    margin: 8,
    minTownDist: 12,
  },
  dungeons: dgCfg,
};

const file: WorldTypeFile = {
  townBase: {
    places: [
      {
        key: "gate",
        name: "門",
        scene: "gate",
        pos: [50, 80],
        desc: "{town}の門",
        actions: [{ type: "stroll" }],
      },
      {
        key: "inn",
        name: "宿屋",
        scene: "inn",
        pos: [30, 60],
        desc: "{town}の宿屋",
        actions: [{ type: "rest" }],
      },
      {
        key: "home",
        name: "自宅",
        scene: "home",
        pos: [60, 70],
        desc: "{town}の自宅",
        actions: [{ type: "sleep" }],
      },
    ],
    npcs: [{ id: "innkeeper", label: "宿屋の主", place: "inn" }],
    market: { stock: ["herb"] },
  },
  townTypes: [
    {
      id: "village",
      name: "農村",
      desc: "畑の村",
      names: ["ミーナ", "コルト", "ハイル"],
      startWeight: 3,
      weight: 3,
      stroll: [{ weight: 1, text: "――風が畑を渡る。", money: 1 }],
    },
    {
      id: "castle",
      name: "城下町",
      desc: "城の町",
      names: ["ルーン", "ヴァルト"],
      startWeight: 0,
      weight: 2,
      stroll: [{ weight: 1, text: "――鎧の音がする。" }],
    },
  ],
  areaTypes: [
    {
      id: "meadow",
      name: "草原",
      names: ["緑の原", "風の野", "薄野"],
      descs: ["草の匂いがする。"],
      scene: "highway",
      danger: 1,
      enemies: [{ id: "slime", weight: 1 }],
      spots: [{ kind: "spring", weight: 1 }],
    },
    {
      id: "marsh",
      name: "沼地",
      names: ["沈みの沢", "昏い沼"],
      descs: ["足元が濡れる。"],
      scene: "lake",
      danger: 4,
      enemies: [{ id: "wraith", weight: 1 }],
      spots: [{ kind: "spring", weight: 1 }],
    },
    {
      id: "peak",
      name: "高峰",
      names: ["白き峰", "崩れの岳"],
      descs: ["空気が薄い。"],
      scene: "forest",
      danger: 7,
      enemies: [{ id: "golem", weight: 1 }],
      spots: [{ kind: "spring", weight: 1 }],
    },
  ],
  spotKinds: [
    {
      id: "spring",
      names: ["清水", "湧き水"],
      outcomes: [{ weight: 1, text: "――水を汲んだ。" }],
    },
  ],
  trapKinds: traps,
  dungeonTypes: types,
  npcNames: ["マルタ", "エーデル"],
  npcVoice: { greet: ["よう"], respect: ["いつもの方だ"] },
  mentorText: { desc: "{town}で{skill}を教えてくれる。", note: "{skill} {condition} 以上。" },
};

describe("generateWorld への迷宮の組み込み（G-03）", () => {
  it("迷宮は世界の場所として出て、置かれた町の門から辿れる", () => {
    const w = generateWorld("dgw", file, worldCfg);
    expect(w.dungeons.length).toBeGreaterThanOrEqual(dgCfg.count.min);
    for (const d of w.dungeons) {
      // 迷宮の場所：潜る行動＋門への引き返しだけを持つ袋小路
      const p = w.places.find((x) => x.id === d.id);
      expect(p).toBeDefined();
      expect(p!.name).toBe(d.name);
      expect(p!.town).toBe(d.town);
      expect(p!.actions.some((a) => a.type === "dungeon")).toBe(true);
      expect(p!.actions.some((a) => a.type === "travel" && a.to === `${d.town}.gate`)).toBe(true);
      // 門から迷宮への道がある
      const gate = w.places.find((x) => x.id === `${d.town}.gate`);
      expect(gate!.actions.some((a) => a.type === "travel" && a.to === d.id)).toBe(true);
      // 帰属は迷宮の型（dg.<type>）
      expect(w.life.places[d.id]?.type).toBe(`dg.${d.type}`);
    }
  });

  it("迷宮の生成は町・地域・人の並びを変えない（fork 系列の独立）", () => {
    const { dungeons: _dg, ...cfgNo } = worldCfg;
    const withDg = generateWorld("iso", file, worldCfg);
    const noDg = generateWorld("iso", file, cfgNo);
    // 迷宮を足しても既存の生成物（町・地域・道・人）は同じ
    expect(noDg.dungeons).toHaveLength(0);
    expect(withDg.towns).toEqual(noDg.towns);
    expect(withDg.areas).toEqual(noDg.areas);
    expect(withDg.roads).toEqual(noDg.roads);
    expect(withDg.npcs).toEqual(noDg.npcs);
    // 場所は迷宮の分だけ増える
    expect(withDg.places.length).toBe(noDg.places.length + withDg.dungeons.length);
  });

  it("dungeons / dungeonTypes が無ければ迷宮を作らない", () => {
    const { dungeons: _dg, ...cfgNo } = worldCfg;
    expect(generateWorld("x", file, cfgNo).dungeons).toHaveLength(0);
    const { dungeonTypes: _dt, ...fileNo } = file;
    expect(generateWorld("x", fileNo, worldCfg).dungeons).toHaveLength(0);
  });
});

/* ── step との接続（dungeon コマンド：抜いた室数・制覇・野営・主の記録） ── */
// abyss.test.ts と同じ構成（balance.json 相当の最小値）＋ dungeons
const baseCfg = (): StepConfig => ({
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 100,
  gain: {
    base: { train: 3.6, work: 2.5, combat: 4 },
    challengePoints: [
      [-20, 0.4],
      [0, 1],
      [10, 1.3],
      [30, 1.5],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 0.15,
    noveltyWindow: 20,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.5,
  },
  sleep: {
    nightlyCapPerSkill: 8.0,
    nightlyCapTotal: 999,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
    qualityMin: 0.6,
    qualityMax: 1.2,
    potentialDecayPerPoint: 0.01,
  },
  tailwind: {
    defs: [],
    tailwindFactor: 1.3,
    headwindFactor: 0.8,
    recentDays: 3,
    headwindBiasK: 1.5,
    tailwindBoostK: 0.5,
    drawMin: 1,
    drawMax: 2,
  },
  body: {
    fatiguePerAction: { wait: 1, train: 12, work: 10, combat: 20, abyss: 24, dungeon: 16 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: {
      train: { strength: 2, endurance: 2, dexterity: 2 },
      work: { dexterity: 2, spirit: 1 },
      combat: { strength: 2, endurance: 3, agility: 2 },
      abyss: { strength: 2, endurance: 3, agility: 2 },
      dungeon: { strength: 1, endurance: 2, agility: 2 },
    },
    statGainPerLoad: 0.05,
    overloadThreshold: 25,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
  },
  ledger: {
    basePricePerQuality: 1,
    marketWindowDays: 7,
    marketDecayPerWork: 0.9,
    tierUpBonusPending: 2,
  },
  combat: {
    baseHp: 30,
    hpPerEndurance: 2,
    attackBase: 5,
    attackPerWeaponSkill: 0.15,
    attackPerStrength: 0.2,
    ctBase: 12,
    ctPerAgility: 0.15,
    ctMin: 6,
    defendFactor: 0.5,
    fleeBase: 0.7,
    fleePerAgility: 0.02,
    observeBonus: 20,
    preciseObserve: 40,
    deathPendingFactor: 0.5,
    hitBase: 0.86,
    hitPerWeaponSkill: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerWeaponSkill: 0.002,
    critFactor: 1.8,
    enemyCritBase: 0.05,
    enemyCritFactor: 1.6,
    evadeBase: 0.06,
    evadePerEvasion: 0.004,
    evadePerAgilityDiff: 0.008,
    evadeMax: 0.7,
    readEvadeBonus: 0.5,
    guardTelegraphFactor: 0.15,
    counterFactor: 2.4,
    counterFactorRead: 2.8,
    openingTicks: 16,
    staggerTicks: 11,
  },
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [],
  /** 有限迷宮：潜りは2行動、迷宮内野営の質は街道より悪い */
  dungeons: { diveCost: 2, campQuality: 0.45 },
  dungeonIds: ["dg0", "dg1"],
});

const SKILL_IDS = ["swordplay", "evasion", "observation"];
const fresh = () =>
  newGame("seed", "名無し", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });
const dives = (n: number) => Array.from({ length: n }, () => ({ enemyId: "wolf", difficulty: 15 }));

describe("dungeon コマンド（G-03）", () => {
  it("潜りは diveCost 行動を消費し、抜いた室数が counters に畳まれる", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "dungeon",
        id: "dg0",
        end: "retreat",
        rooms: 3,
        total: 7,
        kills: dives(2),
      },
      baseCfg(),
    );
    // 潜りは2行動
    expect(state.time.action).toBe(s0.time.action + 2);
    // 抜いた室数の累計・潜りの回数
    expect(state.counters[dgRoomsKey("dg0")]).toBe(3);
    expect(state.counters["dg.dives"]).toBe(1);
    expect(dgProgress(state.counters, state.flags, gen("p")[0]!).cleared).toBe(3);
    // 撃破は種別の図鑑に、行動ログは kind dungeon ＋ combat variant dungeon
    expect(state.counters["kill.species.wolf"]).toBe(2);
    const log = state.actionLog.filter((e) => e.day === state.time.day);
    expect(log.some((e) => e.kind === "dungeon")).toBe(true);
    expect(log.filter((e) => e.kind === "combat" && e.variant === "dungeon")).toHaveLength(2);
    // 潜りの結果イベント
    expect(events.find((e) => e.type === "dungeonEnded")).toMatchObject({
      id: "dg0",
      end: "retreat",
      rooms: 3,
      cleared: 3,
      total: 7,
      done: false,
    });
  });

  it("抜いた室数は潜りをまたいで累計され、全室数で蓋される", () => {
    let s = fresh();
    s = step(
      s,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 3, total: 5, kills: dives(1) },
      baseCfg(),
    ).state;
    // 2回目の潜り（続きから）：2+3=5 で全室数の蓋
    s = step(s, { type: "dungeon", id: "dg0", end: "light", rooms: 3, total: 5 }, baseCfg()).state;
    expect(s.counters[dgRoomsKey("dg0")]).toBe(5);
    expect(s.counters["dg.dives"]).toBe(2);
  });

  it("制覇は主の撃破が揃った潜りだけ：旗が立ち bossDefeated が届く", () => {
    const s0 = fresh();
    const cleared = step(
      s0,
      {
        type: "dungeon",
        id: "dg0",
        end: "cleared",
        rooms: 5,
        total: 5,
        kills: dives(4),
        boss: { enemyId: "golem", difficulty: 40 },
      },
      baseCfg(),
    );
    expect(cleared.state.flags[dgClearedKey("dg0")]).toBe(true);
    expect(cleared.events.find((e) => e.type === "dungeonEnded")).toMatchObject({
      end: "cleared",
      done: true,
    });
    expect(cleared.events.find((e) => e.type === "bossDefeated")).toMatchObject({
      dungeon: "dg0",
      enemyId: "golem",
      unique: false,
    });
    // ユニークでない制覇は世界のユニーク数に積まない
    expect(cleared.state.counters[dgUniqueTotalKey]).toBeUndefined();
    // 主を倒さない・室数の足りない「制覇」は閉じない
    const noBoss = step(
      s0,
      { type: "dungeon", id: "dg0", end: "cleared", rooms: 5, total: 5 },
      baseCfg(),
    );
    expect(noBoss.state.flags[dgClearedKey("dg0")]).toBeUndefined();
    expect(noBoss.events.find((e) => e.type === "dungeonEnded")).toMatchObject({ done: false });
  });

  it("ユニークの主は dg.unique に刻まれ世界の討伐数が1増える（受入条件）", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "dungeon",
        id: "dg1",
        end: "cleared",
        rooms: 4,
        total: 4,
        boss: { enemyId: "wyrm", difficulty: 60, unique: true },
      },
      baseCfg(),
    );
    expect(state.counters[dgUniqueKey("dg1")]).toBe(1);
    expect(state.counters[dgUniqueTotalKey]).toBe(1);
    expect(events.find((e) => e.type === "bossDefeated")).toMatchObject({
      dungeon: "dg1",
      unique: true,
    });
  });

  it("宝物の品と財貨が入り、罠の消耗は疲労に足される", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "dungeon",
        id: "dg0",
        end: "retreat",
        rooms: 2,
        total: 8,
        items: { "ore.copper": 3, herb: 1 },
        money: 45,
        trapFatigue: 9,
      },
      baseCfg(),
    );
    expect(state.life.items["ore.copper"]).toBe(3);
    expect(state.life.items["herb"]).toBe(1);
    expect(state.player.money).toBe(s0.player.money + 45);
    expect(state.player.fatigue).toBeCloseTo(
      s0.player.fatigue + 9 + 2 * baseCfg().body.fatiguePerAction["dungeon"]!,
      5,
    );
    expect(events.filter((e) => e.type === "itemGot")).toHaveLength(2);
    expect(events.some((e) => e.type === "moneyPaid" && e.amount === 45)).toBe(true);
  });

  it("迷宮内野営：dg.camp に日が刻まれ、翌日の潜りは行動を要さない", () => {
    const s0 = fresh();
    const cfg = baseCfg();
    // 野営して潜りを閉じる
    const camped = step(
      s0,
      { type: "dungeon", id: "dg0", end: "camp", rooms: 2, total: 8, kills: dives(1) },
      cfg,
    );
    expect(camped.state.counters[dgCampKey("dg0")]).toBe(s0.time.day);
    // 迷宮で眠る（camp）：宿代は取られず、slept には camp が立つ
    const slept = step(camped.state, { type: "sleep", camp: true }, cfg);
    expect(slept.state.time.day).toBe(s0.time.day + 1);
    expect(slept.events.find((e) => e.type === "slept")).toMatchObject({ camp: true });
    // 野営明けの潜りは行動を消費しない（dg.camp が昨日）
    const next = step(
      slept.state,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 1, total: 8 },
      cfg,
    );
    expect(next.state.time.day).toBe(s0.time.day + 1);
    expect(next.state.time.action).toBe(slept.state.time.action);
    expect(next.state.counters[dgRoomsKey("dg0")]).toBe(3);
    // 無償の潜りは1回だけ：野営の刻印は使い切りで消える
    expect(next.state.counters[dgCampKey("dg0")]).toBeUndefined();
  });

  it("存在しない迷宮 id には効かない（dungeonIds の閉域）", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      { type: "dungeon", id: "dgX", end: "retreat", rooms: 3, total: 5 },
      baseCfg(),
    );
    expect(state).toEqual(s0);
    expect(events.find((e) => e.type === "dungeonEnded")).toBeUndefined();
  });

  it("dungeons 設定が無い世界では何もしない", () => {
    const s0 = fresh();
    const cfg = baseCfg();
    delete cfg.dungeons;
    const { state } = step(
      s0,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 3, total: 5 },
      cfg,
    );
    expect(state).toEqual(s0);
  });

  it("行動が残っていないと潜れない（野営明けは無償）", () => {
    const s = fresh();
    const s0 = { ...s, time: { ...s.time, action: 4 } }; // 残り1行動＜diveCost2
    const cfg = baseCfg();
    const { state } = step(
      s0,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 1, total: 5 },
      cfg,
    );
    expect(state.counters[dgRoomsKey("dg0")]).toBeUndefined();
    // 野営明け（dg.camp が昨日）なら行動0でも潜れる
    const camped = {
      ...s0,
      counters: { ...s0.counters, [dgCampKey("dg0")]: s0.time.day - 1 },
    };
    const free = step(
      camped,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 1, total: 5 },
      cfg,
    );
    expect(free.state.counters[dgRoomsKey("dg0")]).toBe(1);
    expect(free.state.time.action).toBe(4);
  });

  it("死亡で終わる潜り：death.count と died、未定着経験が半減する", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "dungeon",
        id: "dg0",
        end: "died",
        rooms: 1,
        total: 8,
        kills: dives(1),
        loss: { enemyId: "golem", difficulty: 50 },
      },
      baseCfg(),
    );
    expect(state.counters["death.count"]).toBe(1);
    expect(events.some((e) => e.type === "died")).toBe(true);
    expect(events.find((e) => e.type === "dungeonEnded")).toMatchObject({
      end: "died",
      done: false,
    });
  });

  it("出来事の部屋の結末は散策と同じ語彙で畳まれる（X-30：品・金・旗印・祈り・経験）", () => {
    const s0 = fresh();
    const { state, events } = step(
      s0,
      {
        type: "dungeon",
        id: "dg0",
        end: "retreat",
        rooms: 2,
        total: 7,
        events: [
          { weight: 1, text: "清水が滲み出ている", fatigue: -10 },
          { weight: 1, text: "古い金貨を見つけた", money: 30, items: { herb: 2 } },
          { weight: 1, text: "名もなき墓に手を合わせた", pray: true, flag: "dg.event.tomb" },
        ],
      },
      baseCfg(),
    );
    // 結末の一文は strollOutcome の行として届く（行動ログと同じ道）
    const texts = events.filter((e) => e.type === "strollOutcome").map((e) => e.text);
    expect(texts).toEqual(["清水が滲み出ている", "古い金貨を見つけた", "名もなき墓に手を合わせた"]);
    // 品・金・旗印・祈りの刻印が畳まれる
    expect(state.life.items["herb"]).toBe(2);
    expect(state.player.money).toBe(s0.player.money + 30);
    expect(state.flags["dg.event.tomb"]).toBe(true);
    expect(state.life.prayedDay).toBe(state.time.day);
    // 疲労は負の増分で回復する（潜りの負荷から -10 される）
    const plain = step(
      s0,
      { type: "dungeon", id: "dg0", end: "retreat", rooms: 2, total: 7 },
      baseCfg(),
    ).state;
    expect(state.player.fatigue).toBe(plain.player.fatigue - 10);
  });
});
