import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bookDaysLeft,
  canAct,
  canApprentice,
  combatResult,
  createRng,
  describe,
  heirGenerationOf,
  heirKindOf,
  isSkillUnlocked,
  legacyOf,
  rivalsOf,
  step,
  suggestGoals,
  telegraphLines,
  type AbyssRun,
  type ActionEvent,
  type CombatAction,
  type GameState,
  type InnRank,
} from "@trace/core";
import { balance, enemies, pinnacles, rivals, titles, type EnemyJson } from "@trace/content";
import {
  abyssFloorEnemy,
  atomList,
  beginCombat,
  bioLines,
  bookList,
  cfg,
  endRun,
  enemyAreas,
  eventLines,
  heirLife,
  killFloor,
  newAbyssRun,
  spendLight,
  innCost,
  innQuality,
  inns,
  isBoardKind,
  isTimingKind,
  legacyArtifactName,
  legacyDefaults,
  loadChronicle,
  loadGame,
  mentorList,
  minigameResult,
  narrator,
  newSession,
  nextLife,
  originList,
  offerName,
  orderList,
  playCombatTurn,
  qualityLabel,
  recordLifeEnd,
  resetSave,
  saveGame,
  simpleQuality,
  skillList,
  societyDefs,
  specialOrderOf,
  startMinigame,
  t,
  tendencyIds,
  tickMinigame,
  tpl,
  uniqueOf,
  vowList,
  wakeLines,
  workName,
  type BoardState,
  type CombatState,
  type DealState,
  type FateChoice,
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
  /** 深層ダンジョン（T-43）：層を下る連戦。進行は AbyssRun が持つ */
  | { name: "abyss" }
  | { name: "lore"; atomId?: string }
  | { name: "book" }
  | { name: "records" }
  | { name: "society" }
  | { name: "mentor" }
  | { name: "status" }
  /** 引退の確認（T-40） */
  | { name: "retire" }
  /** 生の継ぎ方の選択（T-48）：転生（新しい世界）か次代（同じ世界）か */
  | { name: "succession"; prev: GameState; cause: "retire" | "oldAge" }
  /** 一生の終わり画面（T-40）：伝記＋継承の選択＋新しい生の出自 */
  | { name: "rebirth"; prev: GameState; cause: "retire" | "oldAge" }
  /** 次代を継ぐ画面（T-48）：同じ世界 seed で新キャラ。弱い引継ぎ・年代記には刻まない */
  | { name: "heir"; prev: GameState; cause: "retire" | "oldAge" };

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

/**
 * 運命の傾向（T-45）と誓約（T-46）の選択 UI（06 §3C）。
 * 新規開始画面・転生画面で共通。ルールは core、ここでは選んだ値を渡すだけ
 */
function FatePickers({ fate, setFate }: { fate: FateChoice; setFate: (f: FateChoice) => void }) {
  const tendency = fate.tendency ?? "calm";
  const pickedVows = fate.vows ?? [];
  return (
    <>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.tendencyPick}</div>
      <div data-testid="fate-tendency">
        {tendencyIds.map((id) => (
          <Btn
            key={id}
            testId={`tendency-${id}`}
            primary={tendency === id}
            onClick={() => setFate({ ...fate, tendency: id })}
          >
            {t.display.tendencyNames[id] ?? id}
            <span style={css.dim}> ― {t.display.tendencyDescs[id] ?? ""}</span>
          </Btn>
        ))}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.vowPick}</div>
      <div data-testid="fate-vows">
        {vowList.map((v) => (
          <Btn
            key={v.id}
            testId={`vow-${v.id}`}
            primary={pickedVows.includes(v.id)}
            onClick={() =>
              setFate({
                ...fate,
                vows: pickedVows.includes(v.id)
                  ? pickedVows.filter((x) => x !== v.id)
                  : [...pickedVows, v.id],
              })
            }
          >
            {v.name}
            <span style={css.dim}> ― {v.desc}</span>
          </Btn>
        ))}
      </div>
    </>
  );
}

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const g = loadGame();
    // 老衰したまま残ったセーブは転生画面から再開する（T-40。戦闘死は蘇生済みなので
    // death.count ではなく老衰死の刻印 death.oldAge で判定する）
    if (g !== null && g.counters["death.oldAge"] !== undefined) {
      // 継ぎ方はここで選ぶ（T-48。転生を選んだ時点で年代記に刻まれる。
      // T-40 以前に死んだセーブも転生を選べば救える。recordLifeEnd は冪等）
      setScreen({ name: "succession", prev: g, cause: "oldAge" });
    }
    setState(g);
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
      if (res.events.some((e) => e.type === "deathByAge")) {
        // 老衰死（T-40・D-31）：教会蘇生はしない。起床ログ＋伝記を表示し、
        // 生の継ぎ方を選ぶ画面へ（T-48。年代記への記録は転生を選んだ時点で行う）。
        // このままでは遊び続けられない
        const bio = bioLines(res.state, "death");
        const wake = wakeLines(res.state, res.events, opts?.atHome ?? false);
        push([...wake, ...bio]);
        saveGame(res.state);
        stateRef.current = res.state;
        setState(res.state);
        setScreen({ name: "succession", prev: res.state, cause: "oldAge" });
        return;
      }
      // 年代記への追記（T-38。戦闘死＝教会で蘇生する死。老衰死は上で転生へ回す）
      if (res.events.some((e) => e.type === "died")) {
        recordLifeEnd(res.state, "death", bioLines(res.state, "death").join("\n"));
      }
      const wake = wakeLines(res.state, res.events, opts?.atHome ?? false);
      push(wake.length > 0 ? wake : (opts?.format?.(res.events) ?? eventLines(res.events)));
      saveGame(res.state);
      stateRef.current = res.state;
      setState(res.state);
    },
    [push],
  );

  // 新規開始画面で選ぶ運命（T-45/T-46）：傾向と誓約。既定は穏やかな世＋誓約なし
  const [fate, setFate] = useState<FateChoice>({ tendency: "calm", vows: [] });

  const startNew = (originId?: string) => {
    const s = newSession(originId, fate);
    saveGame(s);
    setState(s);
    setLog([t.text.banner, "", t.text.intro]);
    setScreen({ name: "menu" });
  };

  /** 引退の確認に応答する（T-40。06 §1：引退はいつでも選べる。確認は1回） */
  const retire = useCallback(
    (confirmed: boolean) => {
      if (!confirmed) {
        push(t.text.retireCancelled);
        setScreen({ name: "menu" });
        return;
      }
      const s = stateRef.current;
      if (!s) return;
      const res = step(s, { type: "retire" }, cfg);
      // 伝記を開き、生の継ぎ方（転生か次代か）を選ぶ画面へ（T-48）。
      // 年代記への記録は転生を選んだ時点で行う
      const bio = bioLines(res.state, "retire");
      push(bio);
      saveGame(res.state);
      stateRef.current = res.state;
      setState(res.state);
      setScreen({ name: "succession", prev: res.state, cause: "retire" });
    },
    [push],
  );

  /** 転生画面の確定（T-40）：選んだ記憶・遺物・出自と運命で次の周を始める（T-45/T-46） */
  const born = useCallback(
    (
      prev: GameState,
      originId: string,
      rememberedTitles: string[],
      artifactId: string | undefined,
      fate: FateChoice,
    ) => {
      const legacy = legacyOf(prev, balance.legacy, {
        titleDefs: cfg.titles,
        rememberedTitles,
        ...(artifactId !== undefined ? { artifactId } : {}),
      });
      const next = nextLife(prev, originId, legacy, fate);
      saveGame(next);
      stateRef.current = next;
      setState(next);
      const lines = [t.text.rebirthStart];
      const bonus = Object.entries(legacy.potentialBonus)
        .map(([id, v]) => `《${skillList.find((sk) => sk.id === id)?.name ?? id}》+${v}`)
        .join("、");
      if (bonus !== "") lines.push(tpl(t.text.rebirthPotential, { skills: bonus }));
      if (legacy.rememberedTitles.length > 0) {
        lines.push(
          tpl(t.text.rebirthMemory, {
            titles: legacy.rememberedTitles
              .map((id) => titles.titles.find((x) => x.id === id)?.name ?? id)
              .join("、"),
          }),
        );
      }
      if (legacy.artifact !== null) {
        lines.push(tpl(t.text.rebirthArtifact, { name: legacyArtifactName(legacy.artifact) }));
      }
      push(lines);
      setScreen({ name: "menu" });
    },
    [push],
  );

  /**
   * 生の継ぎ方の選択（T-48、06 §1）：転生なら年代記に1頁刻んで（冪等）転生画面へ、
   * 次代なら刻まず（同じ世界）次代画面へ
   */
  const chooseWay = useCallback(
    (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => {
      if (way === "rebirth") {
        const bio = bioLines(prev, cause === "retire" ? "retire" : "death");
        recordLifeEnd(prev, cause, bio.join("\n"));
        setScreen({ name: "rebirth", prev, cause });
      } else {
        setScreen({ name: "heir", prev, cause });
      }
    },
    [],
  );

  /** 次代画面の確定（T-48）：同じ世界 seed で新しい生を始める。年代記には刻まない */
  const heirBorn = useCallback(
    (prev: GameState, originId: string, vows: readonly string[]) => {
      const { state: next, kind, legacy } = heirLife(prev, originId, vows);
      saveGame(next);
      stateRef.current = next;
      setState(next);
      const lines = [
        tpl(t.text.heirStart, {
          kind: t.display.heirKindNames[kind] ?? kind,
          gen: heirGenerationOf(next),
        }),
        t.text.heirNoChronicle,
      ];
      const bonus = Object.entries(legacy.potentialBonus)
        .map(([id, v]) => `《${skillList.find((sk) => sk.id === id)?.name ?? id}》+${v}`)
        .join("、");
      if (bonus !== "") lines.push(tpl(t.text.heirPotential, { skills: bonus }));
      push(lines);
      setScreen({ name: "menu" });
    },
    [push],
  );

  if (!loaded) return null;
  if (!state) {
    // 年代記はセーブとは別領域に残る（T-38。新しい周の始まりでも見える）
    const lives = loadChronicle().lives.length;
    return (
      <main style={css.app} data-testid="app">
        <h1 style={{ color: theme.colors.accent }}>TRACE</h1>
        <p style={css.sys}>{t.text.intro}</p>
        {lives > 0 && <p style={css.sys}>{tpl(t.text.chronicleLives, { count: lives })}</p>}
        <FatePickers fate={fate} setFate={setFate} />
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
        onRetire={retire}
        onBorn={born}
        onChooseWay={chooseWay}
        onHeirBorn={heirBorn}
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
        age: d.age,
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
  onRetire: (confirmed: boolean) => void;
  onBorn: (
    prev: GameState,
    originId: string,
    rememberedTitles: string[],
    artifactId: string | undefined,
    fate: FateChoice,
  ) => void;
  onChooseWay: (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => void;
  onHeirBorn: (prev: GameState, originId: string, vows: readonly string[]) => void;
}) {
  const { state, screen, setScreen, act, push, reset, onRetire, onBorn, onChooseWay, onHeirBorn } =
    props;
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
      return <HuntScreen state={state} setScreen={setScreen} />;
    case "abyss":
      return (
        <AbyssScreen state={state} act={act} push={push} back={() => setScreen({ name: "menu" })} />
      );
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
    case "mentor":
      return <MentorScreen state={state} act={act} back={() => setScreen({ name: "menu" })} />;
    case "status":
      return <StatusScreen state={state} back={() => setScreen({ name: "menu" })} />;
    case "retire":
      return <RetireScreen onRetire={onRetire} />;
    case "succession":
      return <SuccessionScreen prev={screen.prev} cause={screen.cause} onChoose={onChooseWay} />;
    case "rebirth":
      return <RebirthScreen prev={screen.prev} cause={screen.cause} onBorn={onBorn} />;
    case "heir":
      return <HeirScreen prev={screen.prev} cause={screen.cause} onBorn={onHeirBorn} />;
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
    // 深層に潜る（T-43、06 §3B）：行動1つでランを開始する
    { label: "深層に潜る", s: { name: "abyss" }, needAct: true, id: "abyss" },
    { label: "見聞録", s: { name: "lore" }, needAct: false, id: "lore" },
    { label: "書店", s: { name: "book" }, needAct: false, id: "book" },
    { label: "街の記録", s: { name: "records" }, needAct: false, id: "records" },
    { label: "立場・目標", s: { name: "society" }, needAct: false, id: "society" },
    { label: "師匠", s: { name: "mentor" }, needAct: false, id: "mentor" },
    { label: "能力", s: { name: "status" }, needAct: false, id: "status" },
    // 引退（T-40）：いつでも選べて行動は消費しない
    { label: "引退する", s: { name: "retire" }, needAct: false, id: "retire" },
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
          const cost = innCost(inn, state);
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
function HuntScreen({ state, setScreen }: { state: GameState; setScreen: (s: Screen) => void }) {
  return (
    <section style={css.panel} data-testid="screen-hunt">
      <div>{t.text.huntPick}</div>
      {enemyAreas.map(([area, group]) => (
        <div key={area}>
          <div style={css.dim}>{t.display.huntAreas[area] ?? area}</div>
          {group.map((e) => {
            const ue = uniqueOf(state, e);
            return (
              <div key={e.id}>
                <Btn
                  testId={`enemy-${e.id}`}
                  onClick={() => setScreen({ name: "combat", enemy: e })}
                >
                  {e.name}
                  <span style={css.dim}>（挑戦差 {e.challenge}）</span>
                </Btn>
                {ue !== null && (
                  <Btn
                    testId={`enemy-${e.id}-unique`}
                    onClick={() => setScreen({ name: "combat", enemy: ue })}
                  >
                    {ue.name}
                    <span style={css.dim}>（挑戦差 {ue.challenge}）</span>
                  </Btn>
                )}
              </div>
            );
          })}
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
      // 強化版ユニークを倒したか（T-44）。enemy.id は素の種のまま
      ...("uniqueVariant" in enemy && enemy.uniqueVariant ? { unique: true } : {}),
    });
    push(r.won ? t.text.combatWon : r.fled ? t.text.combatFled : t.text.combatLost);
    // 死亡時は伝記が生成される（06 §1。蘇生するが記録は残る）
    if (r.died) {
      push(bioLines(state, "death"));
      // 伝記 → 年代記への記録（T-38。実際の追記は act 内で died イベントを見て行う）
      push(t.text.chronicleRecorded);
    }
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

/**
 * 深層ダンジョン（T-43、06 §3B）：層を下る連戦。
 * ランの進行（層・灯り・撃破）は core/abyss の AbyssRun、戦闘UIは狩りと同じ枠組み。
 * 終了時に step の abyss コマンドでまとめて世界に反映する
 */
function AbyssScreen({
  state,
  act,
  push,
  back,
}: {
  state: GameState;
  act: Act;
  push: (l: string | string[]) => void;
  back: () => void;
}) {
  const [run, setRun] = useState<AbyssRun>(() => newAbyssRun(state));
  const [cs, setCs] = useState<CombatState | null>(null);
  /** 現在戦っている層の敵（撃破で run.floor が進んでも表示が変わらないよう保持する） */
  const [enemy, setEnemy] = useState<EnemyJson | null>(null);
  const [loss, setLoss] = useState<{ enemyId: string; difficulty: number } | null>(null);
  const [printed, setPrinted] = useState(0);

  // 戦闘ログは出た分だけ追記する
  useEffect(() => {
    if (cs === null) return;
    const fresh = cs.log.slice(printed);
    if (fresh.length > 0) {
      push(fresh.map((e) => `\u3000${e.text}`));
      setPrinted(cs.log.length);
    }
  }, [cs, printed, push]);

  const endLine = (end: NonNullable<AbyssRun["end"]>) =>
    end === "light"
      ? t.text.abyssLightOut
      : end === "retreat"
        ? t.text.abyssRetreat
        : end === "fled"
          ? t.text.combatFled
          : t.text.combatLost;

  const dive = () => {
    const e = abyssFloorEnemy(run);
    push(tpl(t.text.abyssFloor, { floor: run.floor }));
    push(tpl(t.text.combatStart, { name: e.name }));
    setEnemy(e);
    setCs(beginCombat(state, e));
    setPrinted(0);
  };

  const doAction = (a: CombatAction) => {
    if (cs === null || cs.done || run.done || enemy === null) return;
    // 逃走判定の乱数はラン×層で分ける（同じ行動時刻の連戦で同じ結果にしない）
    const next = playCombatTurn(cs, a, enemy, state, `${run.seed}:f${run.floor}`);
    setCs(next);
    const r = combatResult(next);
    let cur = { ...run, kills: [...run.kills] };
    if (r.won) {
      // 最後の灯りで倒しても層は刻む（灯り切れはそのあとで閉じる）
      cur = killFloor(cur, { enemyId: enemy.id, difficulty: enemy.challenge });
    }
    cur = spendLight(cur);
    if (r.died) {
      cur = endRun(cur, "died");
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
    } else if (r.fled) {
      cur = endRun(cur, "fled");
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
    } else if (!r.won && cur.done) {
      // 灯り切れで未決着のまま中断した層
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
    }
    if (cur.done && cur.end !== null) push(endLine(cur.end));
    setRun(cur);
  };

  /** 層の合間の引き返し（戦闘中の離脱は「逃げる」） */
  const retreat = () => {
    const cur = endRun(run, "retreat");
    push(endLine("retreat"));
    setRun(cur);
  };

  const commit = () => {
    const end = run.end ?? "retreat";
    act(
      {
        type: "abyss",
        end,
        kills: run.kills,
        ...(loss !== null ? { loss } : {}),
      },
      {
        format: (ev) => [
          ...eventLines(ev),
          // 深層での死も教会蘇生の扱いは同じ（03 §4）。伝記を残す
          ...(end === "died" ? [...bioLines(state, "death"), t.text.chronicleRecorded] : []),
        ],
      },
    );
    back();
  };

  return (
    <section style={css.panel} data-testid="screen-abyss">
      <div>
        {tpl(t.text.abyssFloor, { floor: run.floor })}
        <span style={css.dim}> {tpl(t.text.abyssLight, { light: run.light })}</span>
      </div>
      {run.done ? (
        <Btn primary testId="abyss-commit" onClick={commit}>
          深層を出る
        </Btn>
      ) : cs === null || enemy === null ? (
        <div>
          <Btn primary testId="abyss-dive" onClick={dive}>
            降りる
          </Btn>
          <Btn testId="abyss-retreat" onClick={retreat}>
            引き返す
          </Btn>
        </div>
      ) : (
        <div>
          {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
            <div key={i} style={css.sys}>
              {l}
            </div>
          ))}
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
          ) : cs.won ? (
            <div>
              <div style={css.sys}>{tpl(t.text.abyssCleared, { name: enemy.name })}</div>
              <Btn primary testId="abyss-dive" onClick={dive}>
                さらに降りる
              </Btn>
              <Btn testId="abyss-retreat" onClick={retreat}>
                引き返す
              </Btn>
            </div>
          ) : null}
        </div>
      )}
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
      {/* ここまでの記録（T-37 伝記の途中経過プレビュー） */}
      <div style={{ ...css.dim, marginTop: 12 }}>
        {bioLines(state).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      {/* 討伐図鑑（T-44）：kill.species.* / kill.unique.* カウンタから実績一覧 */}
      <div style={{ marginTop: 12 }}>{t.text.recordsHunt}</div>
      {enemies.enemies.map((e) => {
        const kills = state.counters[`kill.species.${e.id}`] ?? 0;
        const uniques = state.counters[`kill.unique.${e.id}`] ?? 0;
        if (kills === 0) return null;
        return (
          <div key={e.id} style={css.dim}>
            {tpl(t.text.recordsHuntLine, {
              name: e.name,
              kills,
              unique: uniques > 0 ? tpl(t.text.recordsHuntUnique, { unique: uniques }) : "",
            })}
          </div>
        );
      })}
      {/* 深層の自己ベスト（T-43）：abyss.best / abyss.runs カウンタ */}
      <div style={{ marginTop: 8 }}>
        {(state.counters["abyss.runs"] ?? 0) === 0
          ? t.text.recordsAbyssNone
          : tpl(t.text.recordsAbyss, {
              best: state.counters["abyss.best"] ?? 0,
              runs: state.counters["abyss.runs"] ?? 0,
            })}
      </div>
      {/* ライバル・ランキング（T-47。派生値：state.rng は消費しない） */}
      <div style={{ marginTop: 12 }} data-testid="records-rivals">
        <div>{t.text.recordsRivals}</div>
        {rivalsOf(state, rivals, balance.rivals).entries.map((e) => (
          <div key={e.rank} style={e.isPlayer ? undefined : css.dim}>
            {tpl(t.text.recordsRivalLine, {
              rank: e.rank,
              name: e.name,
              epithet: e.epithet ? tpl(t.text.recordsRivalEpithet, { epithet: e.epithet }) : "",
              score: e.score,
              you: e.isPlayer ? t.text.recordsRivalYou : "",
            })}
          </div>
        ))}
        <div style={css.dim}>{t.text.recordsRivalNote}</div>
      </div>
      {/* 年代記（T-38。周回をまたぐ記録。セーブとは別領域に残る） */}
      <ChronicleView />
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

/** 年代記の一覧（CLI の chronicleLines と同じ組み立て） */
function ChronicleView() {
  const chronicle = loadChronicle();
  return (
    <div style={{ marginTop: 12 }} data-testid="chronicle">
      <div>{tpl(t.text.chronicleHeader, { count: chronicle.lives.length })}</div>
      {chronicle.lives.length === 0 && <div style={css.dim}>{t.text.chronicleEmpty}</div>}
      {chronicle.lives.map((life, i) => {
        const epithet = life.epithet
          ? `《${titles.titles.find((x) => x.id === life.epithet)?.name ?? life.epithet}》`
          : "";
        const standing =
          societyDefs.standings.find((s) => s.id === life.standing)?.name ?? life.standing;
        const profession =
          life.profession === null
            ? "―"
            : (societyDefs.professions.find((p) => p.id === life.profession)?.name ??
              life.profession);
        return (
          <div key={i} style={css.dim}>
            <div>
              {tpl(t.text.chronicleLine, {
                i: i + 1,
                name: life.name,
                epithet,
                days: life.daysLived,
                cause: t.display.causeNames[life.cause] ?? life.cause,
              })}
            </div>
            <div>{tpl(t.text.chronicleRole, { standing, profession })}</div>
            {life.notableWorks.length > 0 && (
              <div>
                {tpl(t.text.chronicleWorks, {
                  works: life.notableWorks
                    .map((w) => `《${workName(w)}》品質${w.quality}`)
                    .join("、"),
                })}
              </div>
            )}
            {/* 頂点に至ったルート（T-41）：年代記の頁に刻む */}
            {life.pinnacles !== undefined && life.pinnacles.length > 0 && (
              <div>
                {tpl(t.text.chroniclePinnacle, {
                  pinnacles: life.pinnacles
                    .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
                    .join("、"),
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
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

// ---- 師匠（T-27。弟子入りで担当スキルの伸びが上がり、稽古で素質が戻る） ----
function MentorScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const skillName = (id: string) => skillList.find((s) => s.id === id)?.name ?? id;
  const current = state.mentor ? (mentorList.find((m) => m.id === state.mentor!.id) ?? null) : null;

  if (current) {
    const recommended = Math.round(state.player.skills[current.skill]?.value ?? 0) + 10;
    const canTrain = canAct(state.time, cfg.time) && state.player.money >= current.fee;
    const formatTrain = (ev: ActionEvent[], difficulty: number): string[] => {
      const gain = ev.find((e) => e.type === "gainApplied");
      return [
        tpl(t.text.mentorTrainResult, {
          name: skillName(current.skill),
          difficulty,
          fee: current.fee,
          amount: (gain?.type === "gainApplied" ? gain.amount : 0).toFixed(1),
        }),
        ...eventLines(ev.filter((e) => e.type !== "gainApplied")),
      ];
    };
    return (
      <section style={css.panel} data-testid="screen-mentor">
        <div>
          {tpl(t.text.mentorHeaderCurrent, {
            name: current.name,
            skill: skillName(current.skill),
            days: state.time.day - state.mentor!.sinceDay + 1,
          })}
        </div>
        <div style={css.dim}>{current.desc}</div>
        <div style={{ ...css.dim, margin: "8px 0" }}>
          {tpl(t.text.difficultyPrompt, { recommended })}
        </div>
        <div>
          {[0, 10, 20, 30].map((add) => {
            const diff = recommended - 10 + add;
            return (
              <Btn
                key={add}
                testId={`mentor-train-${add}`}
                primary={add === 10}
                disabled={!canTrain}
                onClick={() =>
                  act(
                    { type: "trainWithMentor", difficulty: diff },
                    { format: (ev) => formatTrain(ev, diff) },
                  )
                }
              >
                難度 {diff}（{current.fee}G）
              </Btn>
            );
          })}
        </div>
        {state.player.money < current.fee && <div style={css.sys}>{t.text.bookTooPoor}</div>}
        {!canAct(state.time, cfg.time) && <div style={css.sys}>{t.text.mustSleep}</div>}
        <div style={{ marginTop: 8 }}>
          <Btn testId="mentor-leave" onClick={() => act({ type: "leaveMentor" })}>
            弟子をやめる
          </Btn>
          <Btn onClick={back}>戻る</Btn>
        </div>
      </section>
    );
  }

  return (
    <section style={css.panel} data-testid="screen-mentor">
      <div>{t.text.mentorHeaderNone}</div>
      {mentorList.map((m) => {
        const ok = canApprentice(state, m.id, cfg.mentors, cfg.time);
        return (
          <div key={m.id} data-testid={`mentor-${m.id}`} style={{ margin: "10px 0" }}>
            <div>
              <span style={css.accent}>{m.name}</span>
              <span style={css.dim}>
                {" "}
                《{skillName(m.skill)}》・稽古 {m.fee}G{" "}
                {ok ? t.text.mentorMarkOk : t.text.mentorMarkNg}
              </span>
            </div>
            <div style={css.dim}>{m.desc}</div>
            {ok && (
              <Btn
                primary
                testId={`mentor-apprentice-${m.id}`}
                onClick={() => act({ type: "apprentice", id: m.id })}
              >
                弟子入りする
              </Btn>
            )}
          </div>
        );
      })}
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

// ---- 引退（T-40。06 §1：いつでも選べる。確認は1回） ----
function RetireScreen({ onRetire }: { onRetire: (confirmed: boolean) => void }) {
  return (
    <section style={css.panel} data-testid="screen-retire">
      <div style={{ marginBottom: 8 }}>{t.text.retireConfirm}</div>
      <Btn primary testId="retire-yes" onClick={() => onRetire(true)}>
        引退する
      </Btn>
      <Btn testId="retire-no" onClick={() => onRetire(false)}>
        思いとどまる
      </Btn>
    </section>
  );
}

// ---- 生の継ぎ方（T-48。06 §1：転生＝新しい世界へ / 次代＝同じ世界で継ぐ） ----
/**
 * 終わった生をどう継ぐかの選択画面。伝記はログに開かれている。
 * 転生を選ぶとその時点で年代記に1頁刻まれ（recordLifeEnd・冪等）転生画面へ、
 * 次代を選ぶと刻まずに次代画面へ
 */
function SuccessionScreen({
  prev,
  cause,
  onChoose,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onChoose: (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => void;
}) {
  return (
    <section style={css.panel} data-testid="screen-succession">
      <div style={{ marginBottom: 8 }}>{t.text.heirWayPick}</div>
      <Btn primary testId="succession-rebirth" onClick={() => onChoose(prev, cause, "rebirth")}>
        新しい世界に転生する
        <span style={css.dim}> ― 年代記に刻まれ、継承は大きい</span>
      </Btn>
      <Btn testId="succession-heir" onClick={() => onChoose(prev, cause, "heir")}>
        この世界で次代を継ぐ
        <span style={css.dim}> ― 年代記には刻まず、継承は小さい</span>
      </Btn>
    </section>
  );
}

// ---- 次代を継ぐ（T-48。06 §1「子や弟子に継承して延長」） ----
/**
 * 同じ世界 seed で新キャラを始める画面。前代の記録はその場の伝記が担い、
 * 年代記には刻まない。継承は legacy より弱い引継ぎ（素質補正の小さい版のみ）。
 * 世界が同じなので運命の傾向は前世のものを継ぎ、誓約は生ごとの選択として選び直す（D-38）
 */
function HeirScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (prev: GameState, originId: string, vows: readonly string[]) => void;
}) {
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  const kind = useMemo(() => heirKindOf(prev), [prev]);
  const [originId, setOriginId] = useState<string | null>(null);
  const [pickedVows, setPickedVows] = useState<string[]>([]);
  const toggleVow = (id: string) =>
    setPickedVows((vs) => (vs.includes(id) ? vs.filter((x) => x !== id) : [...vs, id]));
  return (
    <section style={css.panel} data-testid="screen-heir">
      <div data-testid="heir-bio">
        {bio.map((l, i) => (
          <div key={i} style={l.startsWith("――") || l.startsWith("━") ? css.sys : {}}>
            {l}
          </div>
        ))}
      </div>
      <div style={css.sys} data-testid="heir-kind">
        {tpl(t.text.heirKindLine, {
          kind: t.display.heirKindNames[kind] ?? kind,
          gen: heirGenerationOf(prev) + 1,
        })}
      </div>
      <div style={css.dim} data-testid="heir-nochronicle">
        {t.text.heirNoChronicle}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.rebirthOriginPrompt}</div>
      <div>
        {originList.map((o) => (
          <Btn
            key={o.id}
            testId={`heir-origin-${o.id.replace("origin.", "")}`}
            primary={originId === o.id}
            onClick={() => setOriginId(o.id)}
          >
            {o.name}
            <span style={css.dim}> ― {o.desc}</span>
          </Btn>
        ))}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.vowPick}</div>
      <div data-testid="heir-vows">
        {vowList.map((v) => (
          <Btn
            key={v.id}
            testId={`heir-vow-${v.id}`}
            primary={pickedVows.includes(v.id)}
            onClick={() => toggleVow(v.id)}
          >
            {v.name}
            <span style={css.dim}> ― {v.desc}</span>
          </Btn>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn
          primary
          testId="heir-born"
          disabled={originId === null}
          onClick={() => {
            if (originId !== null) onBorn(prev, originId, pickedVows);
          }}
        >
          {t.text.rebirthBorn}
        </Btn>
      </div>
    </section>
  );
}

// ---- 転生（T-40。06 §1「伝記→年代記→継承→転生」） ----
/**
 * 一生の終わり画面：伝記・二つ名（年代記から）・継承の選択・新しい生の出自。
 * 記憶の称号は rememberedMax まで、遺物は台帳の上位から1個。初期値は自動選択と同じ
 */
function RebirthScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (
    prev: GameState,
    originId: string,
    rememberedTitles: string[],
    artifactId: string | undefined,
    fate: FateChoice,
  ) => void;
}) {
  const { auto, topWorks } = useMemo(() => legacyDefaults(prev), [prev]);
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  // 二つ名は年代記に刻まれた頁から読む（recordLife が自動で選んでいる）。
  // この一生の頁を探す（末尾とは限らない：別の生が後に刻まれている場合もある）
  const epithet = useMemo(
    () =>
      [...loadChronicle().lives]
        .reverse()
        .find((l) => l.worldSeed === prev.seed && l.cause === cause)?.epithet,
    [prev, cause],
  );
  const [pickedTitles, setPickedTitles] = useState<string[]>(auto.rememberedTitles);
  // 自動選択の遺物は品質最高の1件＝topWorks[0]（legacyOf と同じ順位付け）
  const [artifactId, setArtifactId] = useState<string | undefined>(topWorks[0]?.id);
  const [originId, setOriginId] = useState<string | null>(null);
  // 生まれ変わる世の運命（T-45/T-46）：傾向は穏やか・誓約はなしが既定
  const [fate, setFate] = useState<FateChoice>({ tendency: "calm", vows: [] });
  const toggleTitle = (id: string) =>
    setPickedTitles((ts) =>
      ts.includes(id)
        ? ts.filter((x) => x !== id)
        : [...ts, id].slice(-balance.legacy.rememberedMax),
    );
  return (
    <section style={css.panel} data-testid="screen-rebirth">
      <div data-testid="rebirth-bio">
        {bio.map((l, i) => (
          <div key={i} style={l.startsWith("――") || l.startsWith("━") ? css.sys : {}}>
            {l}
          </div>
        ))}
      </div>
      {epithet !== undefined && (
        <div style={css.sys} data-testid="rebirth-epithet">
          {tpl(t.text.rebirthEpithet, {
            name: titles.titles.find((x) => x.id === epithet)?.name ?? epithet,
          })}
        </div>
      )}
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.legacyHeader}</div>
      {prev.titles.length > 0 ? (
        <div data-testid="rebirth-titles">
          <div style={css.dim}>
            {tpl(t.text.legacyTitlesPrompt, { max: balance.legacy.rememberedMax })}
          </div>
          {prev.titles.map((id) => (
            <Btn
              key={id}
              testId={`rebirth-title-${id}`}
              primary={pickedTitles.includes(id)}
              onClick={() => toggleTitle(id)}
            >
              {titles.titles.find((x) => x.id === id)?.name ?? id}
            </Btn>
          ))}
        </div>
      ) : (
        <div style={css.dim}>{t.text.legacyNoTitles}</div>
      )}
      {topWorks.length > 0 ? (
        <div data-testid="rebirth-artifacts">
          <div style={css.dim}>{t.text.legacyArtifactPrompt}</div>
          {topWorks.map((w) => (
            <Btn
              key={w.id}
              testId={`rebirth-artifact-${w.id}`}
              primary={artifactId === w.id}
              onClick={() => setArtifactId((a) => (a === w.id ? undefined : w.id))}
            >
              {workName(w)}
              <span style={css.dim}>
                {" "}
                （質{w.quality}・{w.day + 1}日目）
              </span>
            </Btn>
          ))}
        </div>
      ) : (
        <div style={css.dim}>{t.text.legacyNoArtifact}</div>
      )}
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.rebirthOriginPrompt}</div>
      <div>
        {originList.map((o) => (
          <Btn
            key={o.id}
            testId={`rebirth-origin-${o.id.replace("origin.", "")}`}
            primary={originId === o.id}
            onClick={() => setOriginId(o.id)}
          >
            {o.name}
            <span style={css.dim}> ― {o.desc}</span>
          </Btn>
        ))}
      </div>
      <FatePickers fate={fate} setFate={setFate} />
      <div style={{ marginTop: 12 }}>
        <Btn
          primary
          testId="rebirth-born"
          disabled={originId === null}
          onClick={() => {
            if (originId !== null) onBorn(prev, originId, pickedTitles, artifactId, fate);
          }}
        >
          {t.text.rebirthBorn}
        </Btn>
      </div>
    </section>
  );
}
