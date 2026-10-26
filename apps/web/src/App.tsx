import { useCallback, useEffect, useRef, useState } from "react";
import {
  bookDaysLeft,
  canAct,
  combatResult,
  createRng,
  describe,
  isSkillUnlocked,
  step,
  suggestGoals,
  telegraphLines,
  type ActionEvent,
  type CombatAction,
  type GameState,
  type InnRank,
} from "@trace/core";
import { balance, type EnemyJson } from "@trace/content";
import {
  atomList,
  beginCombat,
  bookList,
  cfg,
  enemyAreas,
  eventLines,
  innCost,
  innQuality,
  inns,
  isBoardKind,
  isTimingKind,
  loadGame,
  minigameResult,
  narrator,
  newSession,
  originList,
  offerName,
  orderList,
  playCombatTurn,
  qualityLabel,
  resetSave,
  saveGame,
  simpleQuality,
  skillList,
  societyDefs,
  specialOrderOf,
  startMinigame,
  t,
  tickMinigame,
  tpl,
  wakeLines,
  type BoardState,
  type CombatState,
  type DealState,
  type MinigameKind,
  type Order,
  type SpecialOrder,
  type TimingState,
} from "./game.js";
import { theme } from "./theme.js";

type Screen =
  | { name: "menu" }
  | { name: "train" }
  | { name: "sleep" }
  | { name: "work" }
  | { name: "workMode"; order: Order }
  | { name: "minigame"; kind: MinigameKind; order: Order }
  | { name: "hunt" }
  | { name: "combat"; enemy: EnemyJson }
  | { name: "lore"; atomId?: string }
  | { name: "book" }
  | { name: "records" }
  | { name: "society" }
  | { name: "status" };

const css = {
  app: {
    minHeight: "100vh",
    background: theme.colors.bg,
    color: theme.colors.text,
    fontFamily: theme.font.family,
    padding: "16px",
    boxSizing: "border-box" as const,
    maxWidth: 720,
    margin: "0 auto",
  },
  panel: {
    background: theme.colors.panel,
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 12,
  },
  btn: {
    background: "#232b34",
    color: theme.colors.text,
    border: `1px solid ${theme.colors.accent}`,
    borderRadius: 6,
    padding: "8px 14px",
    margin: "4px 6px 4px 0",
    fontFamily: theme.font.family,
    fontSize: 15,
    cursor: "pointer",
  },
  btnPrimary: {
    background: theme.colors.accent,
    color: "#101418",
    fontWeight: 700,
  },
  log: {
    fontFamily: theme.font.mono,
    fontSize: 13,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap" as const,
    maxHeight: 340,
    overflowY: "auto" as const,
  },
  dim: { color: theme.colors.textDim },
  sys: { color: theme.colors.system },
  accent: { color: theme.colors.accent },
};

function Btn({
  children,
  primary,
  disabled,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...css.btn,
        ...(primary ? css.btnPrimary : {}),
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(loadGame());
    setLoaded(true);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const push = useCallback((lines: string | string[]) => {
    setLog((l) => [...l, ...(Array.isArray(lines) ? lines : [lines])].slice(-160));
  }, []);

  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;

  /** step を実行し、イベント行と（あれば）起床ログ＋新聞を表示して保存。
      format を渡すと非睡眠時の表示行を上書きできる（例：仕事結果に経験量を添える）。
      ref 経由で現在値を読むため、StrictMode の二重適用を起こさない */
  const act = useCallback(
    (
      command: Parameters<typeof step>[1],
      opts?: { atHome?: boolean; format?: (ev: ActionEvent[]) => string[] },
    ) => {
      const s = stateRef.current;
      if (!s) return;
      const res = step(s, command, cfg);
      const wake = wakeLines(res.state, res.events, opts?.atHome ?? false);
      push(wake.length > 0 ? wake : (opts?.format?.(res.events) ?? eventLines(res.events)));
      saveGame(res.state);
      stateRef.current = res.state;
      setState(res.state);
    },
    [push],
  );

  const startNew = (originId?: string) => {
    const s = newSession(originId);
    saveGame(s);
    setState(s);
    setLog([t.text.banner, "", t.text.intro]);
    setScreen({ name: "menu" });
  };

  if (!loaded) return null;
  if (!state) {
    return (
      <main style={css.app} data-testid="app">
        <h1 style={{ color: theme.colors.accent }}>TRACE</h1>
        <p style={css.sys}>{t.text.intro}</p>
        <p style={css.sys}>{t.text.originPick}</p>
        {originList.map((o) => (
          <Btn
            key={o.id}
            testId={`origin-${o.id.replace("origin.", "")}`}
            onClick={() => startNew(o.id)}
          >
            {o.name}
            <span style={{ color: theme.colors.textDim, fontSize: 12 }}> ― {o.desc}</span>
          </Btn>
        ))}
      </main>
    );
  }

  return (
    <main style={css.app} data-testid="app">
      <StatusHeader state={state} />
      <ScreenView
        state={state}
        screen={screen}
        setScreen={setScreen}
        act={act}
        push={push}
        reset={() => setState(null)}
      />
      <section
        style={{ ...css.panel, ...css.log }}
        data-testid="log"
        ref={logRef}
        aria-live="polite"
      >
        {log.map((l, i) => (
          <div key={i} style={l.startsWith("――") || l.startsWith("━") ? css.sys : {}}>
            {l}
          </div>
        ))}
      </section>
    </main>
  );
}

function StatusHeader({ state }: { state: GameState }) {
  const d = describe(state.time, cfg.time);
  const left = Math.max(0, cfg.time.actionsPerDay - state.time.action);
  const winds = state.today.winds.map((w) => w.label).join(" ／ ");
  return (
    <header style={{ ...css.panel, ...css.dim }} data-testid="status">
      {tpl(t.text.menuHeader, {
        year: d.year + 1,
        season: t.display.seasonNames[d.season] ?? "?",
        day: d.dayOfSeason + 1,
        weekday: t.display.weekdayNames[d.weekday] ?? "?",
        timeOfDay: t.display.timeOfDayNames[d.timeOfDay] ?? "?",
        fatigue: Math.round(state.player.fatigue),
        money: state.player.money,
      })}
      {state.player.overwork.active && <span style={{ color: "#d5736a" }}> ［過労］</span>}
      <div>{winds ? tpl(t.text.menuWinds, { winds }) : t.text.menuNoWind}</div>
      <div>{tpl(t.text.menuActionsLeft, { left, max: cfg.time.actionsPerDay })}</div>
    </header>
  );
}

type Act = (
  c: Parameters<typeof step>[1],
  opts?: { atHome?: boolean; format?: (ev: ActionEvent[]) => string[] },
) => void;

/** 仕事結果の表示行（品質・フラグ・経験・報酬） */
export function workResultLines(
  events: ActionEvent[],
  order: Order,
  quality: number,
  flags: string[],
): string[] {
  const gain = events.find(
    (e): e is Extract<ActionEvent, { type: "gainApplied" }> => e.type === "gainApplied",
  );
  const paid = events.find(
    (e): e is Extract<ActionEvent, { type: "moneyPaid" }> => e.type === "moneyPaid",
  );
  const tierUp = events.find(
    (e): e is Extract<ActionEvent, { type: "tierUp" }> => e.type === "tierUp",
  );
  return [
    tpl(t.text.workResult, {
      name: order.name,
      quality,
      flags: flags.length > 0 ? flags.join("・") : "―",
      amount: (gain?.amount ?? 0).toFixed(1),
    }),
    ...(tierUp ? [tpl(t.text.workResultTier, { tier: tierUp.tier })] : []),
    ...(paid ? [tpl(t.text.moneyPaid, { amount: paid.amount })] : []),
    ...eventLines(
      events.filter(
        (e) => e.type !== "gainApplied" && e.type !== "moneyPaid" && e.type !== "tierUp",
      ),
    ),
  ];
}

function ScreenView(props: {
  state: GameState;
  screen: Screen;
  setScreen: (s: Screen) => void;
  act: Act;
  push: (l: string | string[]) => void;
  reset: () => void;
}) {
  const { state, screen, setScreen, act, push, reset } = props;
  switch (screen.name) {
    case "train":
      return <TrainScreen state={state} act={act} back={() => setScreen({ name: "menu" })} />;
    case "sleep":
      return <SleepScreen state={state} act={act} back={() => setScreen({ name: "menu" })} />;
    case "work":
      return <WorkScreen state={state} setScreen={setScreen} />;
    case "workMode":
      return (
        <WorkModeScreen
          state={state}
          order={screen.order}
          setScreen={setScreen}
          act={act}
          push={push}
        />
      );
    case "minigame":
      return (
        <MinigameScreen
          state={state}
          kind={screen.kind}
          order={screen.order}
          setScreen={setScreen}
          act={act}
        />
      );
    case "hunt":
      return <HuntScreen setScreen={setScreen} />;
    case "combat":
      return (
        <CombatScreen
          state={state}
          enemy={screen.enemy}
          setScreen={setScreen}
          act={act}
          push={push}
        />
      );
    case "lore":
      return <LoreScreen state={state} atomId={screen.atomId} setScreen={setScreen} act={act} />;
    case "book":
      return <BookScreen state={state} act={act} back={() => setScreen({ name: "menu" })} />;
    case "records":
      return <RecordsScreen state={state} back={() => setScreen({ name: "menu" })} />;
    case "society":
      return <SocietyScreen state={state} act={act} back={() => setScreen({ name: "menu" })} />;
    case "status":
      return <StatusScreen state={state} back={() => setScreen({ name: "menu" })} />;
    default:
      return <MenuScreen state={state} setScreen={setScreen} act={act} reset={reset} />;
  }
}

function MenuScreen({
  state,
  setScreen,
  act,
  reset,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
  reset: () => void;
}) {
  const canActNow = canAct(state.time, cfg.time);
  const items: { label: string; s: Screen; needAct: boolean; id: string }[] = [
    { label: "鍛錬", s: { name: "train" }, needAct: true, id: "train" },
    { label: "仕事", s: { name: "work" }, needAct: true, id: "work" },
    { label: "狩りに出る", s: { name: "hunt" }, needAct: true, id: "hunt" },
    { label: "見聞録", s: { name: "lore" }, needAct: false, id: "lore" },
    { label: "書店", s: { name: "book" }, needAct: false, id: "book" },
    { label: "街の記録", s: { name: "records" }, needAct: false, id: "records" },
    { label: "立場・目標", s: { name: "society" }, needAct: false, id: "society" },
    { label: "能力", s: { name: "status" }, needAct: false, id: "status" },
  ];
  return (
    <section style={css.panel} data-testid="menu">
      {items.map((i) => (
        <Btn
          key={i.id}
          testId={`menu-${i.id}`}
          disabled={i.needAct && !canActNow}
          onClick={() => setScreen(i.s)}
        >
          {i.label}
        </Btn>
      ))}
      <Btn
        testId="menu-rest"
        disabled={!canActNow}
        onClick={() => act({ type: "rest" }, { atHome: true })}
      >
        家で休む
      </Btn>
      <Btn primary testId="menu-sleep" onClick={() => setScreen({ name: "sleep" })}>
        寝る
      </Btn>
      <Btn
        testId="menu-quit"
        onClick={() => {
          resetSave();
          reset();
        }}
      >
        記録を消す
      </Btn>
      {!canActNow && <div style={css.sys}>{t.text.mustSleep}</div>}
    </section>
  );
}

// ---- 鍛錬 ----
function TrainScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const sk = skillList.find((s) => s.id === picked);
  return (
    <section style={css.panel} data-testid="screen-train">
      <div>{t.text.skillPick}</div>
      <div>
        {skillList
          .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
          .map((s) => {
            const st = state.player.skills[s.id]!;
            return (
              <Btn key={s.id} testId={`skill-${s.id}`} onClick={() => setPicked(s.id)}>
                {s.name}
                <span style={css.dim}>
                  {" "}
                  {st.value.toFixed(1)}
                  {st.pending > 0 && <span style={css.accent}> +{st.pending.toFixed(1)}</span>}
                </span>
              </Btn>
            );
          })}
      </div>
      {sk && (
        <div style={{ marginTop: 8 }} data-testid="train-difficulty">
          <div style={css.dim}>
            {tpl(t.text.difficultyPrompt, {
              recommended: Math.round(state.player.skills[sk.id]!.value) + 10,
            })}
          </div>
          {[0, 10, 20, 30].map((add) => {
            const diff = Math.round(state.player.skills[sk.id]!.value) + add;
            return (
              <Btn
                key={add}
                testId={`diff-${add}`}
                primary={add === 10}
                onClick={() => act({ type: "train", skill: sk.id, difficulty: diff })}
              >
                難度 {diff}
              </Btn>
            );
          })}
        </div>
      )}
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 寝る ----
function SleepScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const [dinner, setDinner] = useState(true);
  return (
    <section style={css.panel} data-testid="screen-sleep">
      <div>{t.text.innPick}</div>
      <div>
        {inns.map((inn) => {
          const cost = innCost(inn);
          return (
            <Btn
              key={inn}
              testId={`inn-${inn}`}
              disabled={cost > state.player.money}
              onClick={() => {
                act({ type: "sleep", inn: inn as InnRank, dinner });
                back();
              }}
            >
              {t.display.innNames[inn]}
              <span style={css.dim}>
                {" "}
                （質：{qualityLabel(innQuality(inn, dinner))}、{cost}G）
              </span>
            </Btn>
          );
        })}
      </div>
      <div style={{ margin: "8px 0" }}>
        {t.text.dinnerPrompt}{" "}
        <Btn testId="dinner-yes" primary={dinner} onClick={() => setDinner(true)}>
          {t.display.dinnerNames.with}
        </Btn>
        <Btn testId="dinner-no" primary={!dinner} onClick={() => setDinner(false)}>
          {t.display.dinnerNames.without}
        </Btn>
      </div>
      <Btn
        testId="sleep-home"
        onClick={() => {
          act({ type: "rest" }, { atHome: true });
          back();
        }}
      >
        {t.display.homeName}で休む（無料）
      </Btn>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 仕事 ----
/** 注文の kind（スキルID）→ ミニゲームの皮。未対応の kind は交渉に倒す */
const KIND_TO_MINIGAME: Record<string, MinigameKind> = {
  smithing: "smithing",
  performance: "performance",
  fishing: "fishing",
  mining: "mining",
  appraisal: "appraisal",
  eloquence: "negotiation",
};
function kindToMinigame(kind: string): MinigameKind {
  return KIND_TO_MINIGAME[kind] ?? "negotiation";
}

function WorkScreen({ state, setScreen }: { state: GameState; setScreen: (s: Screen) => void }) {
  const special = specialOrderOf(state.seed, state.time.day);
  const list: (Order | SpecialOrder)[] = special ? [...orderList, special] : orderList;
  return (
    <section style={css.panel} data-testid="screen-work">
      <div>{t.text.orderPick}</div>
      {special && <div style={css.sys}>{t.text.specialOrder}</div>}
      <div>
        {list.map((o) => {
          const kind = skillList.find((s) => s.id === o.kind)?.name ?? o.kind;
          return (
            <div key={o.id} style={{ margin: "4px 0" }}>
              <Btn
                testId={`order-${o.id}`}
                onClick={() => setScreen({ name: "workMode", order: o })}
              >
                {o.name}
                <span style={css.dim}>
                  {" "}
                  （{kind}・目標{o.targetQuality}・{o.rewardMoney}G）
                </span>
              </Btn>
            </div>
          );
        })}
      </div>
      <Btn onClick={() => setScreen({ name: "menu" })}>戻る</Btn>
    </section>
  );
}
function WorkModeScreen({
  state,
  order,
  setScreen,
  act,
  push,
}: {
  state: GameState;
  order: Order;
  setScreen: (s: Screen) => void;
  act: Act;
  push: (l: string | string[]) => void;
}) {
  const doSimple = () => {
    const quality = simpleQuality(state, order.kind);
    let expFactor: number | undefined = balance.minigame.simpleExpFactor;
    if ("special" in order && order.special === true) {
      expFactor = (expFactor ?? 1) * (order as SpecialOrder).expFactor;
    }
    push(t.text.workSimple);
    act(
      {
        type: "work",
        kind: order.kind,
        quality,
        difficulty: order.targetQuality,
        order: order.id,
        expFactor,
        rewardMoney: order.rewardMoney,
      },
      { format: (ev) => workResultLines(ev, order, quality, []) },
    );
    setScreen({ name: "menu" });
  };
  return (
    <section style={css.panel} data-testid="screen-workmode">
      <div>
        {order.name} — {order.note}
      </div>
      <div style={{ margin: "8px 0" }}>{t.text.workModePrompt}</div>
      <Btn
        primary
        testId="work-manual"
        onClick={() => setScreen({ name: "minigame", kind: kindToMinigame(order.kind), order })}
      >
        自分でやる
      </Btn>
      <Btn testId="work-simple" onClick={doSimple}>
        まかせる（簡易判定・経験半分）
      </Btn>
      <Btn onClick={() => setScreen({ name: "work" })}>戻る</Btn>
    </section>
  );
}

// ---- ミニゲーム（手動） ----
function MinigameScreen({
  state,
  kind,
  order,
  setScreen,
  act,
}: {
  state: GameState;
  kind: MinigameKind;
  order: Order;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  const [gs, setGs] = useState<TimingState | BoardState | DealState>(() =>
    startMinigame(kind, state),
  );
  const res = minigameResult(kind, gs);
  const startLine = isTimingKind(kind)
    ? tpl(
        kind === "performance"
          ? t.text.performanceStart
          : kind === "fishing"
            ? t.text.fishingStart
            : t.text.workStart,
        { name: order.name, beats: (gs as TimingState).beats.length },
      )
    : isBoardKind(kind)
      ? tpl(kind === "appraisal" ? t.text.appraisalStart : t.text.miningStart, {
          name: order.name,
        })
      : `《${order.name}》`;

  const commit = () => {
    let expFactor: number | undefined;
    if ("special" in order && order.special === true) {
      expFactor = (order as SpecialOrder).expFactor;
    }
    act(
      {
        type: "work",
        kind: order.kind,
        quality: res.quality,
        difficulty: order.targetQuality,
        order: order.id,
        flags: res.flags.length > 0 ? res.flags : undefined,
        expFactor,
        rewardMoney: order.rewardMoney,
      },
      { format: (ev) => workResultLines(ev, order, res.quality, res.flags) },
    );
    setScreen({ name: "menu" });
  };

  return (
    <section style={css.panel} data-testid="minigame">
      <div>{startLine}</div>
      {isTimingKind(kind) && <TimingView kind={kind} gs={gs as TimingState} onTick={setGs} />}
      {isBoardKind(kind) && <BoardView kind={kind} gs={gs as BoardState} onTick={setGs} />}
      {kind === "negotiation" && <NegotiationView gs={gs as DealState} onTick={setGs} />}
      {res.done && (
        <div data-testid="minigame-done" style={{ marginTop: 8 }}>
          <div style={css.accent}>
            {res.detail}（品質 {res.quality}
            {res.flags.length > 0 ? `・${res.flags.join("・")}` : ""}）
          </div>
          <Btn primary testId="minigame-commit" onClick={commit}>
            作品を納める
          </Btn>
        </div>
      )}
      <Btn onClick={() => setScreen({ name: "work" })}>やめる</Btn>
    </section>
  );
}

/** タイミング系の皮の共通画面（鍛冶・演奏・釣り）。拍に合わせて押すだけ */
function TimingView({
  kind,
  gs,
  onTick,
}: {
  kind: MinigameKind;
  gs: TimingState;
  onTick: (s: TimingState) => void;
}) {
  const startRef = useRef<number | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    startRef.current = performance.now();
    const id = setInterval(() => force((x) => x + 1), 50);
    return () => clearInterval(id);
  }, []);
  const elapsed = startRef.current === null ? 0 : performance.now() - startRef.current;
  const next = gs.beats[gs.cursor];
  const near = next !== undefined && Math.abs(elapsed - next) <= gs.halfWidth;
  const beatText =
    kind === "performance"
      ? t.text.performanceBeat
      : kind === "fishing"
        ? t.text.fishingBeat
        : t.text.workBeat;
  const pressLabel =
    kind === "performance"
      ? t.text.performancePress
      : kind === "fishing"
        ? t.text.fishingPress
        : "打つ";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={css.dim}>
        {tpl(beatText, { n: gs.cursor + 1 })}（{gs.hits} 命中 / 判定窓 ±{Math.round(gs.halfWidth)}
        ms）
      </div>
      <div style={{ letterSpacing: 6, fontSize: 20, margin: "8px 0" }}>
        {gs.beats.map((b, i) => (
          <span
            key={i}
            style={{
              color:
                i < gs.cursor
                  ? theme.colors.accent
                  : i === gs.cursor && near
                    ? "#e8e4d8"
                    : theme.colors.textDim,
            }}
          >
            ●
          </span>
        ))}
      </div>
      <Btn
        primary
        testId={`${kind}-hit`}
        disabled={gs.done}
        onClick={() => onTick(tickMinigame(kind, gs, { at: elapsed }) as TimingState)}
      >
        {pressLabel}
      </Btn>
    </div>
  );
}

/** 盤面推理系の皮の共通画面（採掘・鑑定）。マスを1つずつ開く */
function BoardView({
  kind,
  gs,
  onTick,
}: {
  kind: MinigameKind;
  gs: BoardState;
  onTick: (s: BoardState) => void;
}) {
  const startText = kind === "appraisal" ? t.text.appraisalStart : t.text.miningStart;
  const hintText = kind === "appraisal" ? t.text.appraisalHint : t.text.miningHint;
  const foundNoun = kind === "appraisal" ? "真品" : "鉱石";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={css.dim}>
        {gs.lastHint === null
          ? startText
          : tpl(hintText, { radius: gs.hintRadius, n: gs.lastHint })}
        （{foundNoun} {gs.ores}/{gs.oresTotal}）
      </div>
      <div
        data-testid={`${kind}-board`}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gs.width}, 34px)`,
          gap: 3,
          margin: "8px 0",
        }}
      >
        {gs.cells.map((c, i) => {
          const x = i % gs.width;
          const y = Math.floor(i / gs.width);
          const mark = !c.revealed ? "？" : c.kind === "ore" ? "◆" : c.kind === "rock" ? "▲" : "・";
          const color =
            c.kind === "ore" && c.revealed
              ? theme.colors.accent
              : c.kind === "rock" && c.revealed
                ? "#d5736a"
                : theme.colors.textDim;
          return (
            <button
              key={i}
              data-testid={`cell-${x}-${y}`}
              disabled={c.revealed || gs.done}
              onClick={() => onTick(tickMinigame(kind, gs, { x, y }) as BoardState)}
              style={{
                width: 34,
                height: 34,
                background: c.revealed ? "#12161c" : "#232b34",
                color,
                border: `1px solid ${theme.colors.panel}`,
                fontFamily: theme.font.mono,
                cursor: c.revealed ? "default" : "pointer",
              }}
            >
              {mark}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NegotiationView({ gs, onTick }: { gs: DealState; onTick: (s: DealState) => void }) {
  const topicName = (id: string) =>
    balance.minigame.negotiation.topics.find((x) => x.id === id)?.name ?? id;
  return (
    <div style={{ marginTop: 8 }} data-testid="nego">
      <div style={css.dim}>
        {tpl(t.text.negoHp, { player: gs.playerHp, opponent: gs.opponentHp })}（{gs.round}R）
      </div>
      <div>
        {tpl(t.text.negoPreview, {
          preview: gs.preview.map((c) => `${topicName(c.topic)}${c.power}`).join(" / ") || "―",
        })}
      </div>
      <div style={{ margin: "8px 0" }}>{t.text.negoPrompt}</div>
      <div>
        {gs.hand.map((c, i) => (
          <Btn
            key={i}
            testId={`hand-${i}`}
            disabled={gs.done}
            onClick={() => onTick(tickMinigame("negotiation", gs, { hand: i }) as DealState)}
          >
            {topicName(c.topic)} {c.power}
          </Btn>
        ))}
      </div>
    </div>
  );
}

// ---- 狩り（CT戦闘） ----
function HuntScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  return (
    <section style={css.panel} data-testid="screen-hunt">
      <div>{t.text.huntPick}</div>
      {enemyAreas.map(([area, group]) => (
        <div key={area}>
          <div style={css.dim}>{t.display.huntAreas[area] ?? area}</div>
          {group.map((e) => (
            <div key={e.id}>
              <Btn testId={`enemy-${e.id}`} onClick={() => setScreen({ name: "combat", enemy: e })}>
                {e.name}
                <span style={css.dim}>（挑戦差 {e.challenge}）</span>
              </Btn>
            </div>
          ))}
        </div>
      ))}
      <Btn onClick={() => setScreen({ name: "menu" })}>戻る</Btn>
    </section>
  );
}

function CombatScreen({
  state,
  enemy,
  setScreen,
  act,
  push,
}: {
  state: GameState;
  enemy: EnemyJson;
  setScreen: (s: Screen) => void;
  act: Act;
  push: (l: string | string[]) => void;
}) {
  const [cs, setCs] = useState<CombatState>(() => beginCombat(state, enemy));
  const [printed, setPrinted] = useState(0);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!announced) {
      push(tpl(t.text.combatStart, { name: enemy.name }));
      setAnnounced(true);
    }
    const fresh = cs.log.slice(printed);
    if (fresh.length > 0) {
      push(fresh.map((e) => `\u3000${e.text}`));
      setPrinted(cs.log.length);
    }
  }, [cs, printed, announced, enemy.name, push]);

  const doAction = (a: CombatAction) => {
    setCs(playCombatTurn(cs, a, enemy, state));
  };

  const finish = () => {
    const r = combatResult(cs);
    act({
      type: "combat",
      enemyId: enemy.id,
      difficulty: enemy.challenge,
      won: r.won,
      fled: r.fled,
      died: r.died,
    });
    push(r.won ? t.text.combatWon : r.fled ? t.text.combatFled : t.text.combatLost);
    setScreen({ name: "menu" });
  };

  return (
    <section style={css.panel} data-testid="screen-combat">
      <div>
        {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
          <div key={i} style={css.sys}>
            {l}
          </div>
        ))}
      </div>
      <div style={css.dim}>
        {tpl(t.text.combatStatus, {
          playerHp: Math.max(0, cs.playerHp),
          playerMax: cs.playerHpMax,
          enemy: enemy.name,
          enemyHp: Math.max(0, cs.enemyHp),
        })}
      </div>
      {!cs.done ? (
        <div>
          {(
            [
              ["attack", "攻撃"],
              ["defend", "防御"],
              ["observe", "観察"],
              ["flee", "逃げる"],
            ] as const
          ).map(([a, label]) => (
            <Btn key={a} testId={`combat-${a}`} onClick={() => doAction(a)}>
              {label}
            </Btn>
          ))}
        </div>
      ) : (
        <Btn primary testId="combat-finish" onClick={finish}>
          {cs.won ? "勝利を確定" : cs.fled ? "離脱した" : "結果を受け入れる"}
        </Btn>
      )}
      <Btn onClick={() => setScreen({ name: "menu" })}>あきらめる</Btn>
    </section>
  );
}

// ---- 見聞録 ----
function LoreScreen({
  state,
  atomId,
  setScreen,
  act,
}: {
  state: GameState;
  atomId?: string;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  const atom = atomList.find((a) => a.id === atomId);
  const canActNow = canAct(state.time, cfg.time);
  if (atom) {
    const read = state.lore.read.includes(atom.id);
    return (
      <section style={css.panel} data-testid="lore-atom">
        <div style={css.accent}>《{atom.title}》</div>
        <div style={css.dim}>（{atom.kind}）</div>
        {read ? (
          <div style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{atom.text}</div>
        ) : (
          <div style={css.dim}>――まだ読んでいない。読むには1行動を使う。</div>
        )}
        {!read && (
          <Btn
            primary
            testId="lore-read"
            disabled={!canActNow}
            onClick={() => {
              act(
                { type: "readAtom", id: atom.id },
                {
                  format: (ev) => [
                    tpl(t.text.loreRead, { title: atom.title, text: atom.text }),
                    ...eventLines(ev.filter((e) => e.type !== "atomRead")),
                  ],
                },
              );
            }}
          >
            読む（1行動）
          </Btn>
        )}
        <Btn onClick={() => setScreen({ name: "lore" })}>一覧へ</Btn>
      </section>
    );
  }
  return (
    <section style={css.panel} data-testid="screen-lore">
      <div>
        {tpl(t.text.loreListHeader, {
          read: state.lore.read.length,
          total: atomList.length,
          facts: state.lore.facts.length,
        })}
      </div>
      {atomList.length === 0 && <div style={css.dim}>{t.text.loreNone}</div>}
      {atomList.map((a) => (
        <div key={a.id}>
          <Btn testId={`atom-${a.id}`} onClick={() => setScreen({ name: "lore", atomId: a.id })}>
            {state.lore.read.includes(a.id) ? "📖" : "◻"} {a.title}
            <span style={css.dim}>（{a.kind}）</span>
          </Btn>
        </div>
      ))}
      <Btn onClick={() => setScreen({ name: "menu" })}>戻る</Btn>
    </section>
  );
}

// ---- 書店（T-26。書物は購入して持ち、読むと成長効果・潜在回復を得る。読むのに1行動） ----
function BookScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canRead = canAct(state.time, cfg.time);
  return (
    <section style={css.panel} data-testid="screen-book">
      <div>{tpl(t.text.bookShopHeader, { money: state.player.money })}</div>
      {bookList.map((b) => {
        const owned = state.books.owned.includes(b.id);
        const read = state.books.read.some((r) => r.id === b.id);
        const daysLeft = bookDaysLeft(state, b);
        return (
          <div key={b.id} data-testid={`book-${b.id}`} style={{ margin: "10px 0" }}>
            <div>
              <span style={css.accent}>《{b.name}》</span>
              <span style={css.dim}> {b.desc}</span>
            </div>
            {!owned && (
              <div>
                <Btn
                  testId={`book-buy-${b.id}`}
                  disabled={state.player.money < b.price}
                  onClick={() => act({ type: "buyBook", id: b.id })}
                >
                  買う（{b.price}G）
                </Btn>
              </div>
            )}
            {owned && !read && (
              <div>
                <Btn
                  primary
                  testId={`book-read-${b.id}`}
                  disabled={!canRead}
                  onClick={() =>
                    act(
                      { type: "readBook", id: b.id },
                      {
                        format: (ev) => [
                          tpl(t.text.bookRead, { name: b.name, text: b.readText }),
                          ...eventLines(ev),
                        ],
                      },
                    )
                  }
                >
                  読む（1行動）
                </Btn>
                {!canRead && <span style={css.sys}> {t.text.mustSleep}</span>}
              </div>
            )}
            {read && (
              <div style={css.dim}>
                {t.text.bookAlreadyRead}
                {daysLeft > 0 && ` ${tpl(t.text.bookEffectDays, { days: daysLeft })}`}
              </div>
            )}
          </div>
        );
      })}
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 街の記録 ----
function RecordsScreen({ state, back }: { state: GameState; back: () => void }) {
  return (
    <section style={css.panel} data-testid="screen-records">
      <div style={css.accent}>{t.text.recordsHeader}</div>
      <div>{tpl(t.text.recordsLedger, { count: state.ledger.length })}</div>
      {state.ledger.length === 0 && <div style={css.dim}>{t.text.recordsLedgerEmpty}</div>}
      {state.ledger.slice(-10).map((w, i) => (
        <div key={w.id} style={css.dim}>
          {tpl(t.text.recordsLedgerLine, {
            i: i + 1,
            name: skillList.find((s) => s.id === w.kind)?.name ?? w.kind,
            quality: w.quality,
            tier: w.tier,
            value: w.marketValue,
            day: w.day,
          })}
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        {tpl(t.text.recordsTitles, { titles: state.titles.join("、") || "―" })}
      </div>
      <div style={{ marginTop: 8 }}>
        {tpl(t.text.recordsLore, {
          facts: state.lore.facts.length,
          conns: state.lore.connections.length,
        })}
      </div>
      <div style={{ ...css.dim, marginTop: 4 }}>
        {narrator
          .narrate(
            {
              scene: "loreDigest",
              facts: state.lore.facts.length,
              connected: state.lore.connections.length,
            },
            createRng(`${state.seed}:loredigest`),
          )
          .join("")}
      </div>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 立場・目標 ----
function SocietyScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const standing = societyDefs.standings.find((s) => s.id === state.society.standing);
  const profession = societyDefs.professions.find((p) => p.id === state.society.profession);
  const goal = societyDefs.lifeGoals.find((g) => g.id === state.society.goal);
  const offers = state.society.pendingOffers;
  const suggested = suggestGoals(state, cfg.society, 3);
  return (
    <section style={css.panel} data-testid="screen-society">
      <div>
        {tpl(t.text.societyHeader, {
          standing: standing?.name ?? state.society.standing,
          profession: profession?.name ?? "―",
          goal: goal?.name ?? "―",
        })}
      </div>
      {offers.length === 0 ? (
        <div style={css.dim}>{t.text.societyNoOffers}</div>
      ) : (
        offers.map((id, i) => (
          <div key={id}>
            <Btn primary testId={`offer-${id}`} onClick={() => act({ type: "acceptOffer", id })}>
              {tpl(t.text.societyOfferLine, { i: i + 1, name: offerName(id), kind: "" }).trim()}
            </Btn>
          </div>
        ))
      )}
      <div style={{ marginTop: 8 }}>{t.text.societyGoalsHeader}</div>
      {goal ? (
        <div>
          <div>《{goal.name}》を目指しています</div>
          <Btn testId="goal-abandon" onClick={() => act({ type: "abandonGoal" })}>
            取り下げる
          </Btn>
        </div>
      ) : (
        <>
          {suggested.length === 0 && <div style={css.dim}>{t.text.societyNoGoal}</div>}
          {suggested.map((g, i) => (
            <Btn
              key={g.id}
              testId={`goal-${g.id}`}
              onClick={() => act({ type: "declareGoal", id: g.id })}
            >
              {tpl(t.text.societyGoalLine, { i: i + 1, name: g.name })}
            </Btn>
          ))}
        </>
      )}
      <div style={{ marginTop: 8, ...css.dim }}>達成済み：{state.society.achievedGoals.length}</div>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 能力 ----
function StatusScreen({ state, back }: { state: GameState; back: () => void }) {
  return (
    <section style={css.panel} data-testid="screen-status">
      <div style={css.accent}>スキル</div>
      {skillList
        .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
        .map((s) => {
          const st = state.player.skills[s.id]!;
          return (
            <div key={s.id}>
              {s.name} <span style={css.accent}>{st.value.toFixed(1)}</span>
              {st.pending > 0 && <span style={css.dim}>（+{st.pending.toFixed(1)} 未定着）</span>}
              <span style={css.dim}> 素質 {Math.round(st.potential)}</span>
            </div>
          );
        })}
      <div style={{ ...css.accent, marginTop: 8 }}>基礎能力</div>
      {(Object.keys(state.player.stats) as (keyof typeof state.player.stats)[]).map((id) => (
        <div key={id}>
          {t.display.statNames[id] ?? id}{" "}
          <span style={css.accent}>{Math.round(state.player.stats[id])}</span>
          {(state.player.load[id] ?? 0) > 0 && (
            <span style={css.dim}>（負荷 {(state.player.load[id] ?? 0).toFixed(1)}）</span>
          )}
        </div>
      ))}
      <div style={{ marginTop: 8, ...css.dim }}>
        称号：{state.titles.length === 0 ? "―" : state.titles.join("、")}
      </div>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}
