/**
 * Web 版のゲームセッション層（docs/04 §2：UIはcoreを呼ぶだけ）。
 * ルールはすべて core、数値は content、ここでは画面遷移と表示用の整形だけを行う
 */
import {
  activeBookEffects,
  activeEffects,
  appraisalGame,
  canAct,
  createRng,
  damageFactor,
  deserialize,
  fishingGame,
  miningGame,
  negotiationGame,
  newGame,
  performanceGame,
  serialize,
  simpleJudgmentQuality,
  sleepQuality,
  smithingGame,
  startCombat,
  step,
  suggestGoals,
  telegraphLines,
  combatResult,
  combatTurn,
  specialOrderOf as coreSpecialOrderOf,
  TemplateProvider,
  type ActionEvent,
  type BoardInput,
  type BoardState,
  type CombatAction,
  type CombatState,
  type DealInput,
  type DealState,
  type EnemyDef,
  type GameState,
  type MiniGameCtx,
  type StepConfig,
  type TimingInput,
  type TimingState,
} from "@trace/core";
import {
  atoms,
  balance,
  books,
  canon,
  cliText,
  enemies,
  enemiesByArea,
  mentors,
  narration,
  orders,
  origins,
  skills,
  society,
  tailwinds,
  titles,
  type EnemyJson,
  type Order,
} from "@trace/content";

export const t = cliText;

export const cfg: StepConfig = {
  time: balance.time,
  actionLogMax: balance.state.actionLogMax,
  gain: balance.gain,
  sleep: {
    ...balance.sleep,
    rust: {
      ...balance.rust,
      texts: {
        rusted: cliText.text.wake.rusted,
        relearning: cliText.text.wake.relearning,
      },
    },
  },
  tailwind: { defs: tailwinds.tailwinds, ...balance.tailwind },
  body: balance.body,
  ledger: balance.ledger,
  combat: balance.combat,
  society: {
    standings: society.standings,
    professions: society.professions,
    lifeGoals: society.lifeGoals,
    goalRewardFactor: balance.society.goalRewardFactor,
  },
  lore: {
    atoms: atoms.map((a) => ({ id: a.id, reveals: a.reveals, unlock: a.unlock })),
    connections: canon.events
      .filter((e) => e.reward !== null)
      .map((e) => ({ eventId: e.id, facts: e.reward!.facts, flag: e.reward!.flag })),
  },
  titles: titles.titles.map((x) => ({
    id: x.id,
    rank: x.rank,
    condition: x.condition,
    effect: x.effect,
  })),
  skillNames: Object.fromEntries(skills.skills.map((s) => [s.id, s.name])),
  skillUnlocks: skills.skills.flatMap((s) => (s.unlock ? [{ id: s.id, condition: s.unlock }] : [])),
  books: { books: books.books, potentialMax: balance.body.potentialMax },
  mentors: { mentors: mentors.mentors, potentialMax: balance.body.potentialMax },
};

export const skillList = skills.skills;
export const orderList = orders.orders;
export const enemyList = enemies.enemies;
/** 狩り画面用：エリア別の敵グループ（T-23。エリアの並びは出現順） */
export const enemyAreas = enemiesByArea(enemies);
export const atomList = atoms;
export const societyDefs = society;
export const bookList = books.books;
export const mentorList = mentors.mentors;
export const narrator = new TemplateProvider(narration);

const SAVE_KEY = "trace.save.v1";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}
export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(state));
}
export function resetSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/** 新規開始のシード。?seed= で固定できる（e2e・リプレイ用）。それ以外は一意に */
export function newSession(originId?: string): GameState {
  const param = new URLSearchParams(window.location.search).get("seed");
  const seed = param ?? `web-${Math.random().toString(36).slice(2, 10)}`;
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return newGame(seed, t.text.playerName, {
    skillIds: skills.skills.map((s) => s.id),
    initialPotential: balance.player.initialPotential,
    origin,
    potentialInitMin: balance.player.potentialInitMin,
    potentialInitMax: balance.player.potentialInitMax,
    initialStatValue: balance.player.initialStatValue,
    initialMoney: balance.player.initialMoney,
  });
}

export const originList = origins.origins;

export { canAct, step };

export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function offerName(id: string): string {
  return (
    society.standings.find((s) => s.id === id)?.name ??
    society.professions.find((p) => p.id === id)?.name ??
    id
  );
}

/** イベント → 表示行（CLIの applyTitles 相当） */
export function eventLines(events: ActionEvent[]): string[] {
  return events.flatMap((e) => {
    switch (e.type) {
      case "gainApplied": {
        const name = skills.skills.find((s) => s.id === e.skill)?.name ?? e.skill;
        return [`${name} +${e.amount.toFixed(1)}（未定着）`];
      }
      case "titleGained": {
        const def = titles.titles.find((x) => x.id === e.id);
        if (e.suppressed) return [tpl(t.text.titleSuppressed, { name: def?.name ?? e.id })];
        return [def?.message ?? tpl(t.text.titleGainedFallback, { name: def?.name ?? e.id })];
      }
      case "kehai":
        return [t.text.kehai];
      case "skillUnlocked":
        return [
          tpl(t.text.skillUnlocked, {
            name: skills.skills.find((s) => s.id === e.id)?.name ?? e.id,
          }),
        ];
      case "offerReceived":
        return [tpl(t.text.offerReceived, { name: offerName(e.id) })];
      case "offerAccepted":
        return [tpl(t.text.societyAccepted, { name: offerName(e.id) })];
      case "goalDeclared":
        return [
          tpl(t.text.societyDeclared, {
            name: society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id,
          }),
        ];
      case "goalAchieved":
        return [
          tpl(t.text.goalAchieved, {
            name: society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id,
          }),
        ];
      case "factLearned":
        return [
          tpl(t.text.factLearned, {
            text: canon.facts.find((f) => f.id === e.id)?.text ?? e.id,
          }),
        ];
      case "loreConnection":
        return [
          tpl(t.text.loreConnection, {
            name: canon.events.find((x) => x.id === e.id)?.name ?? e.id,
          }),
        ];
      case "moneyPaid":
        return [tpl(t.text.moneyPaid, { amount: e.amount })];
      case "bookBought": {
        const name = books.books.find((b) => b.id === e.id)?.name ?? e.id;
        return [tpl(t.text.bookBought, { name })];
      }
      case "bookRead": {
        const def = books.books.find((b) => b.id === e.id);
        const name = def?.name ?? e.id;
        const lines: string[] = [];
        for (const r of e.recovered) {
          lines.push(
            tpl(t.text.bookRecovered, {
              skill: skills.skills.find((s) => s.id === r.skill)?.name ?? r.skill,
              amount: r.amount,
            }),
          );
        }
        if (e.flag !== undefined) lines.push(t.text.bookFlag);
        if (def?.effect !== undefined && def.durationDays !== undefined) {
          lines.push(tpl(t.text.bookEffectDays, { days: def.durationDays }));
        }
        if (lines.length === 0) lines.push(tpl(t.text.bookReadDone, { name }));
        return lines;
      }
      case "mentorApprenticed": {
        const name = mentors.mentors.find((m) => m.id === e.id)?.name ?? e.id;
        return [tpl(t.text.mentorApprenticed, { name })];
      }
      case "mentorLeft": {
        const name = mentors.mentors.find((m) => m.id === e.id)?.name ?? e.id;
        return [tpl(t.text.mentorLeft, { name })];
      }
      case "mentorTrained": {
        const lines: string[] = [];
        for (const r of e.recovered) {
          lines.push(
            tpl(t.text.bookRecovered, {
              skill: skills.skills.find((s) => s.id === r.skill)?.name ?? r.skill,
              amount: r.amount,
            }),
          );
        }
        if (e.flag !== undefined) lines.push(t.text.mentorSecret);
        return lines;
      }
      case "tierUp":
        return [tpl(t.text.workResultTier, { tier: e.tier })];
      default:
        return [];
    }
  });
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** 睡眠の質の数値 → 表示語（qualityBands。q <= upTo の最初の帯） */
export function qualityLabel(q: number): string {
  const bands = [...t.display.qualityBands].sort((a, b) => a.upTo - b.upTo);
  return (bands.find((b) => q <= b.upTo) ?? bands[bands.length - 1]!).label;
}

/** 起床ログ（CLI wakeBlock と同じ組み立て）＋ 朝の新聞（07 §6：語り層の呼び出し） */
export function wakeLines(state: GameState, events: ActionEvent[], atHome = false): string[] {
  const report = events.find(
    (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
  )?.report;
  if (!report) return [];
  const w = t.text.wake;
  const lines: string[] = [w.header];
  lines.push(
    tpl(w.qualityLine, {
      quality: qualityLabel(report.quality),
      inn: atHome ? t.display.homeName : t.display.innNames[report.inn],
      dinner: !atHome && report.dinner ? t.display.dinnerNames.with : t.display.dinnerNames.without,
    }),
  );
  for (const l of report.lines.filter((x) => x.kind === "skill")) {
    const name = skills.skills.find((s) => s.id === l.id)?.name ?? l.id;
    lines.push(tpl(w.skillLine, { name, from: fmt(l.from), to: fmt(l.to), delta: fmt(l.delta) }));
  }
  const statLines = report.lines.filter((x) => x.kind === "stat");
  if (statLines.length > 0) {
    lines.push(
      statLines
        .map((l) => `${t.display.statNames[l.id] ?? l.id} +${fmt(l.delta)}`)
        .join(w.statJoiner),
    );
  }
  if (report.lines.length === 0) lines.push(w.noChange);
  if (report.restDay) lines.push(w.restDayLine);
  const winds = report.tailwinds.map((x) => x.label).join(" ／ ");
  lines.push(winds ? tpl(w.windsLine, { winds }) : w.windsNone);
  for (const s of report.surprises) lines.push(s);
  for (const m of eventLines(events)) lines.push(m);
  lines.push(w.footer);

  const slept = events.find(
    (e): e is Extract<ActionEvent, { type: "slept" }> => e.type === "slept",
  );
  const day = slept?.from.day ?? 0;
  const deeds = state.actionLog.filter((a) => a.day === day).map((a) => a.kind);
  // 台帳由来の記事：その日に記録された作品を新聞の材料にする（03 §5）。
  // 表示名は注文名（特別注文は元の注文名）＞スキル名の順で解決する
  const works = state.ledger
    .filter((w) => w.day === day)
    .map((w) => {
      const orderId = w.order?.split("#")[0];
      const name = orderId
        ? (orders.orders.find((o) => o.id === orderId)?.name ?? w.order ?? w.kind)
        : (skills.skills.find((s) => s.id === w.kind)?.name ?? w.kind);
      return { name, quality: w.quality, tier: w.tier };
    });
  const deaths = state.counters["death.count"] ?? 0;
  const title = events.find(
    (e): e is Extract<ActionEvent, { type: "titleGained" }> =>
      e.type === "titleGained" && !e.suppressed,
  );
  const offer = events.find(
    (e): e is Extract<ActionEvent, { type: "offerReceived" }> => e.type === "offerReceived",
  );
  lines.push(
    ...narrator.narrate(
      {
        scene: "newspaper",
        deeds,
        works,
        deaths,
        ...(title
          ? { newTitle: titles.titles.find((x) => x.id === title.id)?.name ?? title.id }
          : {}),
        ...(offer ? { newOffer: offerName(offer.id) } : {}),
      },
      createRng(`${state.seed}:news:${day}`),
    ),
  );
  return lines;
}

/** 宿の質プレビュー・料金（寝る画面用） */
export const inns = ["cheap", "normal", "good"] as const;
export function innQuality(inn: (typeof inns)[number], dinner: boolean): number {
  return sleepQuality(inn, dinner, balance.sleep);
}
export function innCost(inn: (typeof inns)[number]): number {
  return balance.sleep.innCost?.[inn] ?? 0;
}

/** その日の特別注文（街の出来事。判定は core/src/town、コンテンツはここで注入） */
export interface SpecialOrder extends Order {
  expFactor: number;
  special: true;
}
export function specialOrderOf(seed: string, day: number): SpecialOrder | null {
  return coreSpecialOrderOf(seed, day, orders.orders, {
    chance: balance.town.specialOrderChance,
    expFactor: balance.town.specialOrderExpFactor,
    rewardFactor: balance.town.specialOrderRewardFactor,
    qualityFactor: balance.town.specialOrderQualityFactor,
  }) as SpecialOrder | null;
}

// ---- ミニゲーム（手動プレイ） ----
export const engines = {
  smithing: smithingGame(balance.minigame.smithing),
  performance: performanceGame(balance.minigame.performance),
  fishing: fishingGame(balance.minigame.fishing),
  mining: miningGame(balance.minigame.mining),
  appraisal: appraisalGame(balance.minigame.appraisal),
  negotiation: negotiationGame(balance.minigame.negotiation),
};

export type MinigameKind =
  "smithing" | "performance" | "fishing" | "mining" | "appraisal" | "negotiation";

/** タイミングエンジンの皮（鍛冶・演奏・釣り） */
const TIMING_KINDS = new Set<MinigameKind>(["smithing", "performance", "fishing"]);
/** 盤面推理エンジンの皮（採掘・鑑定） */
const BOARD_KINDS = new Set<MinigameKind>(["mining", "appraisal"]);
export const isTimingKind = (k: MinigameKind): boolean => TIMING_KINDS.has(k);
export const isBoardKind = (k: MinigameKind): boolean => BOARD_KINDS.has(k);

function timingEngineOf(kind: MinigameKind) {
  if (kind === "performance") return engines.performance;
  if (kind === "fishing") return engines.fishing;
  return engines.smithing;
}
function boardEngineOf(kind: MinigameKind) {
  return kind === "appraisal" ? engines.appraisal : engines.mining;
}

function minigameCtx(state: GameState, kind: MinigameKind): MiniGameCtx {
  const skillId = kind === "negotiation" ? "eloquence" : kind;
  return {
    skill: state.player.skills[skillId]?.value ?? 0,
    skills: Object.fromEntries(Object.entries(state.player.skills).map(([k, v]) => [k, v.value])),
    seed: `${state.seed}:${kind}:${state.time.day}:${state.time.action}`,
  };
}

export function startMinigame(
  kind: MinigameKind,
  state: GameState,
): TimingState | BoardState | DealState {
  const ctx = minigameCtx(state, kind);
  if (BOARD_KINDS.has(kind)) return boardEngineOf(kind).init(ctx);
  if (kind === "negotiation") return engines.negotiation.init(ctx);
  return timingEngineOf(kind).init(ctx);
}

export function tickMinigame(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
  input: TimingInput | BoardInput | DealInput,
): TimingState | BoardState | DealState {
  if (BOARD_KINDS.has(kind)) return boardEngineOf(kind).tick(gs as BoardState, input as BoardInput);
  if (kind === "negotiation") return engines.negotiation.tick(gs as DealState, input as DealInput);
  return timingEngineOf(kind).tick(gs as TimingState, input as TimingInput);
}

export function minigameResult(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
): { quality: number; flags: string[]; done: boolean; detail: string } {
  if (TIMING_KINDS.has(kind)) {
    const s = gs as TimingState;
    const r = timingEngineOf(kind).result(s);
    const detail =
      kind === "performance"
        ? tpl(t.text.performanceDetail, { hits: r.hits, total: r.total })
        : kind === "fishing"
          ? tpl(t.text.fishingDetail, { hits: r.hits, total: r.total })
          : `${r.hits}/${r.total} 命中`;
    return { quality: r.quality, flags: r.flags, done: s.done, detail };
  }
  if (BOARD_KINDS.has(kind)) {
    const s = gs as BoardState;
    const r = boardEngineOf(kind).result(s);
    const detail =
      kind === "appraisal"
        ? tpl(t.text.appraisalDetail, { found: s.ores, total: s.oresTotal })
        : `鉱石 ${s.ores}/${s.oresTotal}`;
    return { quality: r.quality, flags: r.flags, done: s.done, detail };
  }
  const s = gs as DealState;
  const r = engines.negotiation.result(s);
  return {
    quality: r.quality,
    flags: r.flags,
    done: s.done,
    detail: r.won ? `交渉成立（${r.rounds} ラウンド）` : "交渉決裂",
  };
}

/** 簡易判定（03 §2） */
export function simpleQuality(state: GameState, kind: string): number {
  const hist = state.ledger
    .filter((w) => w.kind === kind)
    .slice(-balance.minigame.simpleHistorySize)
    .map((w) => w.quality);
  return simpleJudgmentQuality(hist, state.player.skills[kind]?.value ?? 0);
}

// ---- 戦闘 ----
function toEnemyDef(e: EnemyJson): EnemyDef {
  return {
    id: e.id,
    name: e.name,
    hp: e.hp,
    intervalTicks: e.intervalTicks,
    challenge: e.challenge,
    agility: e.agility,
    attack: e.attack,
    moves: e.moves,
    pattern: e.pattern,
  };
}

function combatCtx(state: GameState): MiniGameCtx {
  return {
    skill: state.player.skills.swordplay?.value ?? 0,
    skills: { observation: state.player.skills.observation?.value ?? 0 },
    seed: `${state.seed}:combat:${state.time.day}:${state.time.action}`,
  };
}

export function beginCombat(state: GameState, enemy: EnemyJson): CombatState {
  // 称号・認定職・師匠・読了書物の与ダメージ効果（T-35・T-27・T-26。例《百狼斬り》の damageVs.wolf）
  const fx = damageFactor(
    [
      ...activeEffects(state, cfg.titles, cfg.society.professions, cfg.mentors?.mentors),
      ...activeBookEffects(state, cfg.books),
    ],
    enemy.id,
  );
  return startCombat(toEnemyDef(enemy), cfg.combat, state.player, fx);
}

export function playCombatTurn(
  cs: CombatState,
  action: CombatAction,
  enemy: EnemyJson,
  state: GameState,
): CombatState {
  return combatTurn(cs, action, toEnemyDef(enemy), cfg.combat, combatCtx(state));
}

export { combatResult, telegraphLines, suggestGoals, sleepQuality };
export type { BoardState, CombatState, DealState, TimingState };
export type { Order };
