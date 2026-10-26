import type { EnemyDef, EnemyMove } from "../combat/index.js";
import { createRng } from "../rng/index.js";

/**
 * 無限深層ダンジョン（docs/06_endgame.md §3B、T-43）。
 *
 * Diablo 3 の Greater Rift を参考にした「時間制限＋自己ベスト」のやり込み：
 * - ランは層（floor）を下る連戦。各層の敵はシードから決定論的に選ばれ、
 *   層に応じた強化倍率（HP・技威力・挑戦差）が乗る
 * - 制限は「潜行リソース」（灯り＝ラン全体で使えるプレイヤー行動数）。
 *   灯りが尽きる・戦闘で逃げる・死ぬ・層の合間に引き返す、のどれかでラン終了
 * - ランの状態（AbyssRun）は GameState に入れない（セーブ互換を変えない）。
 *   結果は step の abyss コマンドが counters（abyss.best 等）に記録する
 *
 * 敵の選出・強化はここに閉じ、行動パターンはそのまま（予兆の学習が効く）。
 * 数値はすべて balance.json の abyss 節（AbyssConfig）から注入する。
 */

export interface AbyssConfig {
  /** 1層目の強化倍率（HP・技威力・挑戦差に乗る） */
  baseFactor: number;
  /** 層ごとの倍率成長。floor 層の倍率 = baseFactor + growthPerFloor × (floor − 1) */
  growthPerFloor: number;
  /** 敵の敏捷の層ごとの加算（逃走の抵抗） */
  agilityPerFloor: number;
  /** 潜行リソース（灯り）：ラン全体で使えるプレイヤー行動数 */
  maxTurns: number;
  /**
   * 層の敵プールのしきい値：挑戦差が poolBase + poolGrowthPerFloor × (floor − 1)
   * 以下の敵だけが候補になる（浅い層に最強格は出ない）。該当なしなら全件から選ぶ
   */
  poolBase: number;
  poolGrowthPerFloor: number;
}

/** ランの終わり方 */
export type AbyssEnd = "fled" | "light" | "retreat" | "died";

/** クリアした層の記録（step の abyss コマンドにそのまま渡せる形） */
export interface AbyssKill {
  enemyId: string;
  /** 強化後の挑戦差（gain の挑戦差に使う） */
  difficulty: number;
}

export interface AbyssRun {
  /** ラン識別シード（abyssRunSeed の出力）。層ごとの敵抽選・逃走乱数の元 */
  seed: string;
  /** 現在の層（1始まり。層をクリアすると +1） */
  floor: number;
  /** 残りの灯り（プレイヤー行動の残数） */
  light: number;
  /** クリアした層の記録（倒した順） */
  kills: AbyssKill[];
  done: boolean;
  /** 終わり方（done のとき確定） */
  end: AbyssEnd | null;
}

/**
 * ランのシード：世界シード × 潜行回数から派生する。
 * 同じ世界の同じ回目のランは同じ敵列になり、潜行ごとに列は変わる。
 * 環境変数・実時間には依存しない（決定論）
 */
export function abyssRunSeed(worldSeed: string, runIndex: number): string {
  return `${worldSeed}:abyss:${runIndex}`;
}

/** ランを始める（1層目・灯り満タン） */
export function startRun(seed: string, cfg: AbyssConfig): AbyssRun {
  return { seed, floor: 1, light: cfg.maxTurns, kills: [], done: false, end: null };
}

/** 層の強化倍率 */
export function floorFactor(floor: number, cfg: AbyssConfig): number {
  return cfg.baseFactor + cfg.growthPerFloor * (floor - 1);
}

/** その層に出うる敵のプール（挑戦差しきい値以下。空なら全件） */
export function floorPool<E extends { challenge: number }>(
  floor: number,
  enemies: readonly E[],
  cfg: AbyssConfig,
): readonly E[] {
  const cap = cfg.poolBase + cfg.poolGrowthPerFloor * (floor - 1);
  const pool = enemies.filter((e) => e.challenge <= cap);
  return pool.length > 0 ? pool : enemies;
}

/**
 * 敵の深層強化版を作る：HP・攻撃・大技の威力・挑戦差に倍率、敏捷に層ごとの加算。
 * 行動パターン（予兆の型）はそのまま —— 学習した型が深層でも通用する。
 * `area` など EnemyDef に無いフィールドはそのまま残る（EnemyJson を保つ）
 */
export function scaleEnemy<E extends EnemyDef>(enemy: E, floor: number, cfg: AbyssConfig): E {
  const f = floorFactor(floor, cfg);
  const scaleMove = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.max(1, Math.round(m.power * f)),
  });
  return {
    ...enemy,
    hp: Math.max(1, Math.round(enemy.hp * f)),
    agility: Math.round(enemy.agility + cfg.agilityPerFloor * (floor - 1)),
    challenge: Math.max(0, Math.round(enemy.challenge * f)),
    attack: scaleMove(enemy.attack),
    moves: Object.fromEntries(Object.entries(enemy.moves).map(([k, m]) => [k, scaleMove(m)])),
  };
}

/**
 * その層に出る敵（強化済み）。runSeed × floor で決定論的にプールから抽選する
 * —— 同じシードのランは同じ敵列になる（受け入れ基準：同シードで同じ敵列）
 */
export function floorEnemy<E extends EnemyDef>(
  runSeed: string,
  floor: number,
  enemies: readonly E[],
  cfg: AbyssConfig,
): E {
  const pool = floorPool(floor, enemies, cfg);
  const rng = createRng(`${runSeed}:f${floor}`);
  const base = pool[rng.int(0, pool.length - 1)]!;
  return scaleEnemy(base, floor, cfg);
}

/** 層をクリアした：撃破を刻んで次の層へ進む */
export function killFloor(run: AbyssRun, kill: AbyssKill): AbyssRun {
  return { ...run, floor: run.floor + 1, kills: [...run.kills, kill] };
}

/**
 * 灯りを1消費する（プレイヤーの1行動ごとに呼ぶ）。
 * 尽きたらラン終了（"light"）。撃破と同時に尽きても撃破は刻まれる
 */
export function spendLight(run: AbyssRun): AbyssRun {
  if (run.done) return run;
  const light = run.light - 1;
  return light <= 0 ? { ...run, light: 0, done: true, end: "light" } : { ...run, light };
}

/** 逃走・途中離脱・死亡でランを閉じる */
export function endRun(run: AbyssRun, end: AbyssEnd): AbyssRun {
  return { ...run, done: true, end };
}
