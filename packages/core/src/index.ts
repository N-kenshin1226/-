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
export { applyActionLoad, consolidateBody, updateOverwork } from "./growth/body.js";
export type { BodyConfig, BodyNightResult } from "./growth/body.js";
export { rollTailwind, windFor } from "./growth/tailwind.js";
export type { RolledWind, TailwindConfig, TailwindDef, WindDirection } from "./growth/tailwind.js";
export { step } from "./step.js";
export type { Command, StepConfig, StepResult } from "./step.js";
export { recordWork, matchesWork } from "./ledger/index.js";
export type { LedgerConfig, RecordedWork } from "./ledger/index.js";
export { newGame } from "./state/newGame.js";
export type { NewGameConfig } from "./state/newGame.js";
export type {
  ActionLogEntry,
  GameState,
  PlayerState,
  SkillId,
  SkillState,
  StatId,
  TodayState,
  Work,
} from "./state/types.js";
export { subscribers } from "./events/index.js";
export type { ActionEvent, Subscriber } from "./events/index.js";
export { deserialize, migrations, SAVE_VERSION, serialize } from "./save/index.js";
export { evaluate } from "./conditions/index.js";
export type { Compare, Cond } from "./conditions/index.js";
export { timingEngine, boardEngine, dealEngine } from "./minigame/index.js";
export { smithingGame, simpleJudgmentQuality } from "./minigame/index.js";
export type { SmithingConfig, SmithingResult } from "./minigame/index.js";
export { miningGame } from "./minigame/index.js";
export type { MiningConfig, MiningResult } from "./minigame/index.js";
export { negotiationGame } from "./minigame/index.js";
export type { NegotiationConfig, NegotiationResult, NegotiationTopic } from "./minigame/index.js";
export { performanceGame } from "./minigame/index.js";
export type { PerformanceConfig, PerformanceResult } from "./minigame/index.js";
export { fishingGame } from "./minigame/index.js";
export type { FishingConfig, FishingResult } from "./minigame/index.js";
export { appraisalGame } from "./minigame/index.js";
export type { AppraisalConfig, AppraisalResult } from "./minigame/index.js";
export {
  combatResult,
  playerCombatStats,
  startCombat,
  telegraphLines,
  turn as combatTurn,
} from "./combat/index.js";
export type {
  CombatAction,
  CombatConfig,
  CombatEvent,
  CombatResult,
  CombatState,
  EnemyDef,
  EnemyMove,
  EnemyPatternStep,
  Telegraph,
} from "./combat/index.js";
export type {
  MiniGame,
  MiniGameCtx,
  TimingConfig,
  TimingInput,
  TimingResult,
  TimingState,
  BoardConfig,
  BoardInput,
  BoardResult,
  BoardState,
  DealCard,
  DealConfig,
  DealInput,
  DealResult,
  DealState,
  DealTopic,
} from "./minigame/index.js";
export { findContradictions, isContradiction } from "./conditions/check.js";
export { approaching, consumeS, emitKehai, rankOf, resetDailyNotify } from "./notify/index.js";
export type { NotifyRank } from "./notify/index.js";
export { acceptOffer, goalAchieved, newOffers, suggestGoals } from "./society/index.js";
export type { LifeGoalDef, ProfessionDef, SocietyDefs, StandingDef } from "./society/index.js";
export { readAtom } from "./lore/index.js";
export type { AtomDef, ConnectionDef, LoreConfig, ReadAtomResult } from "./lore/index.js";
export { TemplateProvider } from "./narration/index.js";
export type { NarrationProvider, NarrationRequest, NarrationTemplates } from "./narration/index.js";
export { specialOrderOf } from "./town/index.js";
export type { OrderLike, SpecialOrderOf, SpecialOrderSpec } from "./town/index.js";
