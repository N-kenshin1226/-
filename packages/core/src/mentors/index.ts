import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import type { Effect } from "../effects/index.js";
import { npcGoneReason } from "../npclife/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 師匠（docs/02_growth_system.md §8・§6、T-27）。
 *
 * 師匠は「成長効果を持つ人間関係」。条件を満たすと弟子入りでき、
 * 弟子でいる間は効果が付く（書物と同じ2層構え）：
 * - `effect`（T-35 語彙。gainVs は gain の M 項に接続）は弟子期間中ずっと有効
 *   （activeEffects の第4引数に mentors を渡すと現行の師匠の効果が乗る）
 * - `potentialRecover` は稽古（trainWithMentor）ごとに担当スキルの素質を回復
 *   （上限は potentialCap・potentialMax。休養日・書物と同じ規則）
 * - `flag` は初回の稽古で立つ秘伝フラグ（ミニゲームのヒント解放などの受け皿。
 *   条件DSLの flag で読める。一度教われば門を出ても残る）
 *
 * 師匠は同時に1人だけ。乗り換えるには leaveMentor で門を出てから
 * 改めて弟子入りする。弟子入り・別れは行動を消費しない（認定の受諾と同じ扱い）。
 */

/** core が必要とする師匠定義の最小形（content の Mentor と同じフィールドの部分集合） */
export interface MentorDefLike {
  id: string;
  /**
   * 対応するNPC（voices/canon の id。X-12：その人物が歳月・危機で街に居なく
   * なったら、師匠としても使えない —— 引退・死去・旅立ちで師弟は終わる。
   * 省略時はその師匠の人物は特定されず、歳月の影響を受けない）
   */
  npc?: string;
  /** 担当スキル（skills.json の id。稽古と効果の対象） */
  skill: string;
  /** 弟子入りの条件（条件DSL。省略時は誰でも入門できる） */
  condition?: Cond;
  /** 稽古1回の礼金（G） */
  fee: number;
  /** 稽古ごとの担当スキル素質回復量（上限 potentialCap/potentialMax） */
  potentialRecover?: number;
  /** 弟子期間中ずっと有効な効果（M項の gainVs など。T-35 語彙） */
  effect?: Effect;
  /** 初回の稽古で立つ秘伝フラグ（条件DSLの flag で読める） */
  flag?: string;
}

export interface MentorsConfig {
  /** mentors.json の師匠定義 */
  mentors: readonly MentorDefLike[];
  /** 素質回復のグローバル上限（balance.body.potentialMax を渡す） */
  potentialMax: number;
}

/**
 * その師匠の人物が街に居ないか（X-12：歳月の退場か危機の離散・死亡）。
 * 居なければ入門・稽古・弟子期間の効果は使えない
 */
export function mentorAbsent(state: GameState, def: MentorDefLike): string | null {
  return npcGoneReason(state, def.npc ?? def.id);
}

/** 現在の師匠の定義（弟子入りしていない・定義が見つからなければ null） */
export function currentMentor(state: GameState, cfg?: MentorsConfig): MentorDefLike | null {
  if (cfg === undefined || state.mentor === null) return null;
  const id = state.mentor.id;
  const def = cfg.mentors.find((m) => m.id === id) ?? null;
  // 街に居なくなった師はもう教えられない。退場の発火時に弟子入りは解消されるが、
  // 危機で居なくなった古いセーブなどへの保険としてここでも退場を優先する
  if (def !== null && mentorAbsent(state, def) !== null) return null;
  return def;
}

/** id の師匠に弟子入りできるか（条件達成・まだ師匠がいない・その人物が街に居る） */
export function canApprentice(
  state: GameState,
  id: string,
  cfg: MentorsConfig | undefined,
  time: TimeConfig,
  env?: CondEnv,
): boolean {
  if (cfg === undefined || state.mentor !== null) return false;
  const def = cfg.mentors.find((m) => m.id === id);
  if (def === undefined) return false;
  if (mentorAbsent(state, def) !== null) return false;
  return def.condition === undefined || evaluate(def.condition, state, time, env);
}

/** 師匠に弟子入りする（行動は消費しない。打診の受諾と同じ扱い） */
export function apprentice(
  state: GameState,
  id: string,
  cfg: MentorsConfig | undefined,
  time: TimeConfig,
  env?: CondEnv,
): { state: GameState; ok: boolean } {
  if (!canApprentice(state, id, cfg, time, env)) return { state, ok: false };
  return {
    state: { ...state, mentor: { id, sinceDay: state.time.day } },
    ok: true,
  };
}

/** 門を出る（師匠がいなければ何も起きない） */
export function leaveMentor(state: GameState): { state: GameState; ok: boolean; id?: string } {
  if (state.mentor === null) return { state, ok: false };
  return { state: { ...state, mentor: null }, ok: true, id: state.mentor.id };
}

export interface MentorSessionResult {
  state: GameState;
  /** 稽古が成立したか（師匠なし・礼金不足・担当スキル不明は false） */
  ok: boolean;
  /** 実際に回復した素質（上限で削られた分は含まない） */
  recovered: { skill: string; amount: number }[];
  /** 今回立った秘伝フラグ（初回のみ） */
  flag?: string;
}

/**
 * 稽古の清算：礼金を払い、担当スキルの素質を回復し、初回なら秘伝フラグを立てる。
 * gain の計算は step 側（train と同じ式。M項には弟子期間効果が別途乗る）
 */
export function mentorSession(state: GameState, cfg?: MentorsConfig): MentorSessionResult {
  const mentor = currentMentor(state, cfg);
  if (cfg === undefined || mentor === null) return { state, ok: false, recovered: [] };
  if (state.player.money < mentor.fee) return { state, ok: false, recovered: [] };
  const s = state.player.skills[mentor.skill];
  if (s === undefined) return { state, ok: false, recovered: [] };

  // 素質回復：休養日・書物と同じく potentialCap（＋グローバル上限 potentialMax）で頭打ち
  const skills = { ...state.player.skills };
  const recovered: { skill: string; amount: number }[] = [];
  const amount = mentor.potentialRecover ?? 0;
  if (amount > 0) {
    const to = Math.min(s.potentialCap, cfg.potentialMax, s.potential + amount);
    const delta = to - s.potential;
    if (delta > 0) {
      skills[mentor.skill] = { ...s, potential: to };
      recovered.push({ skill: mentor.skill, amount: delta });
    }
  }

  let flags = state.flags;
  let flag: string | undefined;
  if (mentor.flag !== undefined && flags[mentor.flag] !== true) {
    flags = { ...flags, [mentor.flag]: true };
    flag = mentor.flag;
  }

  return {
    state: {
      ...state,
      player: { ...state.player, skills, money: state.player.money - mentor.fee },
      flags,
    },
    ok: true,
    recovered,
    ...(flag !== undefined ? { flag } : {}),
  };
}
