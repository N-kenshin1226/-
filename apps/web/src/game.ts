/**
 * Web 版のゲームセッション層（docs/04 §2：UIはcoreを呼ぶだけ）。
 * ルールはすべて core、数値は content、ここでは画面遷移と表示用の整形だけを行う
 */
import {
  abyssRunSeed,
  activeBookEffects,
  activeEffects,
  appraisalGame,
  biographyMaterial,
  canAct,
  canFightUnique,
  createRng,
  endRun,
  floorEnemy,
  killFloor,
  spendLight,
  startRun,
  enhancedEnemy,
  damageFactor,
  deserialize,
  deserializeChronicle,
  emptyChronicle,
  fishingGame,
  hasLifeRecord,
  legacyOf,
  miningGame,
  negotiationGame,
  newGame,
  nextWorldSeed,
  performanceGame,
  reachedPinnacles,
  recordLife,
  rivalsOf,
  serialize,
  serializeChronicle,
  simpleJudgmentQuality,
  sleepQuality,
  smithingGame,
  startCombat,
  step,
  succeedLife,
  suggestGoals,
  telegraphLines,
  combatResult,
  combatTurn,
  specialOrderOf as coreSpecialOrderOf,
  TENDENCY_IDS,
  TemplateProvider,
  withWorldMods,
  worldFactor,
  worldMods,
  type AbyssRun,
  type ActionEvent,
  type BoardInput,
  type BoardState,
  type Chronicle,
  type CombatAction,
  type CombatState,
  type DealInput,
  type DealState,
  type EnemyDef,
  type GameState,
  type HeirKind,
  type Legacy,
  type LifeCause,
  type MiniGameCtx,
  type NewGameConfig,
  type StepConfig,
  type TendencyId,
  type TimingInput,
  type TimingState,
  type Work,
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
  pinnacles,
  rivals,
  skills,
  society,
  tailwinds,
  titles,
  vows,
  type EnemyJson,
  type Order,
  type Origin,
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
  /** 寿命・加齢（T-36）。文テンプレートは cli.json 由来（rust.texts と同じ注入） */
  aging: {
    ...balance.aging,
    texts: {
      warn: cliText.text.wake.agingWarn,
      severe: cliText.text.wake.agingSevere,
    },
  },
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
  /** 継承（T-39）。遺物の gainVs 係数 */
  legacy: { artifactGainFactor: balance.legacy.artifactGainFactor },
  /** 頂点ルート（T-41。content/pinnacles.json の条件鎖） */
  pinnacles: pinnacles.pinnacles,
  /** 運命の傾向・誓約（T-45/T-46。balance.tendency + vows.json の世界補正表） */
  tendency: balance.tendency,
  vows: vows.vows,
};

/** 運命の傾向の選択肢（T-45。UI で3択を出す用） */
export const tendencyIds = TENDENCY_IDS;
/** 誓約の定義一覧（T-46。UI で複数選択を出す用） */
export const vowList = vows.vows;

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

/** 作品の表示名：注文名（特別注文は元の注文名）＞スキル名の順で解決する */
export function workName(w: Pick<Work, "kind" | "order">): string {
  const orderId = w.order?.split("#")[0];
  return orderId
    ? (orders.orders.find((o) => o.id === orderId)?.name ?? w.order ?? w.kind)
    : (skills.skills.find((s) => s.id === w.kind)?.name ?? w.kind);
}

/**
 * 伝記（T-37）：素材は core（biographyMaterial）が摘み、表示名はここで解決する。
 * cause 省略時は「いまの記録」の途中経過（引退・死亡の行を出さない）
 */
export function bioLines(state: GameState, cause?: "retire" | "death"): string[] {
  const m = biographyMaterial(state, cfg.pinnacles);
  const titleNames = m.titleIds
    .map((id) => titles.titles.find((x) => x.id === id)?.name ?? id)
    .join("、");
  const goalNames = m.achievedGoalIds
    .map((id) => society.lifeGoals.find((g) => g.id === id)?.name ?? id)
    .join("、");
  // 頂点ルート名（T-41）：達成したルートの表示名を繋ぐ
  const pinnacleNames = m.pinnacleIds
    .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
    .join("、");
  return narrator.narrate(
    {
      scene: "biography",
      name: m.name,
      days: m.days,
      deeds: m.deeds,
      origin: origins.origins.find((o) => o.id === m.originId)?.name ?? m.originId,
      standing: society.standings.find((s) => s.id === m.standingId)?.name ?? m.standingId,
      ...(m.professionId !== null
        ? {
            profession:
              society.professions.find((p) => p.id === m.professionId)?.name ?? m.professionId,
          }
        : {}),
      ...(titleNames !== "" ? { titles: titleNames } : {}),
      ...(goalNames !== "" ? { goals: goalNames } : {}),
      ...(m.bestWork !== null
        ? {
            work: {
              name: workName(m.bestWork),
              quality: m.bestWork.quality,
              tier: m.bestWork.tier,
            },
          }
        : {}),
      ...(m.peakSkill !== null
        ? {
            peakSkill: {
              name: skills.skills.find((s) => s.id === m.peakSkill!.id)?.name ?? m.peakSkill.id,
              value: Math.round(m.peakSkill.value * 10) / 10,
            },
          }
        : {}),
      ...(pinnacleNames !== "" ? { pinnacle: pinnacleNames } : {}),
      ...(cause !== undefined ? { cause } : {}),
    },
    // 同じ死には同じ伝記（通算死亡数でシードを分ける）
    createRng(`${state.seed}:bio:${m.days}:${m.deaths}`),
  );
}

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

// 年代記（T-38。周回をまたぐのでセーブとは別キー・別バージョンで保存）
const CHRONICLE_KEY = "trace.chronicle.v1";

export function loadChronicle(): Chronicle {
  try {
    const raw = localStorage.getItem(CHRONICLE_KEY);
    return raw ? deserializeChronicle(raw) : emptyChronicle();
  } catch {
    return emptyChronicle();
  }
}
export function saveChronicle(chronicle: Chronicle): void {
  localStorage.setItem(CHRONICLE_KEY, serializeChronicle(chronicle));
}

/**
 * その周の運命の選び方（T-45/T-46。06 §3C）。
 * tendency 省略時は calm（中立）、vows 省略時は誓約なし
 */
export interface FateChoice {
  tendency?: TendencyId;
  vows?: readonly string[];
}

/** 新規開始・転生で共通の newGame 初期値（出自は呼び出し側で選ぶ） */
const gameInit = (origin: Origin, legacy?: Legacy, fate?: FateChoice): NewGameConfig => ({
  skillIds: skills.skills.map((s) => s.id),
  initialPotential: balance.player.initialPotential,
  origin,
  potentialInitMin: balance.player.potentialInitMin,
  potentialInitMax: balance.player.potentialInitMax,
  initialStatValue: balance.player.initialStatValue,
  initialMoney: balance.player.initialMoney,
  ...(legacy !== undefined ? { legacy } : {}),
  ...(fate?.tendency !== undefined ? { tendency: fate.tendency } : {}),
  ...(fate?.vows !== undefined ? { vows: fate.vows } : {}),
});

/** 新規開始のシード。?seed= で固定できる（e2e・リプレイ用）。それ以外は一意に */
export function newSession(originId?: string, fate?: FateChoice): GameState {
  const param = new URLSearchParams(window.location.search).get("seed");
  const seed = param ?? `web-${Math.random().toString(36).slice(2, 10)}`;
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return newGame(seed, t.text.playerName, gameInit(origin, undefined, fate));
}

/**
 * 転生した周の開始（T-40。06 §1）：新しいシードの世界へ。
 * シードは環境変数・乱数ではなく前世の状態から決定論的に派生する。
 * 生まれ変わった世の傾向と新たな誓約は fate で選ぶ（T-45/T-46）
 */
export function nextLife(
  prev: GameState,
  originId: string | undefined,
  legacy: Legacy,
  fate?: FateChoice,
): GameState {
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return newGame(nextWorldSeed(prev), t.text.playerName, gameInit(origin, legacy, fate));
}

/**
 * 次代を継ぐ周の開始（T-48。06 §1）：同じシードの世界で新キャラを始める。
 * 転生とは別系統で、legacy より弱い引継ぎ（balance.heir の素質補正のみ。
 * 記憶称号・遺物は渡さない）。同じ世界なので傾向は前世のものを継ぎ、
 * 誓約は生ごとの選択として選び直す（D-38）。年代記には刻まない
 */
export function heirLife(
  prev: GameState,
  originId: string | undefined,
  vows?: readonly string[],
): { state: GameState; kind: HeirKind; legacy: Legacy } {
  const origin = origins.origins.find((o) => o.id === originId) ?? origins.origins[0]!;
  return succeedLife(
    prev,
    t.text.playerName,
    gameInit(origin, undefined, {
      tendency: prev.tendency,
      ...(vows !== undefined ? { vows } : {}),
    }),
    balance.heir,
  );
}

/**
 * 一生の終わりを年代記に刻む（T-40）。引退・老衰は冪等：同じ世界・終わり方・
 * 日数・名の頁は二度書かない（転生フローの中断→再開や、再読み込み後の同じ死の
 * 再生で安全）。戦闘死は蘇生して続く別の死なので毎回刻む（T-38 どおり）。
 * 戻り値は「今回書き込んだか」
 */
export function recordLifeEnd(state: GameState, cause: LifeCause, biography: string): boolean {
  const chronicle = loadChronicle();
  if (cause !== "death" && hasLifeRecord(chronicle, state, cause)) return false;
  saveChronicle(
    recordLife(chronicle, state, cause, {
      titleDefs: cfg.titles,
      // 頂点に至ったルートの記録（T-41。伝記とは別に構造化して残す）
      pinnacles: reachedPinnacles(state, cfg.pinnacles ?? []),
      biography,
    }),
  );
  return true;
}

/** 遺物の表示名（Legacy の name は注文IDかスキルIDなので表示名に解決する） */
export function legacyArtifactName(a: { name: string; kind: string }): string {
  return (
    orders.orders.find((o) => o.id === a.name.split("#")[0])?.name ??
    skills.skills.find((s) => s.id === a.name)?.name ??
    skills.skills.find((s) => s.id === a.kind)?.name ??
    a.name
  );
}

/** 継承の自動選択（台帳上位・称号ランク順）と候補一覧。転生画面の初期値に使う */
export function legacyDefaults(prev: GameState): {
  auto: Legacy;
  topWorks: Work[];
} {
  return {
    auto: legacyOf(prev, balance.legacy, { titleDefs: cfg.titles }),
    topWorks: [...prev.ledger]
      .sort((a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day)
      .slice(0, 5),
  };
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
      // 強個体の討伐（T-44）：図鑑に刻んだ旨を1行出す
      case "uniqueDefeated":
        return [
          tpl(t.text.uniqueDefeated, {
            name: enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId,
          }),
        ];
      case "pinnacleStageReached": {
        // 頂点ルートの段（T-41）：通知文は pinnacles.json 側に書かれている
        const notice = pinnacles.pinnacles
          .find((r) => r.id === e.route)
          ?.stages.find((s) => s.id === e.stage)?.notice;
        return [notice ?? `――頂点への段《${e.stage}》に至りました。`];
      }
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
      // 深層ダンジョンのラン結果（T-43）：到達深度と自己ベスト更新を1行ずつ出す
      case "abyssEnded": {
        const lines = [tpl(t.text.abyssResult, { depth: e.depth, best: e.best })];
        if (e.newBest) lines.push(tpl(t.text.abyssBest, { best: e.best }));
        return lines;
      }
      case "moneyPaid":
        return [tpl(t.text.moneyPaid, { amount: e.amount })];
      // 老衰死（T-36）：起床ログに続いて表示する。老いの兆候（oldAgeSign）は
      // report.surprises に既出なのでここでは行を出さない
      case "deathByAge":
        return [tpl(t.text.deathByAge, { age: e.age })];
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
  // 前世の伝説（T-42）：年代記が非空なら最新の人生の名・二つ名が噂に混ざる
  const lastLife = loadChronicle().lives.at(-1);
  const prevLife =
    lastLife === undefined
      ? undefined
      : {
          name: lastLife.name,
          epithet:
            lastLife.epithet === undefined
              ? undefined
              : (titles.titles.find((x) => x.id === lastLife.epithet)?.name ?? lastLife.epithet),
        };
  // ライバルの噂（T-47）：ランキングの筆頭ライバルが話題に混ざる
  const topRival = rivalsOf(state, rivals, balance.rivals).entries.find((e) => !e.isPlayer);
  lines.push(
    ...narrator.narrate(
      {
        scene: "newspaper",
        deeds,
        works,
        deaths,
        ...(prevLife !== undefined ? { prevLife } : {}),
        ...(topRival !== undefined ? { rival: topRival } : {}),
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
export function innCost(inn: (typeof inns)[number], state?: GameState): number {
  const base = balance.sleep.innCost?.[inn] ?? 0;
  // 運命の傾向・誓約の世界補正（T-45/T-46：飢饉の世・高い宿の誓い）。実際の支払いは step 側
  if (state === undefined) return base;
  return Math.round(base * worldFactor(worldMods(state, cfg.tendency, cfg.vows), "innCostFactor"));
}

/**
 * 強化版ユニーク（T-44、06 §3B）：同種を unique.afterKills 体倒すと現れる。
 * 表示名は cli.json の uniqueName テンプレート。戦闘ルールの拡張は core の enhancedEnemy
 */
export type UniqueEnemy = EnemyJson & { uniqueVariant: true };
export function uniqueOf(state: GameState, enemy: EnemyJson): UniqueEnemy | null {
  const u = balance.combat.unique;
  if (u === undefined || !canFightUnique(state, enemy.id, u)) return null;
  return {
    ...enemy,
    ...enhancedEnemy(enemy, u),
    name: tpl(t.text.uniqueName, { name: enemy.name }),
    uniqueVariant: true,
  };
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

/**
 * 深層ダンジョン（T-43、06 §3B）：ランの開始とその層の敵。
 * 敵列は run.seed × floor で決定論的。強化は core の floorEnemy が行う
 */
export function newAbyssRun(state: GameState): AbyssRun {
  return startRun(abyssRunSeed(state.seed, state.counters["abyss.runs"] ?? 0), balance.abyss);
}
export function abyssFloorEnemy(run: AbyssRun): EnemyJson {
  return floorEnemy(run.seed, run.floor, enemies.enemies, balance.abyss);
}
export { endRun, killFloor, spendLight };

export function beginCombat(state: GameState, enemy: EnemyJson): CombatState {
  // 称号・認定職・師匠・読了書物の与ダメージ効果（T-35・T-27・T-26。例《百狼斬り》の damageVs.wolf）
  const fx = damageFactor(
    [
      ...activeEffects(
        state,
        cfg.titles,
        cfg.society.professions,
        cfg.mentors?.mentors,
        cfg.legacy?.artifactGainFactor,
      ),
      ...activeBookEffects(state, cfg.books),
    ],
    enemy.id,
  );
  // 運命の傾向・誓約の世界補正（T-45/T-46。戦乱の世・強敵の誓で敵が強くなる）
  const def = withWorldMods(toEnemyDef(enemy), worldMods(state, cfg.tendency, cfg.vows));
  return startCombat(def, cfg.combat, state.player, fx);
}

export function playCombatTurn(
  cs: CombatState,
  action: CombatAction,
  enemy: EnemyJson,
  state: GameState,
  /** 逃走判定などの乱数源（深層はラン×層で別々に渡す。省略時は日付×行動） */
  seed?: string,
): CombatState {
  const ctx = combatCtx(state);
  // beginCombat と同じ世界補正を敵に掛ける（T-45/T-46。ターン解決も同じ強さでないと不整合）
  const def = withWorldMods(toEnemyDef(enemy), worldMods(state, cfg.tendency, cfg.vows));
  return combatTurn(cs, action, def, cfg.combat, seed === undefined ? ctx : { ...ctx, seed });
}

export { combatResult, telegraphLines, suggestGoals, sleepQuality };
export type { BoardState, CombatState, DealState, TimingState };
export type { Order };
