// @trace/core — 純粋なゲームロジック（DOM・ブラウザAPI・React 非依存）
// Math.random / Date.now / new Date は禁止（rng/, time/ を使う）。eslint.config.mjs 参照。
export { createRng, restoreRng } from "./rng/index.js";
export type { Rng, RngState } from "./rng/index.js";
export { advance, canAct, describe, sleep } from "./time/index.js";
export type { GameTime, MoonPhase, TimeConfig, TimeDescription, TimeOfDay } from "./time/index.js";
export {
  baseGain,
  challenge,
  computeGain,
  diminishing,
  fatigueFactor,
  novelty,
  recentRepeats,
} from "./growth/gain.js";
export type { GainConfig, GainResult, GainTerms } from "./growth/gain.js";
export { consolidateSleep, sleepQuality, statLine } from "./growth/consolidate.js";
export type {
  ConsolidateResult,
  InnRank,
  SleepConfig,
  WakeLine,
  WakeReport,
} from "./growth/consolidate.js";
export { step } from "./step.js";
export type { Command, StepConfig, StepResult } from "./step.js";
export { newGame } from "./state/newGame.js";
export type { NewGameConfig } from "./state/newGame.js";
export type {
  ActionLogEntry,
  GameState,
  PlayerState,
  SkillId,
  SkillState,
  StatId,
} from "./state/types.js";
export { subscribers } from "./events/index.js";
export type { ActionEvent, Subscriber } from "./events/index.js";
export { deserialize, migrations, SAVE_VERSION, serialize } from "./save/index.js";
