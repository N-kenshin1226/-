/**
 * アプリの外殻：ゲーム状態・ログ・画面遷移の管理（X-2 で画面本体は screens/ へ分離）。
 * ここには状態管理と画面の振り分けだけを残し、各画面の JSX は持たない
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  describe,
  heirGenerationOf,
  legacyOf,
  step,
  type ActionEvent,
  type GameState,
} from "@trace/core";
import { balance, titles } from "@trace/content";
import {
  bioLines,
  cfg,
  eventLines,
  heirLife,
  legacyArtifactName,
  loadGame,
  newSession,
  nextLife,
  recordLifeEnd,
  saveGame,
  skillList,
  t,
  tpl,
  wakeLines,
  type FateChoice,
} from "./game.js";
import { css, type Act, type Push, type Screen } from "./ui.js";
import { TitleScreen } from "./screens/title.js";
import { MenuScreen } from "./screens/menu.js";
import { BookScreen, SleepScreen, StatusScreen, TrainScreen } from "./screens/town.js";
import { MinigameScreen, WorkModeScreen, WorkScreen } from "./screens/work.js";
import { AbyssScreen, CombatScreen, HuntScreen } from "./screens/hunt.js";
import { LoreScreen, RecordsScreen } from "./screens/records.js";
import { MentorScreen, SocietyScreen } from "./screens/society.js";
import { HeirScreen, RebirthScreen, RetireScreen, SuccessionScreen } from "./screens/end.js";

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
    return <TitleScreen fate={fate} setFate={setFate} startNew={startNew} />;
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

function ScreenView(props: {
  state: GameState;
  screen: Screen;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
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
