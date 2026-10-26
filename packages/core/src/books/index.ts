import type { Effect } from "../effects/index.js";
import type { GameState } from "../state/types.js";

/**
 * 書物（docs/02_growth_system.md §8・§6、T-26）。
 *
 * 書物は「成長効果を持つアイテム」。買って所持し、読む（1行動）と効果が付く：
 * - `effect`（T-35 語彙。gainVs は M 項に接続）が読了当日を含め `durationDays` 日間だけ有効
 * - `potentialRecover` は読了時に即座に素質を回復（上限は potentialCap・potentialMax。休養日と同じ規則）
 * - `flag` は知識フラグとして flags に立つ（条件DSLの flag で読める）
 *
 * 読了は初回のみ。再読・未所持・不明IDは何も起きない（readAtom と同じ流儀）。
 * 期間効果は「いつ読んだか」だけを GameState.books.read に持ち、
 * 有効な効果の一覧は activeBookEffects でその都度派生する（別枠の効果リストは持たない）。
 */

/** core が必要とする書物定義の最小形（content の Book と同じフィールドの部分集合） */
export interface BookDefLike {
  id: string;
  /** 書店での値段（G） */
  price: number;
  /** 読了後 durationDays 日間だけ有効な効果（M項の gainVs など。T-35 語彙） */
  effect?: Effect;
  /** effect の持続日数（読んだ当日を含む）。effect がある書物は必須 */
  durationDays?: number;
  /** 読了時に回復する素質（スキルID → ポイント） */
  potentialRecover?: Record<string, number>;
  /** 読了で立つ知識フラグ（条件DSLの flag で読める） */
  flag?: string;
}

export interface BooksConfig {
  /** books.json の書物定義 */
  books: readonly BookDefLike[];
  /** 素質回復のグローバル上限（balance.body.potentialMax を渡す） */
  potentialMax: number;
}

/** 読了済みか */
export function hasReadBook(state: GameState, id: string): boolean {
  return state.books.read.some((r) => r.id === id);
}

/** 書物の期間効果の残り日数（読了済みでなければ 0。当日を含む残数） */
export function bookDaysLeft(state: GameState, def: { id: string; durationDays?: number }): number {
  if (def.durationDays === undefined) return 0;
  const entry = state.books.read.find((r) => r.id === def.id);
  if (!entry) return 0;
  return Math.max(0, def.durationDays - (state.time.day - entry.day));
}

/**
 * いま有効な書物の効果一覧（読了から durationDays 未満のものだけ）。
 * activeEffects（称号・認定職）に連結して gainModifier/damageFactor/priceFactor に渡す。
 */
export function activeBookEffects(state: GameState, cfg?: BooksConfig): Effect[] {
  if (cfg === undefined) return [];
  const defs = new Map(cfg.books.map((b) => [b.id, b]));
  const list: Effect[] = [];
  for (const r of state.books.read) {
    const def = defs.get(r.id);
    if (def?.effect === undefined || def.durationDays === undefined) continue;
    if (state.time.day - r.day < def.durationDays) list.push(def.effect);
  }
  return list;
}

export interface BuyBookResult {
  state: GameState;
  /** 購入できたか（不明ID・所持済み・所持金不足は false） */
  ok: boolean;
}

/** 書物を買う：所持金を払って所持に加える（行動は消費しない） */
export function buyBook(state: GameState, id: string, cfg?: BooksConfig): BuyBookResult {
  const def = cfg?.books.find((b) => b.id === id);
  if (def === undefined || state.player.money < def.price || state.books.owned.includes(id)) {
    return { state, ok: false };
  }
  return {
    state: {
      ...state,
      player: { ...state.player, money: state.player.money - def.price },
      books: { ...state.books, owned: [...state.books.owned, id] },
    },
    ok: true,
  };
}

export interface ReadBookResult {
  state: GameState;
  /** 読了できたか（未所持・読了済み・不明IDは false） */
  ok: boolean;
  /** 実際に回復した素質（上限で削られた分は含まない） */
  recovered: { skill: string; amount: number }[];
  /** 今回立った知識フラグ */
  flag?: string;
}

/** 書物を読む：初回のみ。素質回復（即時）と知識フラグを適用し、読了を記録する */
export function readBook(state: GameState, id: string, cfg?: BooksConfig): ReadBookResult {
  const def = cfg?.books.find((b) => b.id === id);
  if (
    cfg === undefined ||
    def === undefined ||
    !state.books.owned.includes(id) ||
    hasReadBook(state, id)
  ) {
    return { state, ok: false, recovered: [] };
  }

  // 素質回復：休養日と同じく potentialCap（＋グローバル上限 potentialMax）で頭打ち
  let player = state.player;
  const recovered: { skill: string; amount: number }[] = [];
  if (def.potentialRecover !== undefined) {
    const skills = { ...player.skills };
    for (const [skillId, amount] of Object.entries(def.potentialRecover)) {
      const s = skills[skillId];
      if (s === undefined || amount <= 0) continue;
      const to = Math.min(s.potentialCap, cfg.potentialMax, s.potential + amount);
      const delta = to - s.potential;
      if (delta > 0) {
        skills[skillId] = { ...s, potential: to };
        recovered.push({ skill: skillId, amount: delta });
      }
    }
    player = { ...player, skills };
  }

  let flags = state.flags;
  let flag: string | undefined;
  if (def.flag !== undefined && flags[def.flag] !== true) {
    flags = { ...flags, [def.flag]: true };
    flag = def.flag;
  }

  const books = { ...state.books, read: [...state.books.read, { id, day: state.time.day }] };
  return {
    state: { ...state, player, flags, books },
    ok: true,
    recovered,
    ...(flag !== undefined ? { flag } : {}),
  };
}
