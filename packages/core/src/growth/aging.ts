import type { GameState } from "../state/types.js";
import { describe, type TimeConfig } from "../time/index.js";

/**
 * 寿命・加齢（docs/06_endgame.md §1「一生＝1周」、T-36）。
 *
 * - 年齢は time.startAge + 経過年（`describe(state.time, timeCfg).age` で求まる）
 * - 年齢帯ごとに成長係数が変わる：若い頃は基礎能力（consolidateBody）が伸びやすく、
 *   歳を取るとスキル（consolidateSleep の定着）が伸びやすい。係数は睡眠時の定着に乗る
 * - 「老いの兆候」は起床サプライズ（WakeReport.surprises）に出す。
 *   寿命の経過割合（経過年/lifespanYears）が signWarnAt を超えると弱い兆候（1回）、
 *   signSevereAt を超えると強い兆候（signEveryDays ごとに繰り返す）
 * - startAge + lifespanYears 歳に達した朝に老衰死する（仮実装：died と同じ処理＝
 *   教会蘇生で pending 半減。転生フローへの接続は T-40。deathByAge イベントは
 *   died と別型にしておく）
 * - 「出した兆候の段階」と「老衰死済みか」は GameState を変えず
 *   counters（aging.signStage / aging.signDay / death.oldAge）に記録する
 *
 * 係数はすべて balance.json の aging 節（AgingConfig。texts は cli.json 由来で
 * balance には含まれない。rust.texts と同じ注入パターン）。
 */

/** 年齢帯（age <= upToAge の最初の帯が適用される） */
export interface AgeBand {
  /** この年齢まで（含む）。昇順 */
  upToAge: number;
  /** 基礎能力の定着係数（consolidateBody の statGainPerLoad に乗る） */
  statFactor: number;
  /** スキルの定着係数（consolidateSleep の定着量に乗る） */
  skillFactor: number;
}

export interface AgingConfig {
  /** 年齢帯（upToAge 昇順。どれにも入らなければ末尾の帯が適用される） */
  bands: readonly AgeBand[];
  /** 開始年齢からの寿命（年）。startAge + lifespanYears 歳に達した朝に老衰死 */
  lifespanYears: number;
  /** 寿命経過（経過年/lifespanYears）がこの割合を超えると弱い兆候（1回だけ） */
  signWarnAt: number;
  /** この割合を超えると強い兆候（signEveryDays ごとに繰り返す） */
  signSevereAt: number;
  /** 強い兆候を繰り返す間隔（日） */
  signEveryDays: number;
  /** 起床サプライズに出す文（text/cli.json の wake.agingWarn / wake.agingSevere 由来） */
  texts: { warn: string; severe: string };
}

/** 年齢に対応する成長係数の帯を返す（age <= upToAge の最初の帯。なければ末尾） */
export function ageBand(age: number, cfg: AgingConfig): AgeBand {
  const band = cfg.bands.find((b) => age <= b.upToAge) ?? cfg.bands[cfg.bands.length - 1];
  return band ?? { upToAge: 0, statFactor: 1, skillFactor: 1 };
}

/** 寿命の経過割合（0 始まり。経過年 / lifespanYears。開始前は 0） */
export function lifespanProgress(age: number, startAge: number, cfg: AgingConfig): number {
  if (cfg.lifespanYears <= 0) return 1;
  return Math.max(0, (age - startAge) / cfg.lifespanYears);
}

/** 兆候の段階：0 なし / 1 弱い兆候 / 2 強い兆候 */
export function agingSignStage(age: number, startAge: number, cfg: AgingConfig): 0 | 1 | 2 {
  const p = lifespanProgress(age, startAge, cfg);
  if (p >= cfg.signSevereAt) return 2;
  if (p >= cfg.signWarnAt) return 1;
  return 0;
}

/** 寿命（startAge + lifespanYears 歳）に達したか */
export function reachedLifespan(age: number, startAge: number, cfg: AgingConfig): boolean {
  return age - startAge >= cfg.lifespanYears;
}

export interface AgingWakeResult {
  state: GameState;
  /** 起床サプライズに足す兆候の行（兆候なしなら null） */
  signLine: string | null;
  /**
   * 発行する出来事（slept / wakeReport のあとに、この順で流す）。
   * oldAgeSign → deathByAge → died（老衰死は died と同じ処理の暫定措置）
   */
  events: (
    | { type: "oldAgeSign"; stage: 1 | 2; age: number }
    | { type: "deathByAge"; age: number }
    | { type: "died" }
  )[];
}

/**
 * 睡眠による日またぎの直後に呼ぶ：新しい朝の年齢で兆候と老衰死を判定する。
 * 兆候は段階が上がったとき1回（強い兆候は signEveryDays で繰り返し）、
 * 老衰死は death.oldAge カウンタで一生に1回だけ起きる。
 * deathPendingFactor は died と同じ pending 減少率（balance.combat.deathPendingFactor）。
 */
export function agingOnWake(
  state: GameState,
  cfg: AgingConfig,
  timeCfg: TimeConfig,
  deathPendingFactor: number,
): AgingWakeResult {
  const age = describe(state.time, timeCfg).age;
  const stage = agingSignStage(age, timeCfg.startAge, cfg);
  const counters = { ...state.counters };
  let signLine: string | null = null;
  const events: AgingWakeResult["events"] = [];

  const lastStage = counters["aging.signStage"] ?? 0;
  if (stage > lastStage) {
    counters["aging.signStage"] = stage;
    counters["aging.signDay"] = state.time.day;
    const s = stage as 1 | 2;
    signLine = s === 2 ? cfg.texts.severe : cfg.texts.warn;
    events.push({ type: "oldAgeSign", stage: s, age });
  } else if (
    stage === 2 &&
    state.time.day - (counters["aging.signDay"] ?? 0) >= cfg.signEveryDays
  ) {
    counters["aging.signDay"] = state.time.day;
    signLine = cfg.texts.severe;
    events.push({ type: "oldAgeSign", stage: 2, age });
  }

  // 老衰死：寿命に達した朝に一度だけ（暫定措置：died と同じ処理＋died 発行。T-40 で転生へ）
  if (reachedLifespan(age, timeCfg.startAge, cfg) && counters["death.oldAge"] === undefined) {
    counters["death.oldAge"] = state.time.day;
    counters["death.count"] = (counters["death.count"] ?? 0) + 1;
    const skills = { ...state.player.skills };
    for (const id of Object.keys(skills)) {
      const s = skills[id]!;
      skills[id] = { ...s, pending: s.pending * deathPendingFactor };
    }
    events.push({ type: "deathByAge", age });
    events.push({ type: "died" });
    return {
      state: { ...state, counters, player: { ...state.player, skills } },
      signLine,
      events,
    };
  }

  if (signLine === null) return { state, signLine: null, events };
  return { state: { ...state, counters }, signLine, events };
}
