/**
 * Web 版のゲームセッション層（docs/04 §2：UIはcoreを呼ぶだけ）。
 * ルールはすべて core、数値は content、ここでは画面遷移と表示用の整形だけを行う
 */
import {
  canAct,
  createRng,
  deserialize,
  miningGame,
  negotiationGame,
  newGame,
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
  canon,
  cliText,
  enemies,
  narration,
  orders,
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
  sleep: balance.sleep,
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
  titles: titles.titles.map((x) => ({ id: x.id, rank: x.rank, condition: x.condition })),
};

export const skillList = skills.skills;
export const orderList = orders.orders;
export const enemyList = enemies.enemies;
export const atomList = atoms;
export const societyDefs = society;
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
export function newSession(): GameState {
  const param = new URLSearchParams(window.location.search).get("seed");
  const seed = param ?? `web-${Math.random().toString(36).slice(2, 10)}`;
  return newGame(seed, t.text.playerName, {
    skillIds: skills.skills.map((s) => s.id),
    initialPotential: balance.player.initialPotential,
    initialStatValue: balance.player.initialStatValue,
    initialMoney: balance.player.initialMoney,
  });
}

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
  mining: miningGame(balance.minigame.mining),
  negotiation: negotiationGame(balance.minigame.negotiation),
};

export type MinigameKind = "smithing" | "mining" | "negotiation";

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
  if (kind === "smithing") return engines.smithing.init(ctx);
  if (kind === "mining") return engines.mining.init(ctx);
  return engines.negotiation.init(ctx);
}

export function tickMinigame(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
  input: TimingInput | BoardInput | DealInput,
): TimingState | BoardState | DealState {
  if (kind === "smithing") return engines.smithing.tick(gs as TimingState, input as TimingInput);
  if (kind === "mining") return engines.mining.tick(gs as BoardState, input as BoardInput);
  return engines.negotiation.tick(gs as DealState, input as DealInput);
}

export function minigameResult(
  kind: MinigameKind,
  gs: TimingState | BoardState | DealState,
): { quality: number; flags: string[]; done: boolean; detail: string } {
  if (kind === "smithing") {
    const s = gs as TimingState;
    const r = engines.smithing.result(s);
    return {
      quality: r.quality,
      flags: r.flags,
      done: s.done,
      detail: `${r.hits}/${r.total} 命中`,
    };
  }
  if (kind === "mining") {
    const s = gs as BoardState;
    const r = engines.mining.result(s);
    return {
      quality: r.quality,
      flags: r.flags,
      done: s.done,
      detail: `鉱石 ${r.ores}/${r.oresTotal}`,
    };
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
  return startCombat(toEnemyDef(enemy), cfg.combat, state.player);
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
