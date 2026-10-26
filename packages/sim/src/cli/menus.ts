import {
  bookDaysLeft,
  canAct,
  canApprentice,
  rivalsOf,
  step,
  suggestGoals,
  type ActionEvent,
  type Chronicle,
  type GameState,
  type NotableWork,
  type StepConfig,
} from "@trace/core";
import {
  atoms,
  balance,
  books,
  enemies,
  mentors,
  orders,
  pinnacles,
  rivals,
  skills,
  society,
  titles,
  type CliText,
} from "@trace/content";
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
  /** 伝記の表示行（T-37。cause 省略時は「いまの記録」の途中経過になる） */
  bio?: (state: GameState, cause?: "retire" | "death") => string[];
  /** 年代記を読む（T-38。周回をまたぐので state ではなく別領域から渡す） */
  chronicle: () => Chronicle;
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

/** 「9) 書店」：書物の購入と読書（T-26）。購入は行動を消費せず、読むには1行動使う */
export async function booksMenu(state: GameState, ctx: MenuCtx): Promise<GameState | null> {
  const { out, outAll, ask, cfg, t, save, applyTitles } = ctx;
  const skillName = (id: string) => skills.skills.find((s) => s.id === id)?.name ?? id;
  out(tpl(t.text.bookShopHeader, { money: state.player.money }));
  for (let i = 0; i < books.books.length; i++) {
    const b = books.books[i]!;
    const read = state.books.read.some((r) => r.id === b.id);
    const mark = read ? "読" : state.books.owned.includes(b.id) ? "持" : "―";
    out(tpl(t.text.bookLine, { i: i + 1, mark, name: b.name, price: b.price, desc: b.desc }));
    const daysLeft = bookDaysLeft(state, b);
    if (daysLeft > 0) out(tpl(t.text.bookEffectDays, { days: daysLeft }));
  }
  out(t.text.bookPick);
  const bi = await ask(t.text.promptChoice);
  if (bi === null) return null;
  const biN = Number.parseInt(bi.trim(), 10) - 1;
  if (!(biN >= 0 && biN < books.books.length)) return state;
  const b = books.books[biN]!;

  if (state.books.read.some((r) => r.id === b.id)) {
    out(t.text.bookAlreadyRead);
    return state;
  }
  if (!state.books.owned.includes(b.id)) {
    // 購入：行動は消費しない
    if (state.player.money < b.price) {
      out(t.text.bookTooPoor);
      return state;
    }
    const res = step(state, { type: "buyBook", id: b.id }, cfg);
    out(tpl(t.text.bookBought, { name: b.name }));
    outAll(applyTitles(res.events));
    save(res.state);
    return res.state;
  }
  // 読む：行動を1回消費。行動残が無ければ今日は読めない
  if (!canAct(state.time, cfg.time)) {
    out(t.text.mustSleep);
    return state;
  }
  const res = step(state, { type: "readBook", id: b.id }, cfg);
  out(tpl(t.text.bookRead, { name: b.name, text: b.readText }));
  const ev = res.events.find(
    (e): e is Extract<ActionEvent, { type: "bookRead" }> => e.type === "bookRead",
  );
  for (const r of ev?.recovered ?? []) {
    out(tpl(t.text.bookRecovered, { skill: skillName(r.skill), amount: r.amount }));
  }
  if (ev?.flag !== undefined) out(t.text.bookFlag);
  const daysLeft = bookDaysLeft(res.state, b);
  if (daysLeft > 0) out(tpl(t.text.bookEffectDays, { days: daysLeft }));
  outAll(applyTitles(res.events));
  save(res.state);
  return res.state;
}

/** 「10) 師匠」：弟子入り・稽古・門を出る（T-27。弟子入りは行動を消費せず、稽古は1行動＋礼金） */
export async function mentorMenu(state: GameState, ctx: MenuCtx): Promise<GameState | null> {
  const { out, outAll, ask, cfg, t, save, applyTitles } = ctx;
  const skillName = (id: string) => skills.skills.find((s) => s.id === id)?.name ?? id;

  const current = state.mentor
    ? (mentors.mentors.find((m) => m.id === state.mentor!.id) ?? null)
    : null;

  if (current !== null) {
    // 師匠がいる：稽古か別れを選ぶ
    out(
      tpl(t.text.mentorHeaderCurrent, {
        name: current.name,
        skill: skillName(current.skill),
        days: state.time.day - state.mentor!.sinceDay + 1,
      }),
    );
    out(tpl(t.text.mentorDescLine, { desc: current.desc }));
    out(tpl(t.text.mentorMenuTrain, { fee: current.fee }));
    out(t.text.mentorMenuLeave);
    out(t.text.mentorMenuBack);
    const a = await ask(t.text.promptChoice);
    if (a === null) return null;
    const c = a.trim();
    if (c === "1") {
      // 稽古：1行動＋礼金（難度は訓練と同じく現在値+10を推奨）
      if (!canAct(state.time, cfg.time)) {
        out(t.text.mustSleep);
        return state;
      }
      if (state.player.money < current.fee) {
        out(t.text.bookTooPoor);
        return state;
      }
      const recommended = Math.round(state.player.skills[current.skill]?.value ?? 0) + 10;
      const di = await ask(tpl(t.text.difficultyPrompt, { recommended }));
      if (di === null) return null;
      const difficulty = di.trim() === "" ? recommended : Number.parseInt(di.trim(), 10);
      if (!Number.isFinite(difficulty) || difficulty < 0) {
        out(t.text.invalidInput);
        return state;
      }
      const res = step(state, { type: "trainWithMentor", difficulty }, cfg);
      const gain = res.events.find(
        (e): e is Extract<ActionEvent, { type: "gainApplied" }> => e.type === "gainApplied",
      );
      out(
        tpl(t.text.mentorTrainResult, {
          name: skillName(current.skill),
          difficulty,
          fee: current.fee,
          amount: (gain?.amount ?? 0).toFixed(1),
        }),
      );
      const ev = res.events.find(
        (e): e is Extract<ActionEvent, { type: "mentorTrained" }> => e.type === "mentorTrained",
      );
      for (const r of ev?.recovered ?? []) {
        out(tpl(t.text.bookRecovered, { skill: skillName(r.skill), amount: r.amount }));
      }
      if (ev?.flag !== undefined) out(t.text.mentorSecret);
      outAll(applyTitles(res.events));
      save(res.state);
      return res.state;
    }
    if (c === "2") {
      const res = step(state, { type: "leaveMentor" }, cfg);
      out(tpl(t.text.mentorLeft, { name: current.name }));
      outAll(applyTitles(res.events));
      save(res.state);
      return res.state;
    }
    return state; // 3) 戻る、または読めない入力
  }

  // 師匠がいない：入門条件を満たす師匠の一覧から弟子入りを選ぶ
  out(t.text.mentorHeaderNone);
  for (let i = 0; i < mentors.mentors.length; i++) {
    const m = mentors.mentors[i]!;
    const ok = canApprentice(state, m.id, cfg.mentors, cfg.time);
    out(
      tpl(t.text.mentorListLine, {
        i: i + 1,
        name: m.name,
        skill: skillName(m.skill),
        fee: m.fee,
        mark: ok ? t.text.mentorMarkOk : t.text.mentorMarkNg,
      }),
    );
    out(tpl(t.text.mentorDescLine, { desc: m.desc }));
  }
  const a = await ask(t.text.promptChoice);
  if (a === null) return null;
  const idx = Number.parseInt(a.trim(), 10) - 1;
  if (!(idx >= 0 && idx < mentors.mentors.length)) return state;
  const m = mentors.mentors[idx]!;
  if (!canApprentice(state, m.id, cfg.mentors, cfg.time)) {
    out(t.text.mentorLocked);
    return state;
  }
  const res = step(state, { type: "apprentice", id: m.id }, cfg);
  out(tpl(t.text.mentorApprenticed, { name: m.name }));
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
  // ここまでの記録（T-37 伝記の途中経過プレビュー）
  ctx.bio?.(state).forEach(out);
  // 討伐図鑑（T-44）：kill.species.* / kill.unique.* カウンタから実績一覧を作る
  out(t.text.recordsHunt);
  for (const e of enemies.enemies) {
    const kills = state.counters[`kill.species.${e.id}`] ?? 0;
    const uniques = state.counters[`kill.unique.${e.id}`] ?? 0;
    if (kills === 0) continue;
    out(
      tpl(t.text.recordsHuntLine, {
        name: e.name,
        kills,
        unique: uniques > 0 ? tpl(t.text.recordsHuntUnique, { unique: uniques }) : "",
      }),
    );
  }
  // 深層の自己ベスト（T-43）：abyss.best / abyss.runs カウンタ
  const abyssRuns = state.counters["abyss.runs"] ?? 0;
  out(
    abyssRuns === 0
      ? t.text.recordsAbyssNone
      : tpl(t.text.recordsAbyss, { best: state.counters["abyss.best"] ?? 0, runs: abyssRuns }),
  );
  // ライバル・ランキング（T-47。派生値：state.rng は消費しない）
  const rivalry = rivalsOf(state, rivals, balance.rivals);
  out(t.text.recordsRivals);
  for (const e of rivalry.entries) {
    out(
      tpl(t.text.recordsRivalLine, {
        rank: e.rank,
        name: e.name,
        epithet: e.epithet ? tpl(t.text.recordsRivalEpithet, { epithet: e.epithet }) : "",
        score: e.score,
        you: e.isPlayer ? t.text.recordsRivalYou : "",
      }),
    );
  }
  out(t.text.recordsRivalNote);
  // 年代記（T-38。周回をまたぐ記録。セーブとは別領域に残る）
  chronicleLines(ctx.chronicle(), t).forEach(out);
  return state;
}

/** 作品の表示名：注文名（特別注文は元の注文名）＞スキル名の順（game.ts の workName と同じ解決） */
function notableWorkName(w: NotableWork): string {
  const orderId = w.order?.split("#")[0];
  return orderId
    ? (orders.orders.find((o) => o.id === orderId)?.name ?? w.order ?? w.kind)
    : (skills.skills.find((s) => s.id === w.kind)?.name ?? w.kind);
}

/** 年代記の表示行（街の記録の末尾に出す） */
function chronicleLines(chronicle: Chronicle, t: CliText): string[] {
  const lines: string[] = [tpl(t.text.chronicleHeader, { count: chronicle.lives.length })];
  if (chronicle.lives.length === 0) {
    lines.push(t.text.chronicleEmpty);
    return lines;
  }
  chronicle.lives.forEach((life, i) => {
    const epithet = life.epithet
      ? `《${titles.titles.find((x) => x.id === life.epithet)?.name ?? life.epithet}》`
      : "";
    lines.push(
      tpl(t.text.chronicleLine, {
        i: i + 1,
        name: life.name,
        epithet,
        days: life.daysLived,
        cause: t.display.causeNames[life.cause] ?? life.cause,
      }),
    );
    const standing = society.standings.find((s) => s.id === life.standing)?.name ?? life.standing;
    const profession =
      life.profession === null
        ? "―"
        : (society.professions.find((p) => p.id === life.profession)?.name ?? life.profession);
    lines.push(tpl(t.text.chronicleRole, { standing, profession }));
    if (life.notableWorks.length > 0) {
      lines.push(
        tpl(t.text.chronicleWorks, {
          works: life.notableWorks
            .map((w) => `《${notableWorkName(w)}》品質${w.quality}`)
            .join("、"),
        }),
      );
    }
    // 頂点に至ったルート（T-41）：年代記の頁に刻む
    if (life.pinnacles !== undefined && life.pinnacles.length > 0) {
      lines.push(
        tpl(t.text.chroniclePinnacle, {
          pinnacles: life.pinnacles
            .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
            .join("、"),
        }),
      );
    }
  });
  return lines;
}
