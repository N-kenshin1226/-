/**
 * ゲーム内の時間・暦・月齢（docs/01_concept.md §4、docs/03_world_systems.md §5）。
 *
 * 時間は「日」と「その日の行動回数」で進む。日またぎは睡眠でだけ起きる。
 * 設定値はすべて balance.json の `time` 節から受け取る（TimeConfig）。
 */

export type TimeOfDay = "morning" | "noon" | "evening" | "night";
export type MoonPhase = "new" | "waxing" | "full" | "waning";

/** balance.json の time 節と対応する設定型 */
export interface TimeConfig {
  /** 1日の行動回数の上限 */
  actionsPerDay: number;
  /** 行動インデックス → 時刻帯の割り当て表（長さは actionsPerDay 以上を推奨。越えた分は末尾で丸める） */
  timeOfDay: readonly TimeOfDay[];
  daysPerWeek: number;
  daysPerSeason: number;
  seasonsPerYear: number;
  /** 月齢周期（日） */
  moonCycleDays: number;
  /** 新月・満月とみなす前後の幅（日） */
  moonPhaseWindowDays: number;
  /** 開始年齢 */
  startAge: number;
}

/** day は 0 始まり。action はその日の何回目の行動か（0 始まり） */
export interface GameTime {
  day: number;
  action: number;
}

export interface TimeDescription {
  timeOfDay: TimeOfDay;
  /** 曜日インデックス（0 始まり。表示名はコンテンツ側で引く） */
  weekday: number;
  /** 季節インデックス（0 始まり） */
  season: number;
  /** 年（0 始まり。表示では +1 する） */
  year: number;
  moon: MoonPhase;
  /** 年齢（startAge + 経過年） */
  age: number;
  /** その季節の何日目か（0 始まり） */
  dayOfSeason: number;
  /** その年の何日目か（0 始まり） */
  dayOfYear: number;
}

/**
 * 1行動進める。action は「その日に消化した行動数」（0..actionsPerDay）。
 * 上限に達したらそれ以上は進まない（次の日へは睡眠でだけ進む）。
 */
export function advance(t: GameTime, cfg: TimeConfig): GameTime {
  return { day: t.day, action: Math.min(t.action + 1, cfg.actionsPerDay) };
}

/** その日にまだ行動できるか */
export function canAct(t: GameTime, cfg: TimeConfig): boolean {
  return t.action < cfg.actionsPerDay;
}

/** 翌日の action 0 へ */
export function sleep(t: GameTime): GameTime {
  return { day: t.day + 1, action: 0 };
}

export function describe(t: GameTime, cfg: TimeConfig): TimeDescription {
  const daysPerYear = cfg.daysPerSeason * cfg.seasonsPerYear;
  const dayOfYear = t.day % daysPerYear;
  const dayOfSeason = dayOfYear % cfg.daysPerSeason;

  const phasePos = ((t.day % cfg.moonCycleDays) + cfg.moonCycleDays) % cfg.moonCycleDays;
  const w = cfg.moonPhaseWindowDays;
  const half = cfg.moonCycleDays / 2;
  const distTo0 = Math.min(phasePos, cfg.moonCycleDays - phasePos);
  const distToHalf = Math.abs(phasePos - half);
  let moon: MoonPhase;
  if (distTo0 <= w) moon = "new";
  else if (distToHalf <= w) moon = "full";
  else moon = phasePos < half ? "waxing" : "waning";

  const timeIdx = Math.min(t.action, cfg.timeOfDay.length - 1);

  return {
    timeOfDay: cfg.timeOfDay[timeIdx] as TimeOfDay,
    weekday: ((t.day % cfg.daysPerWeek) + cfg.daysPerWeek) % cfg.daysPerWeek,
    season: Math.floor(dayOfYear / cfg.daysPerSeason),
    year: Math.floor(t.day / daysPerYear),
    moon,
    age: cfg.startAge + Math.floor(t.day / daysPerYear),
    dayOfSeason,
    dayOfYear,
  };
}
