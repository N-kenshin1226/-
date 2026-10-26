import { step, suggestGoals, type ActionEvent, type GameState, type StepConfig } from "@trace/core";
import { atoms, society, titles, type CliText } from "@trace/content";
import { tpl } from "./render.js";

/**
 * サブメニューの分岐（game.ts の主ループから切り出したもの）。
 * 各関数は新しい state（または中断時に null）を返す
 */

export interface MenuCtx {
  out: (line: string) => void;
  outAll: (lines: string[]) => void;
  /** null が返ったら中断（呼び出し側は即 return） */
  ask: (prompt: string) => Promise<string | null>;
  cfg: StepConfig;
  t: CliText;
  save: (state: GameState) => void;
  /** イベント → 表示行（称号・気配・打診など） */
  applyTitles: (events: ActionEvent[]) => string[];
}

/** オファーIDから表示名を引く（立場・職業どちらもここに混ざる） */
export function offerName(id: string): string {
  return (
    society.standings.find((s) => s.id === id)?.name ??
    society.professions.find((p) => p.id === id)?.name ??
    id
  );
}

/** 「6) 目標と認定」：立場×職業の表示、打診の受諾、人生目標の宣言 */
export async function societyMenu(state: GameState, ctx: MenuCtx): Promise<GameState | null> {
  const { out, ask, cfg, t, save } = ctx;
  const soc = state.society;
  const standingName = society.standings.find((s) => s.id === soc.standing)?.name ?? soc.standing;
  const profName =
    soc.profession === null
      ? "なし"
      : (society.professions.find((p) => p.id === soc.profession)?.name ?? soc.profession);
  const goalName =
    soc.goal === null
      ? "なし"
      : (society.lifeGoals.find((g) => g.id === soc.goal)?.name ?? soc.goal);
  out(tpl(t.text.societyHeader, { standing: standingName, profession: profName, goal: goalName }));

  // 打診の受諾
  if (soc.pendingOffers.length === 0) {
    out(t.text.societyNoOffers);
  } else {
    for (let i = 0; i < soc.pendingOffers.length; i++) {
      const id = soc.pendingOffers[i]!;
      const kind = society.standings.some((s) => s.id === id) ? "立場" : "職業";
      out(tpl(t.text.societyOfferLine, { i: i + 1, name: offerName(id), kind }));
    }
    const oi = await ask(t.text.promptChoice);
    if (oi === null) return null;
    const oiN = Number.parseInt(oi.trim(), 10) - 1;
    if (oiN >= 0 && oiN < soc.pendingOffers.length) {
      const id = soc.pendingOffers[oiN]!;
      const res = step(state, { type: "acceptOffer", id }, cfg);
      out(tpl(t.text.societyAccepted, { name: offerName(id) }));
      save(res.state);
      return res.state;
    }
  }

  // 人生目標の宣言（いま手が届きそうなもの3つを提示）
  const suggestions = suggestGoals(state, cfg.society, 3);
  out(t.text.societyGoalsHeader);
  if (suggestions.length === 0) {
    out(t.text.societyNoGoal);
  } else {
    for (let i = 0; i < suggestions.length; i++) {
      out(tpl(t.text.societyGoalLine, { i: i + 1, name: suggestions[i]!.name }));
    }
    const gi = await ask(t.text.promptChoice);
    if (gi === null) return null;
    const giN = Number.parseInt(gi.trim(), 10) - 1;
    if (giN >= 0 && giN < suggestions.length) {
      const goal = suggestions[giN]!;
      const res = step(state, { type: "declareGoal", id: goal.id }, cfg);
      out(tpl(t.text.societyDeclared, { name: goal.name }));
      save(res.state);
      return res.state;
    }
  }
  return state;
}

/** 「7) 見聞録を読む」：アトム一覧 → 読むと事実・つながりが記録される */
export async function loreMenu(state: GameState, ctx: MenuCtx): Promise<GameState | null> {
  const { out, outAll, ask, cfg, t, save, applyTitles } = ctx;
  out(
    tpl(t.text.loreListHeader, {
      read: state.lore.read.length,
      total: atoms.length,
      facts: state.lore.facts.length,
    }),
  );
  if (atoms.length === 0) {
    out(t.text.loreNone);
    return state;
  }
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!;
    const mark = state.lore.read.includes(a.id) ? "読" : "未";
    out(tpl(t.text.loreLine, { i: i + 1, mark, title: a.title }));
  }
  const li = await ask(t.text.promptChoice);
  if (li === null) return null;
  const liN = Number.parseInt(li.trim(), 10) - 1;
  if (!(liN >= 0 && liN < atoms.length)) return state;
  const a = atoms[liN]!;
  if (state.lore.read.includes(a.id)) {
    out(tpl(t.text.loreRead, { title: a.title, text: a.text }));
    return state;
  }
  const res = step(state, { type: "readAtom", id: a.id }, cfg);
  out(tpl(t.text.loreRead, { title: a.title, text: a.text }));
  outAll(applyTitles(res.events));
  save(res.state);
  return res.state;
}

/** 「8) 街の記録」：作品台帳・称号・見聞録の一覧を眺める（行動を消費しない） */
export function recordsMenu(state: GameState, ctx: MenuCtx): GameState {
  const { out, t } = ctx;
  out(t.text.recordsHeader);
  out(tpl(t.text.recordsLedger, { count: state.ledger.length }));
  if (state.ledger.length === 0) {
    out(t.text.recordsLedgerEmpty);
  } else {
    const recent = state.ledger.slice(-10);
    recent.forEach((w, i) =>
      out(
        tpl(t.text.recordsLedgerLine, {
          i: state.ledger.length - recent.length + i + 1,
          name: w.order ?? w.kind,
          quality: w.quality,
          tier: w.tier,
          value: w.marketValue,
          day: w.day + 1,
        }),
      ),
    );
  }
  const titleNames = state.titles.map(
    (id) => `${titles.titles.find((x) => x.id === id)?.name ?? id}`,
  );
  out(
    tpl(t.text.recordsTitles, {
      titles: titleNames.length ? titleNames.join("、") : "（まだない）",
    }),
  );
  out(
    tpl(t.text.recordsLore, {
      facts: state.lore.facts.length,
      conns: state.lore.connections.length,
    }),
  );
  return state;
}
