/**
 * 揺らぎ（R-01、docs/devin_tasks/R-01_randomness.md）。
 *
 * 「同じ行動で同じ結果になる」ことをやめ、現実と同じく結果に幅を持たせる
 * 乱数の集まり。原則：
 *
 * - 公平：揺らぎは誰に対しても同じ分布で働き、方向を持たない。
 *   係数の期待値はすべて 1.0 前後（主人公が得をする・損をする乱数は作らない）
 * - 技量で安定：技量が高いほど分散が小さい（低技量はブレが大きい）。
 *   半幅は `spread * skillDamp(skill)` に比例し、skillDamp は
 *   `(1 - clamp01(skill/100))^skillDampK` —— 技量0で 1、技量100で 0 になる
 * - 決定論：すべて世界シード×日付×用途の独立した乱数列
 *   `${seed}:<purpose>:${day}:<key>` から引く。state.rng を消費しないので
 *   同じシード・同じ行動列なら必ず同じ結果になる
 */
import { createRng, type Rng } from "../rng/index.js";

/** 経験（成長）の揺らぎ */
export interface GainVarianceConfig {
  /**
   * 技量0のときの変動の半幅（±の割合。0.20 → 0.80〜1.20 の範囲）。
   * 実際の掛け率は `1 + triangular * 半幅` で、三角分布なので中央寄り
   */
  spread: number;
  /** 技量で半幅が縮む指数（大きいほど高技量で急に安定する） */
  skillDampK: number;
  /** 「今日は妙に冴えている」日の出る確率（朝に決まり、その日全部の経験に効く） */
  insightChance: number;
  /** 冴えの日の経験倍率 */
  insightFactor: number;
}

/** 仕事・製作の揺らぎ */
export interface WorkVarianceConfig {
  /** 会心作（思わぬ良い出来）の出る確率の上限（技量 damp が掛かる） */
  critChance: number;
  /** 失敗作の出る確率の上限（技量 damp が掛かる） */
  failChance: number;
  /** 確率側の技量 damp の指数 */
  skillDampK: number;
  /** 会心作の品質倍率 */
  critFactor: number;
  /** 失敗作の品質倍率 */
  failFactor: number;
  /** 会心作に付く旗（作品の結果行に出る） */
  critFlag: string;
  /** 失敗作に付く旗 */
  failFlag: string;
  /**
   * 素材の質の揺らぎ（日×種目で決まる係数の半幅。同じ日の同じ仕事は
   * 同じ素材を使ったとして品質に一様に掛かる）
   */
  materialSpread: number;
  /** 客の機嫌（良い/悪い）が報酬を動かす確率と係数。基本は 1.0 の日 */
  moodGoodChance: number;
  moodBadChance: number;
  moodGoodFactor: number;
  moodBadFactor: number;
}

/** 市場（仕事の報酬相場）の揺らぎ */
export interface MarketVarianceConfig {
  /**
   * 日次の相場の揺らぎ（半幅）。日×種目で決まる係数で、三角分布なので
   * 中央寄り。「豊作/凶作で相場が動く」程度の動き
   */
  dailySpread: number;
  /**
   * 季節波の振幅。種目ごとに世界シードで決めた位相（旬）を持つ
   * コサイン波が相場に掛かる（旬に高く・旬外れに安い、または逆）
   */
  seasonalAmp: number;
}

/** 人（NPC）の揺らぎ */
export interface NpcVarianceConfig {
  /**
   * NPCが今日街にいない確率（日×NPCで決まる。師匠もこの抽選を受け、
   * いない日は弟子入りも師匠の稽古もできない）
   */
  awayChance: number;
}

/** 体調の揺らぎ */
export interface ConditionVarianceConfig {
  /**
   * 朝の体調が良い/悪い確率の基準値。実際の重みは睡眠の質と疲労で傾く：
   *   良い重み = goodChance * (1 + max(0, 質-1) + max(0, (50-疲労)/100))
   *   悪い重み = poorChance * (1 + 疲労/50 + max(0, 1-質))
   * よく寝て疲れが少ないほど好調に、無理を重ねるほど不調に傾く
   */
  goodChance: number;
  poorChance: number;
  /** 体調が定着の「質」に掛かる係数 */
  goodFactor: number;
  poorFactor: number;
}

/** 起床ログなどに載せる文（cli.json 由来で注入する） */
export interface VarianceTexts {
  /** 冴えの日の行 */
  insight?: string;
  /** 体調が良い日の行 */
  conditionGood?: string;
  /** 体調が悪い日の行 */
  conditionPoor?: string;
}

export interface VarianceConfig {
  gain: GainVarianceConfig;
  work: WorkVarianceConfig;
  market: MarketVarianceConfig;
  npc: NpcVarianceConfig;
  condition: ConditionVarianceConfig;
  texts?: VarianceTexts;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * 対称三角分布の揺らぎ：u1+u2-1 ∈ [-1,1)、期待値0。
 * 一様乱数より中央に寄る（極端な値はまれ）
 */
export const triangular = (rng: Rng): number => rng.next() + rng.next() - 1;

/**
 * 技量による安定化係数。技量0で 1、技量100で 0。
 * `(1 - clamp01(skill/100))^k` —— 分散（揺らぎの幅）がこの係数に比例して縮む
 */
export function skillDamp(skill: number, k: number): number {
  return Math.pow(1 - clamp01(skill / 100), k);
}

/** 技量 skill のときの経験変動の半幅（±の割合） */
export function gainSpread(skill: number, cfg: GainVarianceConfig): number {
  return cfg.spread * skillDamp(skill, cfg.skillDampK);
}

/** 経験の掛け率：`1 + triangular * gainSpread(skill)`。期待値1、技量で安定 */
export function gainVarianceFactor(rng: Rng, skill: number, cfg: GainVarianceConfig): number {
  return 1 + triangular(rng) * gainSpread(skill, cfg);
}

/** その日の「冴え」：朝に決まり、その日の全経験に掛かる */
export function insightOf(
  seed: string,
  day: number,
  cfg: GainVarianceConfig,
): { active: boolean; factor: number } {
  const rng = createRng(`${seed}:insight:${day}`);
  // 高い尾で引く（u > 1 − chance。確率は同じだが、出来事や体調の低い尾の
  // 抽選と同じ乱数の側に寄らないよう別の側にする）
  const active = rng.next() > 1 - cfg.insightChance;
  return { active, factor: active ? cfg.insightFactor : 1 };
}

export interface WorkTwist {
  /** 品質への掛け率 */
  factor: number;
  /** 会心作/失敗作の旗（出なければ undefined） */
  flag?: string;
}

/**
 * 思わぬ出来栄えの抽選。確率が `p * skillDamp(skill, k)` で縮むので、
 * 低技量ほど会心も失敗も出やすく、高技量は安定して「普通」を出す
 */
export function workTwist(
  seed: string,
  day: number,
  key: string,
  skill: number,
  cfg: WorkVarianceConfig,
): WorkTwist {
  const rng = createRng(`${seed}:twist:${day}:${key}`);
  const damp = skillDamp(skill, cfg.skillDampK);
  const u = rng.next();
  if (u < cfg.failChance * damp) {
    return { factor: cfg.failFactor, flag: cfg.failFlag };
  }
  if (u > 1 - cfg.critChance * damp) {
    return { factor: cfg.critFactor, flag: cfg.critFlag };
  }
  return { factor: 1 };
}

/** 素材の質：日×種目で決まる係数（半幅 materialSpread、期待値1） */
export function materialFactor(
  seed: string,
  day: number,
  key: string,
  cfg: WorkVarianceConfig,
): number {
  const rng = createRng(`${seed}:material:${day}`).fork(key);
  return 1 + triangular(rng) * cfg.materialSpread;
}

/** 客の機嫌：日×仕事（注文）で決まる。基本は 1.0、まれに増減 */
export function customerMoodFactor(
  seed: string,
  day: number,
  key: string,
  cfg: WorkVarianceConfig,
): number {
  const rng = createRng(`${seed}:mood:${day}`).fork(key);
  const u = rng.next();
  if (u < cfg.moodBadChance) {
    return cfg.moodBadFactor;
  }
  if (u > 1 - cfg.moodGoodChance) {
    return cfg.moodGoodFactor;
  }
  return 1;
}

/**
 * 市場の相場係数。日次ジッター（±dailySpread、三角分布）に
 * 季節波（振幅 seasonalAmp のコサイン。種目ごとに世界シードで
 * 「旬」の位相が決まる）を掛け合わせる。期待値はおおよそ1
 */
export function marketFactor(
  seed: string,
  day: number,
  kind: string,
  season: number,
  seasonsPerYear: number,
  cfg: MarketVarianceConfig,
): number {
  const daily = 1 + triangular(createRng(`${seed}:market:${day}`).fork(kind)) * cfg.dailySpread;
  const prime = createRng(`${seed}:market-season:${kind}`).next() * seasonsPerYear;
  const seasonal =
    1 + cfg.seasonalAmp * Math.cos((2 * Math.PI * (season - prime)) / seasonsPerYear);
  return daily * seasonal;
}

/** その日その NPC が街にいるか（いない日の会う・師匠の稽古はできない） */
export function npcAway(seed: string, day: number, npcId: string, cfg: NpcVarianceConfig): boolean {
  return createRng(`${seed}:npcaway:${day}`).fork(npcId).chance(cfg.awayChance);
}

export type DayCondition = "good" | "normal" | "poor";

/**
 * 目覚める日の体調の抽選。乱数自体は日×世界シードで固定で、
 * 睡眠の質と当日の疲労が良い/悪いの重みを傾ける（よく寝て疲れの
 * 少ない日ほど好調になりやすい）
 */
export function rollCondition(
  seed: string,
  day: number,
  quality: number,
  fatigue: number,
  cfg: ConditionVarianceConfig,
): { kind: DayCondition; factor: number } {
  const rng = createRng(`${seed}:condition:${day}`);
  const goodWeight =
    cfg.goodChance * (1 + Math.max(0, quality - 1) + Math.max(0, (50 - fatigue) / 100));
  const poorWeight = cfg.poorChance * (1 + fatigue / 50 + Math.max(0, 1 - quality));
  const u = rng.next();
  if (u < poorWeight) {
    return { kind: "poor", factor: cfg.poorFactor };
  }
  if (u > 1 - goodWeight) {
    return { kind: "good", factor: cfg.goodFactor };
  }
  return { kind: "normal", factor: 1 };
}
