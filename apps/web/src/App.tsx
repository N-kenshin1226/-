/**
 * アプリの外殻：ゲーム状態・ログ・画面遷移の管理（X-2 で画面本体は screens/ へ分離）。
 * UI-01：1280×720 の Stage 上に、情景背景・場所名札・右上HUD・会話窓・操作ガイドを
 * 共通レイヤーとして敷き、画面ごとの窓を重ねる（docs/design/README.md）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  describe,
  heirGenerationOf,
  legacyOf,
  lostBookFlags,
  lostBookSkillId,
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
  loadChronicle,
  loadGame,
  newSession,
  nextLife,
  noticesOf,
  recordLifeEnd,
  resetSave as clearSaves,
  saveGame,
  skillList,
  t,
  tpl,
  wakeLines,
  type FateChoice,
} from "./game.js";
import {
  CellGauge,
  Candles,
  ConfirmWindow,
  LogWindow,
  Plate,
  SceneBackground,
  Stage,
  pos,
  type Act,
  type Push,
  type SceneKind,
  type Screen,
} from "./ui.js";
import { theme } from "./theme.js";
import { TitleScreen } from "./screens/title.js";
import { MenuScreen } from "./screens/menu.js";
import { BookScreen, SleepScreen, StatusScreen, TrainScreen } from "./screens/town.js";
import { MinigameScreen, WorkModeScreen, WorkScreen } from "./screens/work.js";
import { AbyssScreen, CombatScreen, HuntScreen } from "./screens/hunt.js";
import { LoreScreen, RecordsScreen } from "./screens/records.js";
import { MentorScreen, SocietyScreen } from "./screens/society.js";
import { HeirScreen, RebirthScreen, RetireScreen, SuccessionScreen } from "./screens/end.js";
import { NewsScreen, NoticeOverlay, WakeScreen } from "./screens/daily.js";
import { dateLabel, type Notice as NoticeData } from "./game.js";

/** セーブ削除の確認画面（UI-01：記録を消す操作は必ず確認を挟む） */
function ResetScreen({ back, onReset }: { back: () => void; onReset: () => void }) {
  return (
    <div data-testid="screen-reset" style={{ ...pos({ left: 340, top: 240, width: 600 }) }}>
      <ConfirmWindow
        title="記録を消す"
        body={t.text.resetConfirm}
        yes="消す"
        no="やめる"
        onYes={onReset}
        onNo={back}
      />
    </div>
  );
}

/** 画面→情景（README §2：背景が一番下の層） */
function sceneOf(s: Screen): SceneKind {
  switch (s.name) {
    case "wake":
    case "heir":
      return "dawn";
    case "status":
      return "plain";
    case "news":
    case "lore":
    case "book":
    case "records":
      return "desk";
    case "abyss":
      return "abyss";
    case "combat":
    case "sleep":
    case "retire":
    case "reset":
    case "succession":
    case "rebirth":
      return "night";
    default:
      return "town";
  }
}

/** 右上の常設 HUD（疲労ゲージ・蝋燭・所持金）を出す画面 */
const HUD_SCREENS = new Set<Screen["name"]>([
  "menu",
  "train",
  "sleep",
  "work",
  "workMode",
  "minigame",
  "hunt",
  "lore",
  "book",
  "records",
  "society",
  "mentor",
]);

/** 会話窓（世界の記録）を出す画面。起床・新聞・通知など別の窓が主役の画面や、
 *  紙が手前に来る画面（記録・見聞録・書店）では出さない */
const LOG_SCREENS = new Set<Screen["name"]>([
  "train",
  "sleep",
  "work",
  "workMode",
  "minigame",
  "hunt",
  "abyss",
  "society",
  "mentor",
]);

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  /** 通知の積み重ね（S=中央の帯・A=光る窓。1枚ずつ捌く） */
  const [notices, setNotices] = useState<NoticeData[]>([]);

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

  const push = useCallback((lines: string | string[]) => {
    setLog((l) => [...l, ...(Array.isArray(lines) ? lines : [lines])].slice(-160));
  }, []);

  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;

  /** step を実行し、イベント行を記録する。起床報告があれば起床の窓を、
      S/Aの出来事があれば通知を重ねて表示する（UI-01）。
      ref 経由で現在値を読むため、StrictMode の二重適用を起こさない */
  const act = useCallback<Act>(
    (command, opts) => {
      const s = stateRef.current;
      if (!s) return;
      const res = step(s, command, cfg);
      if (res.events.some((e) => e.type === "deathByAge")) {
        // 老衰死（T-40・D-31）：教会蘇生はしない。起床ログ＋伝記を表示し、
        // 生の継ぎ方を選ぶ画面へ（T-48。年代記への記録は転生を選んだ時点で行う）。
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
      // 起床（UI-01：Wake見本）：報告は専用の窓で渡し、記録にも同じ行を残す
      const wakeEv = res.events.find(
        (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
      );
      if (wakeEv !== undefined) {
        push(wakeLines(res.state, res.events, opts?.atHome ?? false));
        setScreen({
          name: "wake",
          report: wakeEv.report,
          events: res.events,
          atHome: opts?.atHome ?? false,
        });
      } else {
        push(opts?.format?.(res.events) ?? eventLines(res.events));
      }
      // S/Aの出来事は通知を重ねる（03 §6：S=画面全体の帯・A=光る窓）
      const ns = noticesOf(res.events);
      if (ns.length > 0) setNotices((q) => [...q, ...ns]);
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

  /** セーブの削除（UI-01。記録を消す操作は必ず確認を挟む） */
  const resetSave = useCallback(() => {
    clearSaves();
    stateRef.current = null;
    setState(null);
    setLog([]);
    setNotices([]);
    setScreen({ name: "menu" });
  }, []);

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
      // 失われた書物（X-5、06 §2）：直前の人生（chronicle の最新の頁）の代表技能が
      // 閾値超なら、その技能の「先達の手記」が次の世界の書店に並ぶ（flags に刻む）
      const lostFlags = lostBookFlags(loadChronicle(), balance.lostBooks, prev.seed);
      const next = nextLife(prev, originId, legacy, fate, lostFlags);
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
      if (lostFlags.length > 0) {
        const names = lostFlags
          .map((f) => {
            const id = lostBookSkillId(f, balance.lostBooks);
            return id !== null ? (skillList.find((sk) => sk.id === id)?.name ?? id) : f;
          })
          .join("、");
        lines.push(tpl(t.text.rebirthLostBooks, { names }));
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
    return (
      <Stage>
        <TitleScreen fate={fate} setFate={setFate} startNew={startNew} />
      </Stage>
    );
  }

  const scene = sceneOf(screen);
  const notice = notices[0];

  return (
    <Stage>
      <div data-testid="app" className="scene">
        {/* 背景 → 名札 → HUD → 画面の窓 → 会話窓 → 操作ガイド → 通知 の順に重ねる */}
        <SceneBackground kind={scene} />
        {HUD_SCREENS.has(screen.name) && <TopChrome state={state} />}
        <div key={screen.name} className="screen-fade">
          <ScreenView
            state={state}
            screen={screen}
            setScreen={setScreen}
            act={act}
            push={push}
            log={log}
            onRetire={retire}
            onReset={resetSave}
            onBorn={born}
            onChooseWay={chooseWay}
            onHeirBorn={heirBorn}
          />
        </div>
        {LOG_SCREENS.has(screen.name) && (
          <LogWindow
            lines={log}
            testId="log"
            style={pos({ left: 28, bottom: 56, width: 560, height: 118 })}
          />
        )}
        {/* 記録は常に DOM に残す（起床・戦闘など会話窓を出さない画面では不可視に） */}
        {!LOG_SCREENS.has(screen.name) && screen.name !== "menu" && (
          <div
            data-testid="log"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: -4,
              top: -4,
              width: 1,
              height: 1,
              overflow: "hidden",
              opacity: 0.01,
              pointerEvents: "none",
            }}
          >
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        {/* 下帯のグラデーション（README 決まりごと5：操作ガイドは常に出す） */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 44,
            background:
              "linear-gradient(to bottom, rgba(8,8,14,0) 0%, rgba(8,8,14,.78) 70%, rgba(5,5,9,.92) 100%)",
            pointerEvents: "none",
          }}
        />
        {notice !== undefined && (
          <NoticeOverlay notice={notice} onClose={() => setNotices((q) => q.slice(1))} />
        )}
      </div>
    </Stage>
  );
}

/** 左上の名札＋日付、右上の HUD（UI-01：Main見本の常設クローム） */
function TopChrome({ state }: { state: GameState }) {
  const left = Math.max(0, cfg.time.actionsPerDay - state.time.action);
  const d = describe(state.time, cfg.time);
  return (
    <>
      <Plate style={pos({ left: 28, top: 22 })}>
        <span style={{ fontFamily: theme.font.mincho, fontSize: 16 }}>
          アルディ<span style={{ color: theme.colors.world.dim, fontSize: 13 }}> ―― 宿場街</span>
        </span>
      </Plate>
      <div
        style={{
          ...pos({ left: 30, top: 58 }),
          color: theme.colors.world.dim,
          fontSize: 13,
          fontFamily: theme.font.sys,
          letterSpacing: "0.06em",
        }}
        data-testid="status"
      >
        {dateLabel(state)}（{t.display.weekdayNames[d.weekday] ?? ""}）・{d.age}歳・残り行動 {left}/
        {cfg.time.actionsPerDay}・所持金 {state.player.money}G
        {state.player.overwork.active && <span style={{ color: theme.colors.warn }}>［過労］</span>}
      </div>
      <div
        style={{
          ...pos({ right: 28, top: 22 }),
          display: "flex",
          alignItems: "center",
          gap: 18,
          background: "rgba(10,10,16,.55)",
          border: `1px solid ${theme.colors.world.frameInner}`,
          borderRadius: 4,
          padding: "8px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: theme.colors.world.dim,
              fontSize: 11,
              fontFamily: theme.font.sys,
              letterSpacing: "0.12em",
            }}
          >
            疲労
          </span>
          <CellGauge value={state.player.fatigue} />
        </div>
        <Candles lit={left} total={cfg.time.actionsPerDay} />
        <div
          style={{
            color: theme.colors.world.light,
            fontFamily: theme.font.en,
            fontSize: 15,
            letterSpacing: "0.04em",
          }}
        >
          {state.player.money}
          <span style={{ fontFamily: theme.font.sys, fontSize: 11, color: theme.colors.world.dim }}>
            {" "}
            銅貨
          </span>
        </div>
      </div>
    </>
  );
}

function ScreenView(props: {
  state: GameState;
  screen: Screen;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
  log: readonly string[];
  onRetire: (confirmed: boolean) => void;
  onReset: () => void;
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
  const {
    state,
    screen,
    setScreen,
    act,
    push,
    log,
    onRetire,
    onReset,
    onBorn,
    onChooseWay,
    onHeirBorn,
  } = props;
  const toMenu = () => setScreen({ name: "menu" });
  switch (screen.name) {
    case "wake":
      return (
        <WakeScreen
          state={state}
          report={screen.report}
          events={screen.events}
          atHome={screen.atHome}
          setScreen={setScreen}
        />
      );
    case "news":
      return <NewsScreen state={state} events={screen.events} back={toMenu} />;
    case "train":
      return <TrainScreen state={state} act={act} back={toMenu} />;
    case "sleep":
      return <SleepScreen state={state} act={act} back={toMenu} />;
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
      return <AbyssScreen state={state} act={act} push={push} back={toMenu} />;
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
      return <BookScreen state={state} act={act} back={toMenu} />;
    case "records":
      return <RecordsScreen state={state} back={toMenu} />;
    case "society":
      return <SocietyScreen state={state} act={act} back={toMenu} />;
    case "mentor":
      return <MentorScreen state={state} act={act} back={toMenu} />;
    case "status":
      return <StatusScreen state={state} back={toMenu} />;
    case "retire":
      return <RetireScreen onRetire={onRetire} back={toMenu} />;
    case "reset":
      return <ResetScreen back={toMenu} onReset={onReset} />;
    case "succession":
      return <SuccessionScreen prev={screen.prev} cause={screen.cause} onChoose={onChooseWay} />;
    case "rebirth":
      return <RebirthScreen prev={screen.prev} cause={screen.cause} onBorn={onBorn} />;
    case "heir":
      return <HeirScreen prev={screen.prev} cause={screen.cause} onBorn={onHeirBorn} />;
    default:
      return <MenuScreen state={state} setScreen={setScreen} act={act} log={log} />;
  }
}
