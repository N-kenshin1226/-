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
export {
  consolidateSleep,
  rankCapFactor,
  skillRankIndex,
  sleepQuality,
  statLine,
} from "./growth/consolidate.js";
export type {
  ConsolidateResult,
  InnRank,
  SkillRankDef,
  SkillRankUp,
  SleepConfig,
  WakeLine,
  WakeReport,
} from "./growth/consolidate.js";
export { applyActionLoad, consolidateBody, updateOverwork } from "./growth/body.js";
export type { BodyConfig, BodyNightResult } from "./growth/body.js";
export {
  ageBand,
  agingOnWake,
  agingSignStage,
  lifespanProgress,
  reachedLifespan,
} from "./growth/aging.js";
export type { AgeBand, AgingConfig, AgingWakeResult } from "./growth/aging.js";
export { rollTailwind, windFor } from "./growth/tailwind.js";
export type { RolledWind, TailwindConfig, TailwindDef, WindDirection } from "./growth/tailwind.js";
// 錆の読み取り専用ヘルパー（UI-01。ステータス画面の「錆までN日」表示用）
export { effectiveGraceDays, rustedValue } from "./growth/rust.js";
export { step } from "./step.js";
export type { Command, StepConfig, StepResult } from "./step.js";
export { recordWork, matchesWork } from "./ledger/index.js";
export type { LedgerConfig, RecordedWork } from "./ledger/index.js";
export { newGame, nextWorldSeed } from "./state/newGame.js";
export type { NewGameConfig } from "./state/newGame.js";
export { TENDENCY_IDS } from "./state/types.js";
export type {
  ActionLogEntry,
  GameState,
  LifeState,
  PlayerState,
  SkillId,
  SkillState,
  StatId,
  TendencyId,
  TodayState,
  Work,
} from "./state/types.js";
export { subscribers } from "./events/index.js";
export type { ActionEvent, Subscriber } from "./events/index.js";
export { deserialize, migrations, SAVE_VERSION, serialize } from "./save/index.js";
export {
  CHRONICLE_VERSION,
  chronicleMigrations,
  deserializeChronicle,
  emptyChronicle,
  hasLifeRecord,
  lifeEntryOf,
  recordLife,
  serializeChronicle,
} from "./chronicle/index.js";
export type {
  Chronicle,
  ChronicleEntry,
  LifeCause,
  NotableWork,
  RecordLifeOptions,
} from "./chronicle/index.js";
export { evaluate } from "./conditions/index.js";
export type { Compare, Cond, CondEnv } from "./conditions/index.js";
export { weatherOf, weatherPriceFactor, weatherToday } from "./weather/index.js";
export type { Weather, WeatherConfig, WeatherKind } from "./weather/index.js";
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
  canFightUnique,
  combatIntent,
  combatResult,
  critChance,
  enhancedEnemy,
  evadeChance,
  hitChance,
  playerCombatStats,
  rollIndividual,
  startCombat,
  telegraphLines,
  turn as combatTurn,
} from "./combat/index.js";
export type {
  CombatAction,
  CombatConfig,
  CombatEvent,
  CombatIntent,
  CombatLinkBonuses,
  CombatPlayer,
  CombatResult,
  CombatState,
  EnemyDef,
  EnemyMove,
  EnemyPatternStep,
  EnemyTrait,
  IndividualConfig,
  Telegraph,
  WeaponDef,
} from "./combat/index.js";
export { weaponDefOf } from "./combat/index.js";
// 技能リンク（K-01、balance.links）：技能がどこに効くかの結線を読む薄い層
export { linkFlat, linkFlatCap, linkSum } from "./links/index.js";
export type { SkillLinkDef, SkillLinks } from "./links/index.js";
export {
  customerMoodFactor,
  gainSpread,
  gainVarianceFactor,
  insightOf,
  marketFactor,
  materialFactor,
  npcAway,
  rollCondition,
  skillDamp,
  workTwist,
} from "./variance/index.js";
export type {
  ConditionVarianceConfig,
  DayCondition,
  GainVarianceConfig,
  MarketVarianceConfig,
  NpcVarianceConfig,
  VarianceConfig,
  VarianceTexts,
  WorkTwist,
  WorkVarianceConfig,
} from "./variance/index.js";
export { worldFactor, worldMods, withWorldMods } from "./fate/index.js";
export type { TendencyDefs, VowDef, WorldMods } from "./fate/index.js";
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
export { activeEffects, damageFactor, gainModifier, priceFactor } from "./effects/index.js";
export type { Effect, EffectBearer } from "./effects/index.js";
export { readAtom } from "./lore/index.js";
export type { AtomDef, ConnectionDef, LoreConfig, ReadAtomResult } from "./lore/index.js";
export { TemplateProvider } from "./narration/index.js";
export type { NarrationProvider, NarrationRequest, NarrationTemplates } from "./narration/index.js";
export { biographyMaterial } from "./biography/index.js";
export type { BiographyMaterial } from "./biography/index.js";
export { legacyOf } from "./legacy/index.js";
export type { Legacy, LegacyArtifact, LegacyConfig, LegacyPick } from "./legacy/index.js";
export { heirGenerationOf, heirKindOf, heirLegacyOf, succeedLife } from "./heir/index.js";
export type { HeirConfig, HeirKind } from "./heir/index.js";
export {
  checkPinnacles,
  isRouteVisible,
  nextStage,
  pinnacleFlag,
  pinnacleReached,
  reachedPinnacles,
  routeProgress,
  visiblePinnacles,
} from "./pinnacle/index.js";
export type {
  PinnacleCheck,
  PinnacleRouteDef,
  PinnacleStageDef,
  PinnacleStageReached,
} from "./pinnacle/index.js";
export { showdownOrderOf, specialOrderOf } from "./town/index.js";
export type { OrderLike, SpecialOrderOf, SpecialOrderSpec } from "./town/index.js";
export { isSkillUnlocked, unlockFlag, unlockSkills } from "./skills/index.js";
export type { SkillUnlockDef } from "./skills/index.js";
export {
  activeBookEffects,
  bookDaysLeft,
  buyBook,
  hasReadBook,
  readBook,
  shelfBooks,
} from "./books/index.js";
export type { BookDefLike, BooksConfig, BuyBookResult, ReadBookResult } from "./books/index.js";
export { lostBookFlags, lostBookSkillId } from "./lostbooks/index.js";
export type { LostBookConfig } from "./lostbooks/index.js";
export {
  apprentice,
  canApprentice,
  currentMentor,
  leaveMentor,
  mentorSession,
} from "./mentors/index.js";
export type { MentorDefLike, MentorsConfig, MentorSessionResult } from "./mentors/index.js";
export {
  abyssRunSeed,
  endRun,
  floorEnemy,
  floorFactor,
  floorPool,
  killFloor,
  scaleEnemy,
  spendLight,
  startRun,
} from "./abyss/index.js";
export type { AbyssConfig, AbyssEnd, AbyssKill, AbyssRun } from "./abyss/index.js";
export { drawRivalCast, playerScore, rivalsOf } from "./rivals/index.js";
export type {
  RivalCast,
  RivalEntry,
  RivalNamePool,
  Rivalry,
  RivalsConfig,
} from "./rivals/index.js";
export {
  OCCASION_RENOWN_KEY,
  occasionAttemptDayKey,
  occasionDef,
  occasionJoinDayKey,
  occasionOfferDayKey,
  occasionOfferKindDayKey,
  occasionOffers,
  occasionPending,
  occasionSpeaker,
} from "./occasions/index.js";
export type {
  OccasionDef,
  OccasionOffer,
  OccasionSide,
  OccasionsConfig,
  OccasionSpeaker as OccasionSpeakerDef,
  OccasionVessel,
} from "./occasions/index.js";
export {
  drawIncidents,
  incidentChoosable,
  incidentDef,
  incidentDoneDayKey,
  incidentLastOfferKey,
  incidentOfferDayKey,
  incidentOfferKindDayKey,
  incidentOffers,
  incidentOutcome,
  incidentPending,
  incidentPendingChoice,
  incidentSpeaker,
} from "./incidents/index.js";
export type {
  IncidentChoice,
  IncidentDef,
  IncidentDraw,
  IncidentOffer,
  IncidentOutcome,
  IncidentSpeaker,
  IncidentsConfig,
} from "./incidents/index.js";
export {
  addHeroContribution,
  CRISIS_HERO_FLAG,
  crisisAreaClosed,
  crisisAttemptFlag,
  crisisEffects,
  crisisEnding,
  crisisEnemyChallengeBonus,
  crisisEnemyMods,
  crisisEpilogue,
  crisisFeatureActive,
  crisisFinaleAttempt,
  crisisFinaleLead,
  crisisFinaleOffers,
  crisisFinaleRole,
  crisisInvolvement,
  crisisInvolvementStage,
  crisisJoinFlag,
  crisisNpcAbsent,
  crisisOfferFlag,
  crisisOfferSpeaker,
  crisisPreparedness,
  crisisPriceFactor,
  crisisRivalName,
  crisisRivalOf,
  crisisRivalRef,
  crisisRivals,
  crisisSceneHaze,
  crisisSeasonTurn,
  crisisStageLine,
  crisisTouchpointForCombat,
  crisisTouchpointForWork,
  crisisTouchpointOf,
  crisisTouchpointOffers,
  crisisTouchpointVessel,
  crisisTouchpointWeight,
  crisisTypeOf,
  drawCrisis,
  emptyCrisisFields,
} from "./crisis/index.js";
export type {
  ActiveCrisisEffects,
  CrisisConfig,
  CrisisEnding,
  CrisisEndingNames,
  CrisisEndingText,
  CrisisEnemyEffect,
  CrisisEpilogue,
  CrisisFactionDef,
  CrisisFinaleDef,
  CrisisFinaleOffer,
  CrisisFinaleRole,
  CrisisInvolvement,
  CrisisInvolvementConfig,
  CrisisInvolvementStage,
  CrisisInvolvementWeights,
  CrisisNpcEffect,
  CrisisPriceEffect,
  CrisisRival,
  CrisisRivalConfig,
  CrisisStageDef,
  CrisisStageEffects,
  CrisisTouchpointDef,
  CrisisTouchpointOffer,
  CrisisTouchpointOfferDef,
  CrisisTouchpointOrder,
  CrisisTouchpointsConfig,
  CrisisTouchpointVessel,
  CrisisTypeDef,
  TouchpointAffinity,
} from "./crisis/index.js";
export { CRISIS_FIELD_IDS } from "./state/types.js";
export type {
  CrisisFactionState,
  CrisisFieldId,
  CrisisFinaleState,
  CrisisLogEntry,
  CrisisState,
} from "./state/types.js";
export {
  checkDiscoveries,
  dailyDiscoveryHint,
  discoveryHintText,
  discoveryParams,
  foundFlagKey,
  resolveDiscoveryCondition,
  unfoundDiscoveries,
} from "./discoveries/index.js";
export type {
  DiscoveryDef,
  DiscoveryHintNames,
  DiscoveryParams,
  DiscoverySeeded,
} from "./discoveries/index.js";
export {
  NPC_LIFE_GONE_KINDS,
  NPC_LIFE_LOG_PREFIX,
  npcGoneReason,
  npcLifeDoneKey,
  npcLifeEvents,
  npcLifeGoneFlag,
  npcLifeLog,
  npcLifeMark,
  npcLifeMarkFlag,
  npcLifeName,
  npcLifeRecent,
  npcLifeToday,
} from "./npclife/index.js";
export type {
  NpcGoneReason,
  NpcLifeConfig,
  NpcLifeEventDef,
  NpcLifeEventKind,
  NpcLifeFired,
  NpcLifeNpcDef,
} from "./npclife/index.js";
export { mentorAbsent } from "./mentors/index.js";
// 日々の営み（P-02「行動の種類を増やす」）
export {
  bondOf,
  bondWarm,
  canErrand,
  cookQuality,
  drawGamble,
  drawGather,
  drawStroll,
  errandDoneDayKey,
  errandsFor,
  errandsToday,
  itemCount,
  itemPrice,
  journeyBetween,
  journeying,
  marketStock,
  mealToday,
  prayedToday,
  townName,
  townOf,
  withItem,
} from "./life/index.js";
export type {
  ErrandDef,
  GatherEntry,
  GatherTable,
  ItemDef,
  JourneyDef,
  LifeConfig,
  LifeOutcome,
  RecipeDef,
} from "./life/index.js";
