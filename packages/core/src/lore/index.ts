import { evaluate, type Cond } from "../conditions/index.js";
import type { TimeConfig } from "../time/index.js";
import type { GameState } from "../state/types.js";

/**
 * 見聞録（docs/07_story.md §3）。
 * アトムを読むと、分かった事実（reveals）とフラグ（unlock）が記録される。
 * 出来事に関わる事実が揃うと「つながりの報酬」として隠しフラグが立つ
 */

/** 見聞録の一覧に出るアトム（X-33。visible 条件の立っているものだけ） */
export function visibleAtoms<T extends { visible?: Cond }>(
  state: GameState,
  atoms: readonly T[],
  time: TimeConfig,
): T[] {
  return atoms.filter((a) => a.visible === undefined || evaluate(a.visible, state, time));
}

/** core が必要とするアトムの最小形（content の Atom と同じフィールドの部分集合） */
export interface AtomDef {
  id: string;
  reveals: string[];
  unlock: { flag: string } | null;
}

/** つながりの報酬：facts が全て判明すると flag が立つ */
export interface ConnectionDef {
  eventId: string;
  facts: string[];
  flag: string;
}

export interface LoreConfig {
  atoms: readonly AtomDef[];
  connections: readonly ConnectionDef[];
}

export interface ReadAtomResult {
  state: GameState;
  ok: boolean;
  /** 新しく判明した事実ID */
  newFacts: string[];
  /** 立ったフラグ */
  flags: string[];
  /** 今回完成したつながり（報酬フラグ） */
  connections: { eventId: string; flag: string }[];
}

/** アトムを読む（未読のアトムのみ。読み済み・不明IDは失敗） */
export function readAtom(state: GameState, id: string, cfg: LoreConfig): ReadAtomResult {
  const none = { state, ok: false, newFacts: [], flags: [], connections: [] };
  const atom = cfg.atoms.find((a) => a.id === id);
  if (!atom || state.lore.read.includes(id)) return none;

  const read = [...state.lore.read, id];
  const facts = new Set(state.lore.facts);
  const newFacts: string[] = [];
  for (const f of atom.reveals) {
    if (!facts.has(f)) {
      facts.add(f);
      newFacts.push(f);
    }
  }
  const flags: string[] = [];
  const flagMap = { ...state.flags };
  if (atom.unlock && !flagMap[atom.unlock.flag]) {
    flagMap[atom.unlock.flag] = true;
    flags.push(atom.unlock.flag);
  }

  const lore = { read, facts: [...facts], connections: [...state.lore.connections] };
  const connections: { eventId: string; flag: string }[] = [];
  for (const c of cfg.connections) {
    if (lore.connections.includes(c.eventId)) continue;
    if (c.facts.every((f) => facts.has(f))) {
      lore.connections.push(c.eventId);
      if (!flagMap[c.flag]) {
        flagMap[c.flag] = true;
        flags.push(c.flag);
      }
      connections.push({ eventId: c.eventId, flag: c.flag });
    }
  }

  return {
    state: { ...state, lore, flags: flagMap },
    ok: true,
    newFacts,
    flags,
    connections,
  };
}
