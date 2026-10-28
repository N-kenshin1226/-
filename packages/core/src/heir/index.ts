import type { Legacy } from "../legacy/index.js";
import { newGame, type NewGameConfig } from "../state/newGame.js";
import type { GameState } from "../state/types.js";

/**
 * 子・弟子への継承延長（docs/06_endgame.md §1、T-48）。
 * 「世界を変えずに次代を継ぐ」：同じ世界シードで新キャラを始める、転生（T-40）とは
 * 別系統の継ぎ方。legacy（T-39。新しい世界への3項目継承）より弱い引継ぎで、
 * 素質補正の小さい版だけを渡す（記憶称号・遺物は渡さない）。
 *
 * 同じ世界なので年代記には追記しない（recordLife は呼ばない）—— 前代の記録は
 * その場で表示する伝記が担う。世代の刻印は counters/flags に載せるため、
 * GameState の形は変えない（セーブバージョン据置、D-38）。
 */

/** 次代の立ち位置：師匠に弟子入りした歴があれば弟子、なければ子（D-38） */
export type HeirKind = "child" | "disciple";

/** balance.json の heir 節に対応する設定（legacy より小さい係数） */
export interface HeirConfig {
  /** 前代の peak → 次代素質% の変換係数（legacy.potentialFactor より小さい値） */
  potentialFactor: number;
  /** スキルごとの素質上乗せ上限（%） */
  potentialMax: number;
}

/**
 * 次代の立ち位置を決める：師匠に弟子入りした歴があれば弟子、なければ子。
 * 「弟子入り歴」は弟子入り中（state.mentor）か、師匠の稽古を受けたことがあるか
 * （counters["mentor.session.<id>"]。T-27 の購読者が数える）で判定する
 */
export function heirKindOf(state: GameState): HeirKind {
  if (state.mentor !== null) return "disciple";
  return Object.entries(state.counters).some(
    ([key, n]) => key.startsWith("mentor.session.") && n > 0,
  )
    ? "disciple"
    : "child";
}

/**
 * 次代への弱い引継ぎ：素質補正の小さい版だけ（legacy の変換式に弱い係数を当てはめたもの。
 * 記憶称号・遺物は渡さない）。返すのは newGame がそのまま読める Legacy 形
 */
export function heirLegacyOf(state: GameState, cfg: HeirConfig): Legacy {
  const potentialBonus: Record<string, number> = {};
  for (const [id, s] of Object.entries(state.player.skills)) {
    const bonus = Math.min(cfg.potentialMax, Math.floor(s.peak * cfg.potentialFactor));
    if (bonus > 0) potentialBonus[id] = bonus;
  }
  return { potentialBonus, rememberedTitles: [], artifact: null };
}

/**
 * この生が何代目か（初代＝1、初めて継いだ次代＝2）。
 * counters["heir.count"] は「この世界でこれまでに起きた継承の回数」を数える
 */
export function heirGenerationOf(state: GameState): number {
  return (state.counters["heir.count"] ?? 0) + 1;
}

/**
 * 同じ世界で次代を継ぐ：prev と同じ seed の新しい GameState を作る。
 * newGame は seed から決定論的に状態を作るので、同じ seed・同じ cfg なら
 * 何度継いでも同じ生が生まれる（日替わりの街の出来事など世界の決定事項も同じ）。
 *
 * cfg（NewGameConfig）側の legacy は無視して heirLegacyOf を差し込む。
 * 世界の傾向は「同じ世界」なので cfg.tendency に prev.tendency を渡すのは
 * 呼び出し側の役目（誓約は生ごとの選択。D-38）。
 *
 * 世代の刻印：counters["heir.count"] を1増やし、flags["heir.<kind>"] に
 * この生の立ち位置（子か弟子か）を刻む
 */
export function succeedLife(
  prev: GameState,
  name: string,
  cfg: NewGameConfig,
  heirCfg: HeirConfig,
): { state: GameState; kind: HeirKind; legacy: Legacy } {
  const kind = heirKindOf(prev);
  const legacy = heirLegacyOf(prev, heirCfg);
  // 世界の危機は生ではなく世界のもの（W-01）：次代では進行をリセットせず継ぐ。
  // 地図も同じ世界のもの（G-01）：同じ seed から同じ地方が出るので出所と
  // 基点の町だけを継ぐ（呼び出し側が cfg で上書きした場合はそれに従う）
  const next = newGame(prev.seed, name, {
    ...cfg,
    legacy,
    carryoverCrisis: prev.crisis,
    world: cfg.world ?? prev.world,
    initialTown: cfg.initialTown ?? prev.life.town,
  });
  return {
    kind,
    legacy,
    state: {
      ...next,
      counters: { ...next.counters, "heir.count": (prev.counters["heir.count"] ?? 0) + 1 },
      flags: { ...next.flags, [`heir.${kind}`]: true },
    },
  };
}
