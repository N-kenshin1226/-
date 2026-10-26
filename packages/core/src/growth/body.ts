import type { GameState, StatId } from "../state/types.js";
import type { WakeLine } from "./consolidate.js";

/**
 * 身体の成長と疲労（docs/02_growth_system.md §5、§2 の F 項）。
 *
 * - 疲労は 0〜100 の1本。行動ごとに増え、睡眠の質に比例して回復する
 *   （ゲージは疲労だけ。基礎能力は「負荷」という未定着の数値で管理する）
 * - 基礎能力はスキルと同じ仕組み：行動で「負荷」が溜まり、睡眠時に定着する
 * - 過負荷（1日の負荷合計が閾値超過）が streakDays 連続するとオーバーワーク。
 *   定着量が ×overworkConsolidateFactor になり、休養日で解除される
 *
 * 係数はすべて balance.json の body 節（BodyConfig）。
 */

export interface BodyConfig {
  /** 行動種別ごとの疲労コスト（未定義は fatigueDefaultPerAction） */
  fatiguePerAction: Record<string, number>;
  fatigueDefaultPerAction: number;
  /** 睡眠時の疲労回復量の基礎値（× 睡眠の質） */
  fatigueRecover: number;
  /** 行動種別ごとの基礎能力への負荷 */
  statLoadPerAction: Record<string, Partial<Record<StatId, number>>>;
  /** 負荷1 → 基礎能力の上昇量（× 睡眠の質） */
  statGainPerLoad: number;
  /** 1日の負荷合計がこれを「超える」と過負荷の日 */
  overloadThreshold: number;
  /** 過負荷の日がこの回数連続するとオーバーワーク */
  overworkStreakDays: number;
  /** オーバーワーク中の定着量の倍率 */
  overworkConsolidateFactor: number;
  /** 家で休む（rest コマンド）ときの睡眠の質 */
  restQuality: number;
  /** 休養日に全スキルの素質が回復する量（上限 potentialMax） */
  restPotentialRecover: number;
  potentialMax: number;
}

/** 行動1回分の疲労と負荷を積む（gain 計算の後に呼ぶ） */
export function applyActionLoad(state: GameState, kind: string, cfg: BodyConfig): GameState {
  const fatigue = Math.min(
    100,
    state.player.fatigue + (cfg.fatiguePerAction[kind] ?? cfg.fatigueDefaultPerAction),
  );

  const loads = cfg.statLoadPerAction[kind];
  if (!loads) {
    return { ...state, player: { ...state.player, fatigue } };
  }
  const load = { ...state.player.load };
  let added = 0;
  for (const [id, v] of Object.entries(loads)) {
    const stat = id as StatId;
    load[stat] += v ?? 0;
    added += v ?? 0;
  }
  return {
    ...state,
    player: { ...state.player, fatigue, load },
    today: { ...state.today, loads: state.today.loads + added },
  };
}

/** 睡眠の直前に呼ぶ：オーバーワークの連続カウントを更新する */
export function updateOverwork(
  state: GameState,
  cfg: BodyConfig,
  restDay: boolean,
): { overwork: GameState["player"]["overwork"]; becameOverwork: boolean } {
  if (restDay) {
    // 休養日で解除（連続カウントもリセット）
    return { overwork: { streakDays: 0, active: false }, becameOverwork: false };
  }
  const streakDays =
    state.today.loads > cfg.overloadThreshold ? state.player.overwork.streakDays + 1 : 0;
  const active =
    state.player.overwork.active || streakDays >= cfg.overworkStreakDays ? true : false;
  return {
    overwork: { streakDays, active },
    becameOverwork: active && !state.player.overwork.active,
  };
}

export interface BodyNightResult {
  state: GameState;
  /** 基礎能力の定着行（起床ログに混ぜる） */
  lines: WakeLine[];
}

/**
 * 睡眠時の身体側の定着：負荷 → 基礎能力、疲労回復、
 * 休養日なら全スキルの素質を回復（02 §6）。負荷プールは翌日に持ち越さない。
 */
export function consolidateBody(
  state: GameState,
  quality: number,
  cfg: BodyConfig,
  opts: { restDay: boolean; capFactor: number },
): BodyNightResult {
  const stats = { ...state.player.stats };
  const lines: WakeLine[] = [];
  for (const [id, load] of Object.entries(state.player.load)) {
    if (load <= 0) continue;
    const stat = id as StatId;
    const delta = load * cfg.statGainPerLoad * quality * opts.capFactor;
    const from = stats[stat];
    stats[stat] = from + delta;
    lines.push({ kind: "stat", id, from, to: stats[stat], delta });
  }

  // 疲労回復は睡眠の質に比例
  const fatigue = Math.max(0, state.player.fatigue - cfg.fatigueRecover * quality);

  // 休養日は全スキルの素質が少し回復する
  let skills = state.player.skills;
  if (opts.restDay && cfg.restPotentialRecover > 0) {
    skills = Object.fromEntries(
      Object.entries(skills).map(([id, s]) => [
        id,
        {
          ...s,
          // 回復上限はそのスキルの初期値（potentialCap）。念のためグローバル上限でも止める
          potential: Math.min(
            s.potentialCap,
            cfg.potentialMax,
            s.potential + cfg.restPotentialRecover,
          ),
        },
      ]),
    );
  }

  const load = Object.fromEntries(
    Object.keys(state.player.load).map((id) => [id, 0]),
  ) as GameState["player"]["load"];

  return {
    state: {
      ...state,
      player: { ...state.player, stats, skills, fatigue, load },
      today: { ...state.today, loads: 0 },
    },
    lines,
  };
}
