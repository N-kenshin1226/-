import type { EnemyDef, EnemyMove } from "../combat/index.js";
import type { LifeOutcome } from "../life/index.js";
import { createRng, type Rng } from "../rng/index.js";

/**
 * 有限迷宮（G-03、docs/10_world_generation.md §6）。
 *
 * 深層（無限）とは別の「型から組み立てる有限ダンジョン」：
 * - 型（world.json の dungeonTypes：洞窟・坑道・地下墓所・古代遺跡・
 *   魔物の巣・塔・沈んだ神殿）から、階層・部屋・罠・宝・主を生成する
 * - 迷宮の中身は GameState に保存せず、世界シード（→生成）から毎回同じ形を
 *   引き直す。進行は深層と同じく counters/flags に刻む
 *   （`dg.rooms.<id>` 抜いた室数・`dg.cleared.<id>` 制覇・`dg.camp.<id>` 野営した日）
 * - 1回の潜りで抜き切れない深さにする：灯り（balance.dungeons.lightPerDive）が
 *   尽きたら引き返す。野営で居座ると次の日の潜りは行動を使わない
 * - 主の1体はユニークモンスター：世界に1体だけ、世界初の討伐記録の対象
 *
 * 罠の見破り・敵の強化・宝の中身はすべてここに閉じる。
 * 数値は balance.json の dungeons 節（DungeonConfig）から注入する。
 */

/** 罠の型（world.json の trapKinds） */
export interface WorldTrapKind {
  id: string;
  name: string;
  /** 見破りの難しさ（観察との差で回避率が動く） */
  difficulty: number;
  /** 踏んだときの疲労 */
  fatigue: number;
  /** 踏んだときの灯りロス */
  light: number;
  sprungText: string;
  avoidText: string;
}

/** 迷宮の型（world.json の dungeonTypes） */
export interface WorldDungeonType {
  id: string;
  name: string;
  danger: number;
  names: string[];
  desc: string;
  enemies: { id: string; weight: number }[];
  traps: { id: string; weight: number }[];
  treasure: { item: string; weight: number; n: [number, number] }[];
  bosses: { enemy: string; weight: number }[];
  bossTitles: string[];
  uniqueNames: string[];
  /**
   * 出来事の部屋の表（X-30、docs/10 §13「迷宮内の出来事」）。
   * 省略・空ならその型には出来事の部屋が出ない（戦闘・罠・宝物だけ）
   */
  events?: LifeOutcome[];
}

/** balance.dungeons（生成・潜り・罠の係数） */
export interface DungeonConfig {
  count: { min: number; max: number };
  typeMaxPerWorld: number;
  /** 配置抽選で遠い町が持つ重み（深い型ほど遠くへ寄る） */
  ringWeight: number;
  /** ユニークの主になる最低危険度 */
  uniqueBossMinDanger: number;
  floorsBase: number;
  floorsPerDanger: number;
  floorJitter: number;
  floors: { min: number; max: number };
  rooms: { min: number; max: number };
  roomWeights: { combat: number; trap: number; treasure: number; event?: number };
  treasureRolls: number;
  treasureMoneyBase: number;
  treasureMoneyPerDanger: number;
  bossTreasureFactor: number;
  bossTreasureMoneyBonus: number;
  enemyBaseFactor: number;
  enemyFloorFactor: number;
  enemyAgilityPerFloor: number;
  bossHpFactor: number;
  bossPowerFactor: number;
  bossChallengeFactor: number;
  bossAgilityBonus: number;
  uniqueHpFactor: number;
  uniquePowerFactor: number;
  uniqueChallengeFactor: number;
  uniqueAgilityBonus: number;
  lightPerDive: number;
  roomLightCost: number;
  diveCost: number;
  campQuality: number;
  trapAvoidBase: number;
  trapAvoidPerSkill: number;
}

/** 生成された部屋 */
export interface GenRoom {
  kind: "combat" | "trap" | "treasure" | "event";
  /** event の出来事（型の events 表の添字。生成時に決まり、その迷宮の顔になる） */
  eventIdx?: number;
  /** combat の敵（enemies.json の id） */
  enemyId?: string;
  /** trap の罠（trapKinds の id） */
  trapId?: string;
  /** treasure の中身（品 id → 個数の列）と財貨 */
  loot: { item: string; n: number }[];
  money: number;
}

export interface GenFloor {
  rooms: GenRoom[];
}

/** 生成された主（ボス） */
export interface GenBoss {
  enemyId: string;
  /** 称号（「《洞窟の主》」の冠） */
  title: string;
  /** 世界に1体のユニークモンスターか */
  unique: boolean;
  /** ユニークのときの名（「巌喰みゴロン」など） */
  name?: string;
}

/** 生成された迷宮 */
export interface GenDungeon {
  /** 場所 id（`dg<連番>`） */
  id: string;
  /** 置かれた町（gate から辿る先） */
  town: string;
  /** 型 id（cave / mine / …） */
  type: string;
  typeName: string;
  name: string;
  desc: string;
  danger: number;
  floors: GenFloor[];
  boss: GenBoss;
  /** 主の間の宝物（制覇時に得る） */
  bossLoot: { item: string; n: number }[];
  bossMoney: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 重みつき抽選（weight 省略時は 1。rng を1回だけ消費する） */
function pickWeighted<T>(rng: Rng, entries: readonly (T & { weight?: number })[]): T {
  const total = entries.reduce((s, e) => s + (e.weight ?? 1), 0);
  let roll = rng.next() * total;
  for (const e of entries) {
    roll -= e.weight ?? 1;
    if (roll < 0) return e;
  }
  return entries[entries.length - 1]!;
}

/**
 * その輪（町）で出せる迷宮の型：地域と同じ蓋
 * （型の danger <= safeDanger + 輪×ringDangerStep）
 */
function fitsRing(
  type: WorldDungeonType,
  ring: number,
  safeDanger: number,
  ringDangerStep: number,
) {
  return type.danger <= safeDanger + ring * ringDangerStep;
}

/**
 * 世界の迷宮を生成する（generateWorld から rng.fork("dungeons") で呼ぶ）。
 * - 個数は cfg.count、型は typeMaxPerWorld まで重複可
 * - 始まりの町（towns[0]）には必ず1つ置く（序盤から潜れる場所がある）
 * - 残りは輪の遠さを重みにした町へ配り、型はその輪で出せるものから引く
 * - すべての迷宮のうち1つだけ、主をユニークモンスターにする
 */
export function generateDungeons(
  rng: Rng,
  types: readonly WorldDungeonType[],
  towns: readonly { id: string; ring: number }[],
  cfg: DungeonConfig,
  safeDanger: number,
  ringDangerStep: number,
): GenDungeon[] {
  const n = rng.int(cfg.count.min, cfg.count.max);
  const usedNames = new Set<string>();
  const usedTypes = new Map<string, number>();
  const perTown = new Map<string, number>(towns.map((t) => [t.id, 0]));
  const dungeons: GenDungeon[] = [];

  /** その町の輪で出せる型から、上限内で1つ引く */
  const drawType = (ring: number): WorldDungeonType | undefined => {
    const fit = types.filter(
      (t) =>
        fitsRing(t, ring, safeDanger, ringDangerStep) &&
        (usedTypes.get(t.id) ?? 0) < cfg.typeMaxPerWorld,
    );
    return fit.length > 0 ? pickWeighted(rng, fit) : undefined;
  };

  /** 町を1つ引く（ringWeight で遠い町ほど重く、詰まり過ぎないよう/既配置数） */
  const drawTown = (type: WorldDungeonType): { id: string; ring: number } => {
    const fit = towns.filter((t) => fitsRing(type, t.ring, safeDanger, ringDangerStep));
    const pool = fit.length > 0 ? fit : towns;
    let total = 0;
    const weights = pool.map((t) => {
      const w = (1 + t.ring * cfg.ringWeight) / (1 + (perTown.get(t.id) ?? 0));
      total += w;
      return w;
    });
    let roll = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return pool[i]!;
    }
    return pool[pool.length - 1]!;
  };

  for (let i = 0; i < n; i++) {
    // 最初の1つは始まりの町に必置（輪0で出せる型から）
    let town: { id: string; ring: number };
    let type: WorldDungeonType | undefined;
    if (i === 0) {
      town = towns[0]!;
      type = drawType(town.ring) ?? types[0];
      if (type === undefined) continue;
    } else {
      // 型 → 町 の順：まず世界中で偏りなく型を引き、置ける町を引く
      const candidates = types.filter(
        (t) =>
          (usedTypes.get(t.id) ?? 0) < cfg.typeMaxPerWorld &&
          towns.some((twn) => fitsRing(t, twn.ring, safeDanger, ringDangerStep)),
      );
      type = candidates.length > 0 ? pickWeighted(rng, candidates) : undefined;
      if (type === undefined) continue;
      town = drawTown(type);
    }
    const dgnRng = rng.fork(`dg${i}`);
    // 名は世界中で重複しない（尽きたら通し番号）
    const avail = type.names.filter((nm) => !usedNames.has(nm));
    const name =
      avail.length > 0 ? avail[dgnRng.int(0, avail.length - 1)]! : `${type.name}${i + 1}`;
    usedNames.add(name);
    usedTypes.set(type.id, (usedTypes.get(type.id) ?? 0) + 1);
    perTown.set(town.id, (perTown.get(town.id) ?? 0) + 1);

    // 階層：型の危険度ほど深い。1回で抜き切れない量になるよう balance で調整
    const nFloors = clamp(
      Math.round(
        cfg.floorsBase +
          type.danger * cfg.floorsPerDanger +
          (dgnRng.next() * 2 - 1) * cfg.floorJitter,
      ),
      cfg.floors.min,
      cfg.floors.max,
    );
    const floors: GenFloor[] = [];
    for (let f = 0; f < nFloors; f++) {
      const nRooms = dgnRng.int(cfg.rooms.min, cfg.rooms.max);
      const rooms: GenRoom[] = [];
      for (let r = 0; r < nRooms; r++) {
        const kind = pickWeighted(dgnRng, [
          { v: "combat" as const, weight: cfg.roomWeights.combat },
          { v: "trap" as const, weight: cfg.roomWeights.trap },
          { v: "treasure" as const, weight: cfg.roomWeights.treasure },
          // 出来事の部屋（X-30）：型に表が無ければ重みは加えない
          ...(type.events !== undefined && type.events.length > 0
            ? [{ v: "event" as const, weight: cfg.roomWeights.event ?? 0 }]
            : []),
        ]).v;
        if (kind === "combat") {
          rooms.push({
            kind,
            enemyId: pickWeighted(dgnRng, type.enemies).id,
            loot: [],
            money: 0,
          });
        } else if (kind === "trap") {
          rooms.push({
            kind,
            trapId: pickWeighted(dgnRng, type.traps).id,
            loot: [],
            money: 0,
          });
        } else if (kind === "event") {
          // どの出来事が置かれるかも生成で決まる —— 迷宮の顔になる（表の重みで引く）
          const evIdx = pickWeighted(
            dgnRng,
            type.events!.map((e, i) => ({ v: i, weight: e.weight })),
          ).v;
          rooms.push({ kind, eventIdx: evIdx, loot: [], money: 0 });
        } else {
          const loot = new Map<string, number>();
          for (let k = 0; k < cfg.treasureRolls; k++) {
            const e = pickWeighted(dgnRng, type.treasure);
            const cnt = dgnRng.int(e.n[0], e.n[1]);
            loot.set(e.item, (loot.get(e.item) ?? 0) + cnt);
          }
          rooms.push({
            kind,
            loot: [...loot.entries()].map(([item, cnt]) => ({ item, n: cnt })),
            money: Math.round(
              (cfg.treasureMoneyBase + cfg.treasureMoneyPerDanger * type.danger) *
                (0.7 + dgnRng.next() * 0.6),
            ),
          });
        }
      }
      floors.push({ rooms });
    }

    // 主（ボス）：型の表から1体。ユニーク化は全生成後に1つだけ振る
    const boss: GenBoss = {
      enemyId: pickWeighted(dgnRng, type.bosses).enemy,
      title: pickWeighted(
        dgnRng,
        type.bossTitles.map((t) => ({ t })),
      ).t,
      unique: false,
    };
    const bossLoot = new Map<string, number>();
    for (let k = 0; k < Math.max(1, Math.round(cfg.treasureRolls * cfg.bossTreasureFactor)); k++) {
      const e = pickWeighted(dgnRng, type.treasure);
      bossLoot.set(e.item, (bossLoot.get(e.item) ?? 0) + dgnRng.int(e.n[0], e.n[1]));
    }
    const bossMoney = Math.round(
      (cfg.treasureMoneyBase + cfg.treasureMoneyPerDanger * type.danger) * cfg.bossTreasureFactor +
        cfg.bossTreasureMoneyBonus,
    );

    dungeons.push({
      id: `dg${i}`,
      town: town.id,
      type: type.id,
      typeName: type.name,
      name,
      desc: type.desc,
      danger: type.danger,
      floors,
      boss,
      bossLoot: [...bossLoot.entries()].map(([item, cnt]) => ({ item, n: cnt })),
      bossMoney,
    });
  }

  // ユニークモンスター：危険度が十分な迷宮から1つだけ（無ければ全件から）
  if (dungeons.length > 0) {
    const deep = dungeons.filter((d) => d.danger >= cfg.uniqueBossMinDanger);
    const pool = deep.length > 0 ? deep : dungeons;
    const picked = pickWeighted(
      rng,
      pool.map((d) => ({ d, weight: d.danger })),
    ).d;
    picked.boss.unique = true;
    const type = types.find((t) => t.id === picked.type);
    const name = type
      ? pickWeighted(
          rng,
          type.uniqueNames.map((u) => ({ u })),
        ).u
      : `《主》${picked.boss.enemyId}`;
    picked.boss.name = name;
  }

  return dungeons;
}

/** 主の間を含む全部屋数 */
export function totalRooms(d: GenDungeon): number {
  return d.floors.reduce((s, f) => s + f.rooms.length, 0) + 1;
}

/** 非ボス部屋数 */
export function floorRooms(d: GenDungeon): number {
  return totalRooms(d) - 1;
}

/** 何層目・層内何番目の部屋か（0始まりの通し番号から。通し番号==floorRooms なら主の間） */
export function roomAt(
  d: GenDungeon,
  index: number,
): { floor: GenFloor; floorIndex: number; indexInFloor: number; room: GenRoom } | null {
  let at = index;
  for (let f = 0; f < d.floors.length; f++) {
    const floor = d.floors[f]!;
    if (at < floor.rooms.length) {
      return { floor, floorIndex: f, indexInFloor: at, room: floor.rooms[at]! };
    }
    at -= floor.rooms.length;
  }
  return null;
}

/** 通し番号が主の間か（主の間は最後の1室） */
export function isBossRoom(d: GenDungeon, index: number): boolean {
  return index === floorRooms(d);
}

/**
 * 部屋の敵の強化版：層が深いほど HP・技威力・挑戦差に倍率、敏捷に加算。
 * 行動パターン（予兆の型）はそのまま。深層の scaleEnemy と同じ語彙で畳む
 */
export function scaleRoomEnemy<E extends EnemyDef>(
  enemy: E,
  floorIndex: number,
  cfg: Pick<DungeonConfig, "enemyBaseFactor" | "enemyFloorFactor" | "enemyAgilityPerFloor">,
): E {
  const f = cfg.enemyBaseFactor + cfg.enemyFloorFactor * floorIndex;
  const scaleMove = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.max(1, Math.round(m.power * f)),
  });
  return {
    ...enemy,
    hp: Math.max(1, Math.round(enemy.hp * f)),
    agility: Math.round(enemy.agility + cfg.enemyAgilityPerFloor * floorIndex),
    challenge: Math.max(0, Math.round(enemy.challenge * f)),
    attack: scaleMove(enemy.attack),
    moves: Object.fromEntries(Object.entries(enemy.moves).map(([k, m]) => [k, scaleMove(m)])),
  };
}

/**
 * 主の強化版：最奥層の強化に boss 係数を掛け合わせる。
 * ユニークモンスターはさらに unique 係数が乗る（世界に1体の重み）。
 * `uniqueVariant: true` は図鑑・個体抽選の扱いを「その1体」に固定する印
 */
export function bossEnemy<E extends EnemyDef & { uniqueVariant?: boolean }>(
  enemy: E,
  d: GenDungeon,
  cfg: Pick<
    DungeonConfig,
    | "enemyBaseFactor"
    | "enemyFloorFactor"
    | "enemyAgilityPerFloor"
    | "bossHpFactor"
    | "bossPowerFactor"
    | "bossChallengeFactor"
    | "bossAgilityBonus"
    | "uniqueHpFactor"
    | "uniquePowerFactor"
    | "uniqueChallengeFactor"
    | "uniqueAgilityBonus"
  >,
): E {
  const floorIndex = d.floors.length;
  const f = cfg.enemyBaseFactor + cfg.enemyFloorFactor * floorIndex;
  const hpF = f * cfg.bossHpFactor * (d.boss.unique ? cfg.uniqueHpFactor : 1);
  const powF = f * cfg.bossPowerFactor * (d.boss.unique ? cfg.uniquePowerFactor : 1);
  const chF = f * cfg.bossChallengeFactor * (d.boss.unique ? cfg.uniqueChallengeFactor : 1);
  const scaleMove = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.max(1, Math.round(m.power * powF)),
  });
  return {
    ...enemy,
    uniqueVariant: true,
    hp: Math.max(1, Math.round(enemy.hp * hpF)),
    agility: Math.round(
      enemy.agility +
        cfg.enemyAgilityPerFloor * floorIndex +
        cfg.bossAgilityBonus +
        (d.boss.unique ? cfg.uniqueAgilityBonus : 0),
    ),
    challenge: Math.max(0, Math.round(enemy.challenge * chF)),
    attack: scaleMove(enemy.attack),
    moves: Object.fromEntries(Object.entries(enemy.moves).map(([k, m]) => [k, scaleMove(m)])),
  };
}

/** 主の表示名（《称号》名。ユニークは生成名、そうでなければ敵の種名） */
export function bossName(d: GenDungeon, enemyName: string): string {
  return `《${d.boss.title}》${d.boss.unique ? (d.boss.name ?? enemyName) : enemyName}`;
}

/** 罠の見破り：観察（observation の技能値）と難しさから回避率を畳み、決定的に引く */
export function rollTrap(
  trap: WorldTrapKind,
  key: string,
  observation: number,
  cfg: Pick<DungeonConfig, "trapAvoidBase" | "trapAvoidPerSkill">,
): { sprung: boolean; fatigue: number; light: number; text: string } {
  const chance = clamp(
    cfg.trapAvoidBase + (observation - trap.difficulty) * cfg.trapAvoidPerSkill,
    0.05,
    0.95,
  );
  const sprung = createRng(`${key}:trap`).next() >= chance;
  return {
    sprung,
    fatigue: sprung ? trap.fatigue : 0,
    light: sprung ? trap.light : 0,
    text: sprung ? trap.sprungText : trap.avoidText,
  };
}

/* ── 進行の刻み方（GameState 形は変えず counters/flags に載せる。深層と同じやり方） ── */

/** 抜いた室数（0〜totalRooms。主の間は含む） */
export const dgRoomsKey = (id: string) => `dg.rooms.${id}`;
/** 制覇した印（flag） */
export const dgClearedKey = (id: string) => `dg.cleared.${id}`;
/** 迷宮で野営した日（次の日の潜りが行動を要さない） */
export const dgCampKey = (id: string) => `dg.camp.${id}`;
/** ユニークの主を討った印（counter。1なら世界初） */
export const dgUniqueKey = (id: string) => `dg.unique.${id}`;
/** 世界のユニーク討伐の合計 */
export const dgUniqueTotalKey = "dg.unique";

/**
 * 迷宮の出来事の旗（X-34）：迷宮ごとに名指しする
 * （同じ型の別の迷宮や次の生には漏れない。表の中の flag/link.flag は
 * 接頭辞なしで書き、解決するときにこの名指しに畳む）
 */
export const dgEventFlagKey = (dgId: string, flag: string) => `dg.event.${dgId}.${flag}`;

/**
 * 出来事の部屋の結末（X-30 拡張・X-34）：部屋の eventIdx で表から引き、
 * 続き（link）の旗が立っていれば続きの結末に差し替える。
 * 旗は表の中で受け渡せる（続きの結末が立てた旗が、別の項の続きを解く）。
 * 返す結末の flag は迷宮 id 付きに名指し済み —— 畳まれるとその迷宮だけに旗が立つ。
 * `flags` には世界の旗に加えて、同じ潜りで既に畳み込み待ちの結末が立てた
 * 旗（名指し済みのものをそのまま）を含めて渡す —— 連鎖は同じ潜りの中でも続く
 */
export function dungeonEventOutcome(
  dgId: string,
  events: readonly LifeOutcome[] | undefined,
  eventIdx: number | undefined,
  flags: Record<string, boolean>,
): LifeOutcome | undefined {
  if (events === undefined || eventIdx === undefined) return undefined;
  let o = events[eventIdx];
  if (o === undefined) return undefined;
  const seen = new Set<string>();
  while (o.link !== undefined && !seen.has(o.link.flag)) {
    seen.add(o.link.flag);
    if (flags[dgEventFlagKey(dgId, o.link.flag)] !== true) break;
    o = o.link.outcome;
  }
  return o.flag === undefined ? o : { ...o, flag: dgEventFlagKey(dgId, o.flag) };
}

/** 進行（抜いた室数・全室数・制覇。counters/flags から導出） */
export function dgProgress(
  counters: Record<string, number>,
  flags: Record<string, boolean>,
  d: GenDungeon,
) {
  const cleared = counters[dgRoomsKey(d.id)] ?? 0;
  const total = totalRooms(d);
  return {
    cleared,
    total,
    done: flags[dgClearedKey(d.id)] === true || cleared >= total,
  };
}
