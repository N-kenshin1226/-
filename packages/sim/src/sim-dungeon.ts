import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balance, enemies, skills, world as worldFile, type EnemyJson } from "@trace/content";
import {
  bossEnemy,
  dgCampKey,
  dgClearedKey,
  dgRoomsKey,
  dgUniqueKey,
  dgUniqueTotalKey,
  generateWorld,
  isBossRoom,
  newGame,
  roomAt,
  rollTrap,
  scaleRoomEnemy,
  step,
  totalRooms,
  WORLD_RECIPE,
  type Command,
  type GameState,
  type GenDungeon,
} from "@trace/core";
import { stepConfig } from "./config.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:dungeon — 有限迷宮（G-03、docs/10 §6）の受入CIゲート。
 * 同じ世界シード群に生成された迷宮を「必ず勝つボット」で潜り、
 * 次を採点する：
 *   1. 全7種の迷宮が最後の1室（主の間）まで制覇できる
 *   2. ユニークモンスターは世界に1体だけ（生成・討伐記録どちらでも）
 *   3. ほとんどの迷宮は1回の潜り（灯り）では抜き切れない —— 野営・
 *      引き上げの判断が意味を持つ深さ
 *   4. 生成は決定的（同じシードなら同じ迷宮群）
 */

interface Fail {
  metric: string;
  detail: string;
}

interface DiveLog {
  dives: number;
  days: number;
  cleared: boolean;
}

const enemyById = new Map<string, EnemyJson>(enemies.enemies.map((e) => [e.id, e]));
const trapById = new Map((worldFile.trapKinds ?? []).map((t) => [t.id, t]));
const enemyChallenge = Object.fromEntries(enemies.enemies.map((e) => [e.id, e.challenge]));

/** 1回の潜りを回す（web の DungeonScreen と同じ手順：灯りを払いながら部屋を抜く） */
function runDive(state: GameState, d: GenDungeon): { command: Command; end: "light" | "cleared" } {
  const cfg = balance.dungeons;
  let light = cfg.lightPerDive;
  let rooms = 0;
  const kills: { enemyId: string; difficulty: number }[] = [];
  const items: Record<string, number> = {};
  let money = 0;
  let trapFatigue = 0;
  let boss: { enemyId: string; difficulty: number; unique?: boolean } | undefined;
  let end: "light" | "cleared" = "light";
  const obs = state.player.skills["observation"]?.value ?? 0;

  let i = state.counters[dgRoomsKey(d.id)] ?? 0;
  while (true) {
    if (isBossRoom(d, i)) {
      // 主の間：必ず勝つボット。制覇の潜りとして閉じる
      const base = enemyById.get(d.boss.enemyId);
      if (base === undefined) break;
      const b = bossEnemy(base, d, cfg);
      boss = { enemyId: base.id, difficulty: b.challenge };
      if (d.boss.unique) boss.unique = true;
      for (const l of d.bossLoot) items[l.item] = (items[l.item] ?? 0) + l.n;
      money += d.bossMoney;
      rooms++;
      end = "cleared";
      break;
    }
    const at = roomAt(d, i);
    if (at === null) break;
    if (at.room.kind === "combat") {
      const base = enemyById.get(at.room.enemyId!);
      if (base !== undefined) {
        const e = scaleRoomEnemy(base, at.floorIndex, cfg);
        kills.push({ enemyId: base.id, difficulty: e.challenge });
      }
    } else if (at.room.kind === "trap") {
      const trap = trapById.get(at.room.trapId!);
      if (trap !== undefined) {
        const rolled = rollTrap(trap, `${state.seed}:${d.id}:${i}:d${state.time.day}`, obs, cfg);
        trapFatigue += rolled.fatigue;
        light -= rolled.light;
      }
    } else {
      for (const l of at.room.loot) items[l.item] = (items[l.item] ?? 0) + l.n;
      money += at.room.money;
    }
    rooms++;
    light -= cfg.roomLightCost;
    i++;
    if (light <= 0) break;
  }

  return {
    end,
    command: {
      type: "dungeon",
      id: d.id,
      end,
      rooms,
      total: totalRooms(d),
      ...(kills.length > 0 ? { kills } : {}),
      ...(boss !== undefined ? { boss } : {}),
      ...(Object.keys(items).length > 0 ? { items } : {}),
      ...(money > 0 ? { money } : {}),
      ...(trapFatigue > 0 ? { trapFatigue } : {}),
    },
  };
}

/** 迷宮を制覇するまで潜り続ける（勝てる前提の機械的な踏破検証） */
function clearDungeon(
  state: GameState,
  d: GenDungeon,
  cfg: ReturnType<typeof stepConfig>,
): { state: GameState; log: DiveLog; bossSeen: boolean } {
  let dives = 0;
  let days = 0;
  let bossSeen = false;
  let guard = 0;
  while (
    state.flags[dgClearedKey(d.id)] !== true &&
    (state.counters[dgRoomsKey(d.id)] ?? 0) < totalRooms(d) &&
    guard++ < 200
  ) {
    // 潜りの行動（diveCost）が払えなければ休んで翌日へ（野営明けは無償だが
    // シムでは町に戻る経路を取る —— 野営の有無で抜き切れる室数は変わらない）
    const campDay = state.counters[dgCampKey(d.id)];
    const camped = campDay !== undefined && campDay === state.time.day - 1;
    if (!camped && state.time.action + balance.dungeons.diveCost > cfg.time.actionsPerDay) {
      state = step(state, { type: "rest" }, cfg).state;
      days++;
      continue;
    }
    const { command, end } = runDive(state, d);
    const res = step(state, command, cfg);
    bossSeen = bossSeen || res.events.some((e) => e.type === "bossDefeated");
    const ended = res.events.find((e) => e.type === "dungeonEnded");
    if (ended === undefined) {
      // 潜りが適用されなかった（行動不足など）→ 休んでリトライ
      state = step(state, { type: "rest" }, cfg).state;
      days++;
      continue;
    }
    state = res.state;
    dives++;
    if (end === "cleared") break;
  }
  return {
    state,
    bossSeen,
    log: { dives, days, cleared: state.flags[dgClearedKey(d.id)] === true },
  };
}

export function runDungeon(): number {
  const t = thresholds.dungeon;
  const fails: Fail[] = [];
  const startedAt = Date.now();
  const skillIds = skills.skills.map((s) => s.id);
  const worldCfg = { ...balance.world, dungeons: balance.dungeons };

  const ok = (metric: string, detail: string, pass: boolean) => {
    if (!pass) fails.push({ metric, detail });
    console.log(`  ${pass ? "✓" : "✗"} ${metric}: ${detail}`);
  };

  console.log(`== sim:dungeon (${t.seeds}世界、必ず勝つボットでの踏破検証) ==`);

  const clearedTypes = new Set<string>();
  const bossChallengeByType = new Map<string, { min: number; max: number }>();
  let worlds = 0;
  let dungeons = 0;
  let clearedCount = 0;
  let singleDiveClears = 0;
  let divesTotal = 0;
  let uniqueWorldsOk = 0;
  const typeReport = new Map<string, number>();

  for (let wi = 0; wi < t.seeds; wi++) {
    const seed = `dg:w${wi}`;
    const world = generateWorld(seed, worldFile, worldCfg, enemyChallenge);
    worlds++;
    // 生成の決定性：同じシードは同じ迷宮群を出す
    const again = generateWorld(seed, worldFile, worldCfg, enemyChallenge);
    if (JSON.stringify(world.dungeons) !== JSON.stringify(again.dungeons)) {
      fails.push({ metric: "決定性", detail: `${seed} の迷宮が再生成で変わる` });
    }

    let state = newGame(seed, "sim", {
      skillIds,
      initialPotential: 100,
      initialStatValue: 10,
      world: { kind: "gen", recipe: WORLD_RECIPE },
      initialTown: world.startTown,
    });
    const cfg = { ...stepConfig(), dungeonIds: world.dungeons.map((d) => d.id) };

    // 生成：個数5〜9＋ユニーク1体（受入条件）
    const uniques = world.dungeons.filter((d) => d.boss.unique);
    ok(
      `生成(${seed})`,
      `迷宮 ${world.dungeons.length}個・ユニークの主 ${uniques.length}体（基準 個数${t.count.min}〜${t.count.max}・ユニーク1）`,
      world.dungeons.length >= t.count.min &&
        world.dungeons.length <= t.count.max &&
        uniques.length === 1,
    );

    for (const d of world.dungeons) {
      dungeons++;
      const { state: after, bossSeen, log } = clearDungeon(state, d, cfg);
      state = after;
      clearedTypes.add(d.type);
      typeReport.set(d.type, (typeReport.get(d.type) ?? 0) + 1);
      const base = enemyById.get(d.boss.enemyId);
      if (base !== undefined) {
        const ch = bossEnemy(base, d, balance.dungeons).challenge;
        const cur = bossChallengeByType.get(d.type) ?? { min: ch, max: ch };
        cur.min = Math.min(cur.min, ch);
        cur.max = Math.max(cur.max, ch);
        bossChallengeByType.set(d.type, cur);
      }
      if (log.cleared) clearedCount++;
      if (log.dives <= 1) singleDiveClears++;
      divesTotal += log.dives;
      if (!log.cleared) {
        fails.push({
          metric: "制覇できる",
          detail: `${seed} の ${d.name}（${d.typeName}）が制覇できなかった`,
        });
      } else if (!bossSeen) {
        fails.push({
          metric: "主の記録",
          detail: `${seed} の ${d.name} で bossDefeated が出なかった`,
        });
      }
    }

    // ユニークの討伐記録：全部制覇した世界で dg.unique はちょうど1
    const uniqueTotal = state.counters[dgUniqueTotalKey] ?? 0;
    const uniqueFlags = uniques.filter((d) => (state.counters[dgUniqueKey(d.id)] ?? 0) > 0);
    if (uniqueTotal === 1 && uniqueFlags.length === 1) uniqueWorldsOk++;
  }

  // ── 指標の集計 ──
  console.log("  ── 型ごとの主の挑戦差（min〜max、出た個数） ──");
  for (const type of worldFile.dungeonTypes ?? []) {
    const b = bossChallengeByType.get(type.id);
    if (b === undefined) continue;
    console.log(
      `    ${type.name.padEnd(8)}（危険度${type.danger}）: ${b.min}〜${b.max} / ${typeReport.get(type.id) ?? 0}個`,
    );
  }

  ok(
    "全7種の迷宮を制覇できる",
    `${clearedTypes.size}/7 種（制覇した迷宮 ${clearedCount}/${dungeons}）`,
    clearedTypes.size >= (worldFile.dungeonTypes ?? []).length && clearedCount === dungeons,
  );
  ok(
    "ユニークモンスターは世界に1体（討伐記録）",
    `${uniqueWorldsOk}/${worlds} 世界で dg.unique=1`,
    uniqueWorldsOk === worlds,
  );
  const singleRate = dungeons > 0 ? singleDiveClears / dungeons : 1;
  ok(
    "1回の潜りでは抜き切れない深さ",
    `1潜り制覇 ${singleDiveClears}/${dungeons} = ${(singleRate * 100).toFixed(0)}% （基準 ≤${t.singleDiveMaxRate * 100}%。平均 ${(divesTotal / Math.max(1, dungeons)).toFixed(1)}潜り）`,
    singleRate <= t.singleDiveMaxRate,
  );

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "dungeon.json"),
    JSON.stringify(
      {
        seeds: t.seeds,
        worlds,
        dungeons,
        clearedCount,
        clearedTypes: [...clearedTypes],
        singleDiveClears,
        uniqueWorldsOk,
      },
      null,
      2,
    ),
  );
  console.log(`  詳細: packages/sim/out/dungeon.json`);
  console.log(`  実行時間: ${((Date.now() - startedAt) / 1000).toFixed(1)}秒`);

  if (fails.length) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
