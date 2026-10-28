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
  applySessionCap,
  bioLines,
  cfg,
  cfgFor,
  crisisSceneHaze,
  eventLines,
  heirLife,
  incidentPendingChoice,
  journeying,
  legacyArtifactName,
  loadChronicle,
  loadGame,
  newSession,
  nextLife,
  noticesOf,
  placeOf,
  recordLifeEnd,
  resetSave as clearSaves,
  saveGame,
  skillList,
  skyNow,
  t,
  tagsOf,
  townName,
  tpl,
  wakeLines,
  type FateChoice,
} from "./game.js";
import { TravelVeil, type TravelFx, type TravelFxKind } from "./fx/travel.js";
import { fxMs, motionOff } from "./fx/settings.js";
import { AudioDirector } from "./fx/director.js";
import { playSfx } from "./fx/sound.js";
import { FxTagLayer, MoneyCount, type FxTagItem } from "./fx/fx.js";
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
import { IntroScreen } from "./screens/intro.js";
import { MenuScreen } from "./screens/menu.js";
import { PlaceScreen } from "./screens/place.js";
import {
  ArmsScreen,
  BookScreen,
  BuildScreen,
  SleepScreen,
  StatusScreen,
  TrainScreen,
} from "./screens/town.js";
import { MinigameScreen, WorkModeScreen, WorkScreen } from "./screens/work.js";
import { AbyssScreen, CombatScreen, HuntScreen } from "./screens/hunt.js";
import { CrisisScreen } from "./screens/crisis.js";
import { OccasionScreen } from "./screens/occasion.js";
import { IncidentScreen } from "./screens/incident.js";
import { LoreScreen, RecordsScreen } from "./screens/records.js";
import { MentorScreen, SocietyScreen } from "./screens/society.js";
import { HeirScreen, RebirthScreen, RetireScreen, SuccessionScreen } from "./screens/end.js";
import { EndingScreen } from "./screens/ending.js";
import { NewsScreen, NoticeOverlay, WakeScreen } from "./screens/daily.js";
import { SettingsScreen } from "./screens/settings.js";
import { JourneyScreen, LifeScreen } from "./screens/life.js";
import { dateLabel, type Notice as NoticeData } from "./game.js";
import { townTypeNameOf } from "./world.js";

/** 幕の時間（P-01。「演出を短く」で短い側。theme.fx → --trv-* へ書き込む値） */
function fxInMs(kind: TravelFxKind): number {
  return kind === "sleep"
    ? fxMs(theme.fx.sleepInMs, theme.fx.sleepInShortMs)
    : kind === "combat"
      ? fxMs(theme.fx.combatInMs, theme.fx.combatInShortMs)
      : fxMs(theme.fx.travelInMs, theme.fx.travelInShortMs);
}
function fxOutMs(kind: TravelFxKind): number {
  return kind === "sleep"
    ? fxMs(theme.fx.sleepInMs, theme.fx.sleepInShortMs)
    : kind === "combat"
      ? fxMs(theme.fx.combatInMs, theme.fx.combatInShortMs)
      : fxMs(theme.fx.travelOutMs, theme.fx.travelOutShortMs);
}

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

/** 画面→情景（README §2：背景が一番下の層。P-01：場所に縛られた画面はその場所の情景） */
function sceneOf(state: GameState, s: Screen, lastPlace: string | null): SceneKind {
  /** 場所 id → 情景。未知の場所・場所なしは街の景色に倒す */
  const placeScene = (id: string | null | undefined): SceneKind | null => {
    const sc = placeOf(state, id ?? "")?.scene;
    return sc !== undefined ? (sc as SceneKind) : null;
  };
  switch (s.name) {
    case "wake":
    case "heir":
      return "dawn";
    case "status":
    case "settings":
      return "plain";
    case "news":
    case "lore":
    case "book":
    case "records":
      return "desk";
    case "abyss":
      return "abyss";
    // 旅の途中（P-02）：町と町の間は街道の景色
    case "journey":
      return "highway";
    case "combat":
      // 狩り場の景色のまま戦う（P-01。地域の情景があればそれを使う）
      return placeScene(s.place) ?? "night";
    case "crisis":
    case "ending":
    case "sleep":
    case "retire":
    case "reset":
    case "succession":
    case "rebirth":
      return "night";
    case "place":
      return placeScene(s.place) ?? "town";
    default:
      // 場所に縛られた画面（仕事・狩り・鍛錬・師匠など）はその場所の情景のまま
      return placeScene(("place" in s ? s.place : undefined) ?? lastPlace) ?? "town";
  }
}

/** 右上の常設 HUD（疲労ゲージ・蝋燭・所持金）を出す画面 */
const HUD_SCREENS = new Set<Screen["name"]>([
  "menu",
  "place",
  "train",
  "sleep",
  "work",
  "workMode",
  "minigame",
  "hunt",
  "crisis",
  "occasion",
  "incident",
  "lore",
  "book",
  "records",
  "society",
  "mentor",
  "life",
  "journey",
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
  "life",
  "journey",
]);

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  /** 通知の積み重ね（S=中央の帯・A=光る窓。1枚ずつ捌く） */
  const [notices, setNotices] = useState<NoticeData[]>([]);
  /** B通知の札の重なり（F-02。右上に滑り込み、数秒で消える） */
  const [tagItems, setTagItems] = useState<FxTagItem[]>([]);
  const tagKey = useRef(0);
  /** Sの帯を最後に出した日（F-02「Sは1日1回まで」D-13。新しい生では null に戻す） */
  const sDay = useRef<number | null>(null);
  /**
   * 日々の出来事（F-05）：「あとにする」とした出来事の記憶（その日だけ）。
   * 自動割り込みでうるさくしないための印 —— メニューの「届いた出来事」からは
   * 先送り済みにも応えられる。日が変われば流れる（昨日の出来事は昨日流れた）
   */
  const [incidentDeferred, setIncidentDeferred] = useState<{
    day: number;
    ids: ReadonlySet<string>;
  }>({ day: -1, ids: new Set() });

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

  /** B通知の札を畳む（クリック・寿命どちらからも。退場フェードを挟んでから消す） */
  const dismissTag = useCallback((key: number) => {
    setTagItems((items) => items.map((it) => (it.key === key ? { ...it, leaving: true } : it)));
    window.setTimeout(
      () => setTagItems((items) => items.filter((it) => it.key !== key)),
      theme.fx.tagFadeMs,
    );
  }, []);

  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;

  // ── 場所と移動の転換（P-01、docs/03 §2） ──
  /** 今出ている画面（転換の出し分け用。コミット済みの値だけを映す） */
  const screenRef = useRef<Screen>({ name: "menu" });
  screenRef.current = screen;
  /** 最後に居た場所（情景の基準。場所の画面へ行くたびに更新） */
  const lastPlaceRef = useRef<string | null>(null);
  /** 「戻る」の宛先の基盤画面（P-01）：見取り図か場所。行動・設定などの画面は
      開かれた時点の基盤画面へ帰る（見取り図から開けば見取り図へ、場所からなら場所へ） */
  const backRef = useRef<Screen>({ name: "menu" });
  /** 走っている幕（in=閉じる途中 / out=開く途中） */
  const [fx, setFx] = useState<TravelFx | null>(null);
  /** 幕の裏で差し替える行き先（幕を飛ばしたとき即確定するために覚える） */
  const pendingScreen = useRef<Screen | null>(null);
  const fxT1 = useRef<number | undefined>(undefined);
  const fxT2 = useRef<number | undefined>(undefined);
  const fxSeq = useRef(0);

  /** 画面転換の窓口：全ての画面遷移はここを通る（転換の出し分けは引数だけで決まる）。
      場所↔見取り図・場所↔場所＝移動の幕、寝る・休む＝眠りの幕、戦闘開始＝暗転＋揺れ */
  const go = useCallback((next: Screen) => {
    const seq = ++fxSeq.current;
    const clear = () => {
      window.clearTimeout(fxT1.current);
      window.clearTimeout(fxT2.current);
    };
    const commit = (s: Screen) => {
      screenRef.current = s;
      setScreen(s);
    };
    if (next.name === "place") lastPlaceRef.current = next.place;
    // 走っている幕があれば畳む：幕の裏の行き先を先に確定してから、今の画面から次へ数える
    clear();
    if (pendingScreen.current !== null) {
      commit(pendingScreen.current);
      pendingScreen.current = null;
    }
    setFx(null);
    const cur = screenRef.current;
    const bound = (s: Screen) => s.name === "menu" || s.name === "place";
    // 基盤画面の更新：基盤へ着けばそれが新しい帰り先、基盤から離れれば今の基盤を覚える
    if (bound(next)) backRef.current = next;
    else if (bound(cur)) backRef.current = cur;
    const kind: TravelFxKind | null =
      bound(cur) &&
      bound(next) &&
      (cur.name !== next.name ||
        (cur.name === "place" && next.name === "place" && cur.place !== next.place))
        ? "travel"
        : next.name === "wake" || next.name === "heir"
          ? "sleep"
          : next.name === "combat"
            ? "combat"
            : null;
    // 移動の音（S-01）：街の中へ入る＝扉、それ以外の行き来＝足音。
    // 幕を掛けるか否かに関わらず、ユーザーの操作の中で鳴らす
    if (kind === "travel") {
      const s = stateRef.current;
      const entering =
        next.name === "place" && s !== null && placeOf(s, next.place)?.kind === "town";
      playSfx(cur.name === "menu" && entering ? "door" : "steps");
    }
    // 演出オフ（短く・動きを減らす）では幕を掛けず直接切り替える
    if (kind === null || motionOff()) {
      commit(next);
      return;
    }
    pendingScreen.current = next;
    setFx({ kind, phase: "in" });
    fxT1.current = window.setTimeout(() => {
      if (seq !== fxSeq.current) return;
      pendingScreen.current = null;
      commit(next);
      setFx({ kind, phase: "out" });
      fxT2.current = window.setTimeout(() => {
        if (seq === fxSeq.current) setFx(null);
      }, fxOutMs(kind));
    }, fxInMs(kind));
  }, []);

  /** 幕を飛ばす（クリック・Enter・Esc・Space。行動の結果は変わらない） */
  const skipFx = useCallback(() => {
    fxSeq.current += 1;
    window.clearTimeout(fxT1.current);
    window.clearTimeout(fxT2.current);
    if (pendingScreen.current !== null) {
      screenRef.current = pendingScreen.current;
      setScreen(pendingScreen.current);
      pendingScreen.current = null;
    }
    setFx(null);
  }, []);

  /** step を実行し、イベント行を記録する。起床報告があれば起床の窓を、
      S/Aの出来事があれば通知を重ねて表示する（UI-01）。
      ref 経由で現在値を読むため、StrictMode の二重適用を起こさない */
  const act = useCallback<Act>(
    (command, opts) => {
      const s = stateRef.current;
      if (!s) return;
      // G-01：生成地方では営み・師匠・話し手の表がその世界のもの
      const res = step(s, command, cfgFor(s));
      if (res.events.some((e) => e.type === "deathByAge")) {
        // 老衰死（T-40・D-31）：教会蘇生はしない。起床ログ＋伝記を表示し、
        // 生の継ぎ方を選ぶ画面へ（T-48。年代記への記録は転生を選んだ時点で行う）。
        const bio = bioLines(res.state, "death", true);
        const wake = wakeLines(res.state, res.events, opts?.atHome ?? false);
        push([...wake, ...bio]);
        saveGame(res.state);
        stateRef.current = res.state;
        setState(res.state);
        go({ name: "succession", prev: res.state, cause: "oldAge" });
        return;
      }
      // 年代記への追記（T-38。戦闘死＝教会で蘇生する死。老衰死は上で転生へ回す）
      if (res.events.some((e) => e.type === "died")) {
        recordLifeEnd(res.state, "death", bioLines(res.state, "death", true).join("\n"));
      }
      // 起床（UI-01：Wake見本）：報告は専用の窓で渡し、記録にも同じ行を残す
      const wakeEv = res.events.find(
        (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
      );
      if (wakeEv !== undefined) {
        push(wakeLines(res.state, res.events, opts?.atHome ?? false));
        // 寝た・休んだ → 朝：闇から明るさへ開く幕を掛ける（P-01）
        go({
          name: "wake",
          report: wakeEv.report,
          events: res.events,
          atHome: opts?.atHome ?? false,
        });
      } else {
        push(opts?.format?.(res.events) ?? eventLines(res.events, res.state));
      }
      // S/Aの出来事は通知を重ねる（03 §6：S=画面全体の帯・A=光る窓）。
      // Sの帯は1日1回まで（D-13・F-02）：同日に重なった分はAの窓に畳む
      const capped = applySessionCap(
        noticesOf(res.events, res.state),
        sDay.current === res.state.time.day,
      );
      if (capped.sShown) sDay.current = res.state.time.day;
      if (capped.notices.length > 0) setNotices((q) => [...q, ...capped.notices]);
      // Bの出来事は右上の札へ（F-02。滑り込んで数秒で消える。重なりは tagMax まで）
      const tags = tagsOf(res.events, res.state);
      if (tags.length > 0)
        setTagItems((items) =>
          [
            ...items,
            ...tags.map((tag): FxTagItem => ({ key: ++tagKey.current, tag, leaving: false })),
          ].slice(-theme.fx.tagMax),
        );
      saveGame(res.state);
      stateRef.current = res.state;
      setState(res.state);
    },
    [push, go],
  );

  // 新規開始画面で選ぶ運命（T-45/T-46）：傾向と誓約。既定は穏やかな世＋誓約なし
  const [fate, setFate] = useState<FateChoice>({ tendency: "calm", vows: [] });

  const startNew = (originId?: string) => {
    const s = newSession(originId, fate);
    saveGame(s);
    stateRef.current = s;
    sDay.current = null; // 新しい生：Sの帯の日予算も新しく数える
    setState(s);
    setLog([t.text.banner, "", t.text.intro]);
    // 導入の会話窓（F-06）：年代記に頁が無い＝初めての生のときだけ挟む。
    // 2周目以降の始め方を知っているプレイヤーには出さない
    go(loadChronicle().lives.length === 0 ? { name: "intro" } : { name: "menu" });
  };

  /** 引退の確認に応答する（T-40。06 §1：引退はいつでも選べる。確認は1回） */
  const retire = useCallback(
    (confirmed: boolean) => {
      if (!confirmed) {
        push(t.text.retireCancelled);
        // 思いとどまったら居た場所へ帰る（P-01。引退は自宅の行動）
        const s = stateRef.current;
        const dest = lastPlaceRef.current;
        go(
          dest !== null && s !== null && placeOf(s, dest) !== undefined
            ? { name: "place", place: dest }
            : { name: "menu" },
        );
        return;
      }
      const s = stateRef.current;
      if (!s) return;
      const res = step(s, { type: "retire" }, cfgFor(s));
      // 伝記を開き、生の継ぎ方（転生か次代か）を選ぶ画面へ（T-48）。
      // 年代記への記録は転生を選んだ時点で行う
      const bio = bioLines(res.state, "retire", true);
      push(bio);
      saveGame(res.state);
      stateRef.current = res.state;
      setState(res.state);
      go({ name: "succession", prev: res.state, cause: "retire" });
    },
    [push, go],
  );

  /** セーブの削除（UI-01。記録を消す操作は必ず確認を挟む） */
  const resetSave = useCallback(() => {
    clearSaves();
    stateRef.current = null;
    sDay.current = null;
    setState(null);
    setLog([]);
    setNotices([]);
    setTagItems([]);
    go({ name: "menu" });
  }, [go]);

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
      sDay.current = null;
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
      go({ name: "menu" });
    },
    [push, go],
  );

  /**
   * 生の継ぎ方の選択（T-48、06 §1）：転生なら年代記に1頁刻んで（冪等）転生画面へ、
   * 次代なら刻まず（同じ世界）次代画面へ
   */
  const chooseWay = useCallback(
    (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => {
      if (way === "rebirth") {
        const bio = bioLines(prev, cause === "retire" ? "retire" : "death", true);
        recordLifeEnd(prev, cause, bio.join("\n"));
        go({ name: "rebirth", prev, cause });
      } else {
        go({ name: "heir", prev, cause });
      }
    },
    [go],
  );

  /** 次代画面の確定（T-48）：同じ世界 seed で新しい生を始める。年代記には刻まない */
  const heirBorn = useCallback(
    (prev: GameState, originId: string, vows: readonly string[]) => {
      const { state: next, kind, legacy } = heirLife(prev, originId, vows);
      saveGame(next);
      stateRef.current = next;
      sDay.current = null;
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
      go({ name: "menu" });
    },
    [push, go],
  );

  if (!loaded) return null;
  if (!state) {
    return (
      <Stage>
        {/* タイトル：ゲーム外の場面。曲は title、環境音は鳴らさない */}
        <AudioDirector
          screen="title"
          place={undefined}
          scene="town"
          tod="morning"
          weather="clear"
        />
        <TitleScreen fate={fate} setFate={setFate} startNew={startNew} />
      </Stage>
    );
  }

  // 日々の出来事（F-05）：メニューに居る間に届いた分があれば会話の窓が割り込む
  // （行動の合間 —— メニューは行動と行動の境目）。「あとにする」はその日は割り込まない
  const pendingIncidents =
    cfg.incidents !== undefined ? incidentPendingChoice(state, cfgFor(state).incidents!) : [];
  const deferredIds =
    incidentDeferred.day === state.time.day ? incidentDeferred.ids : new Set<string>();
  // 旅の途中（P-02）：見取り図・場所にはいられない —— 街道の窓に差し替える。
  // その間は出来事の自動割り込みも届かない（人の届く範囲は町の中）
  const onRoad = journeying(state);
  const autoIncidents = onRoad ? [] : pendingIncidents.filter((o) => !deferredIds.has(o.def.id));
  const effScreen: Screen =
    onRoad && (screen.name === "menu" || screen.name === "place")
      ? { name: "journey" }
      : autoIncidents.length > 0 && screen.name === "menu"
        ? { name: "incident" }
        : screen;
  const deferIncident = (id: string) =>
    setIncidentDeferred({ day: state.time.day, ids: new Set([...deferredIds, id]) });

  const scene = sceneOf(state, effScreen, lastPlaceRef.current);
  const notice = notices[0];
  // 危機の段階による景色の霞（W-04、docs/08 §3「景色の差分」）。
  // 段階の数字は出さず、世界の気配として背景に滲ませる
  const haze = crisisSceneHaze(state, cfg.crisis);
  // 現在の空（P-01）：時間帯と天候は state から導出する値 —— 背景にだけ効く
  const sky = skyNow(state);
  // 名札の場所：場所の画面・場所に縛られた画面はその場所、それ以外は最後に居た場所。
  // 見取り図に居るとき・どこにも居ないときは街の名
  const chromePlace =
    effScreen.name === "menu"
      ? undefined
      : (placeOf(
          state,
          effScreen.name === "place"
            ? effScreen.place
            : (("place" in effScreen ? effScreen.place : undefined) ??
                lastPlaceRef.current ??
                undefined),
        ) ?? undefined);
  // 音の基準場所（S-01）：場所の画面・場所に縛られた画面はその場所、
  // それ以外は最後に居た場所。見取り図では場所を持たない（街の時間帯曲になる）
  const audioPlace =
    effScreen.name === "menu"
      ? undefined
      : effScreen.name === "place"
        ? effScreen.place
        : (("place" in effScreen ? effScreen.place : undefined) ??
          lastPlaceRef.current ??
          undefined);
  const jolt = fx?.kind === "combat";

  return (
    <Stage>
      <div
        data-testid="app"
        className={`scene${jolt ? " fx-jolt" : ""}`}
        style={jolt ? { animationDuration: `${fxInMs("combat")}ms` } : undefined}
      >
        {/* 音の監督（S-01）：背景と同じ場面情報から BGM・環境音を同期させる */}
        <AudioDirector
          screen={effScreen.name}
          place={audioPlace}
          placeKind={chromePlace?.kind}
          scene={scene}
          tod={sky.tod}
          weather={sky.weather}
        />
        {/* 背景 → 名札 → HUD → 画面の窓 → 会話窓 → 操作ガイド → 通知 の順に重ねる */}
        <SceneBackground kind={scene} haze={haze} tod={sky.tod} weather={sky.weather} />
        {HUD_SCREENS.has(effScreen.name) && <TopChrome state={state} place={chromePlace} />}
        <div key={effScreen.name} className="screen-fade">
          <ScreenView
            state={state}
            screen={effScreen}
            /** 自動割り込みの出来事窓なら true（先送り済みは出さない） */
            incidentAuto={screen.name === "menu"}
            lastPlace={lastPlaceRef.current}
            backTo={backRef.current}
            setScreen={go}
            act={act}
            push={push}
            log={log}
            onRetire={retire}
            onReset={resetSave}
            onBorn={born}
            onChooseWay={chooseWay}
            onHeirBorn={heirBorn}
            onIncidentDefer={deferIncident}
            incidentDeferred={deferredIds}
          />
        </div>
        {LOG_SCREENS.has(effScreen.name) && (
          <LogWindow
            lines={log}
            testId="log"
            style={pos({ left: 28, bottom: 56, width: 560, height: 118 })}
          />
        )}
        {/* 記録は常に DOM に残す（起床・戦闘など会話窓を出さない画面では不可視に）。
            場所の画面は会話窓の中に記録を持つので二重には出さない */}
        {!LOG_SCREENS.has(effScreen.name) &&
          effScreen.name !== "menu" &&
          effScreen.name !== "place" && (
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
        {/* 移動・戦闘・眠りの幕（P-01）：画面の窓より上・通知より下。飛ばせる */}
        {fx !== null && (
          <TravelVeil fx={fx} inMs={fxInMs(fx.kind)} outMs={fxOutMs(fx.kind)} onSkip={skipFx} />
        )}
        {/* B通知の札：右上に重ねる（F-02。画面の窓より上・S/Aの帯より下） */}
        <FxTagLayer items={tagItems} onDismiss={dismissTag} />
        {notice !== undefined && (
          <NoticeOverlay
            state={state}
            notice={notice}
            onEnd={() => go({ name: "ending" })}
            onClose={() => setNotices((q) => q.slice(1))}
          />
        )}
      </div>
    </Stage>
  );
}

/** 左上の名札＋日付、右上の HUD（UI-01：Main見本の常設クローム）。
    P-01：名札は今いる場所を示す（見取り図や場所の外では街の名） */
function TopChrome({ state, place }: { state: GameState; place?: { name: string; kind: string } }) {
  const left = Math.max(0, cfg.time.actionsPerDay - state.time.action);
  const d = describe(state.time, cfg.time);
  return (
    <>
      <Plate style={pos({ left: 28, top: 22 })} testId="place-name">
        <span style={{ fontFamily: theme.font.mincho, fontSize: 16 }}>
          {place?.name ?? townName(state, state.life.town)}
          <span style={{ color: theme.colors.world.dim, fontSize: 13 }}>
            {" "}
            ――{" "}
            {place !== undefined && place.kind === "region"
              ? "街の外"
              : townTypeNameOf(state, state.life.town) || "街"}
          </span>
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
          {/* 所持金は増減の瞬間に数がめくれて光る（F-02：報酬の実感） */}
          <MoneyCount value={state.player.money} />
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
  /** 自動割り込みの出来事窓として開いているか（F-05） */
  incidentAuto: boolean;
  incidentDeferred: ReadonlySet<string>;
  /** 最後に居た場所（P-01。情景の基準） */
  lastPlace: string | null;
  /** 「戻る」の宛先の基盤画面（P-01。画面が開かれた時点の見取り図か場所） */
  backTo: Screen;
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
  onIncidentDefer: (id: string) => void;
}) {
  const {
    state,
    screen,
    incidentAuto,
    incidentDeferred,
    setScreen,
    act,
    push,
    log,
    onRetire,
    onReset,
    onBorn,
    onChooseWay,
    onHeirBorn,
    onIncidentDefer,
    backTo,
  } = props;
  const toMenu = () => setScreen({ name: "menu" });
  /** 戻る先（P-01）：場所に縛られた画面はその場所へ、それ以外は開かれた時点の
      基盤画面（見取り図か場所）へ帰る */
  const toBack = (p?: string) => () => {
    if (p !== undefined && placeOf(state, p) !== undefined) {
      setScreen({ name: "place", place: p });
      return;
    }
    setScreen(backTo);
  };
  switch (screen.name) {
    case "intro":
      return <IntroScreen state={state} name={state.player.name} setScreen={setScreen} />;
    case "place":
      return (
        <PlaceScreen state={state} place={screen.place} setScreen={setScreen} act={act} log={log} />
      );
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
      return <NewsScreen state={state} events={screen.events} back={toBack()} />;
    case "train":
      return <TrainScreen state={state} act={act} back={toBack()} />;
    case "sleep":
      return <SleepScreen state={state} act={act} back={toBack()} />;
    case "work":
      return <WorkScreen state={state} place={screen.place} setScreen={setScreen} />;
    case "workMode":
      return (
        <WorkModeScreen
          state={state}
          order={screen.order}
          place={screen.place}
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
          finale={screen.finale}
          occasion={screen.occasion}
          place={screen.place}
          setScreen={setScreen}
          act={act}
        />
      );
    case "hunt":
      return <HuntScreen state={state} place={screen.place} setScreen={setScreen} />;
    case "abyss":
      return <AbyssScreen state={state} act={act} push={push} back={toBack()} />;
    case "combat":
      return (
        <CombatScreen
          state={state}
          enemy={screen.enemy}
          touchpoint={screen.touchpoint}
          finale={screen.finale}
          occasion={screen.occasion}
          place={screen.place}
          setScreen={setScreen}
          act={act}
          push={push}
        />
      );
    case "crisis":
      return <CrisisScreen state={state} setScreen={setScreen} act={act} />;
    case "occasion":
      return <OccasionScreen state={state} setScreen={setScreen} act={act} />;
    case "incident":
      return (
        <IncidentScreen
          state={state}
          setScreen={setScreen}
          act={act}
          deferred={incidentDeferred}
          auto={incidentAuto}
          onDefer={onIncidentDefer}
        />
      );
    case "ending":
      return <EndingScreen state={state} back={toMenu} />;
    case "lore":
      return <LoreScreen state={state} atomId={screen.atomId} setScreen={setScreen} act={act} />;
    case "book":
      return <BookScreen state={state} act={act} back={toBack()} />;
    case "arms":
      // 武器屋（K-01）：鍛冶場の「武器を見る」から開く棚
      return <ArmsScreen state={state} act={act} back={toBack()} />;
    case "build":
      // 武技の構え（K-02）：鍛冶場の「技の構えを整える」から開く構成画面
      return <BuildScreen state={state} act={act} back={toBack()} />;
    case "records":
      return <RecordsScreen state={state} back={toBack()} />;
    case "society":
      return <SocietyScreen state={state} act={act} back={toBack()} />;
    case "mentor":
      return (
        <MentorScreen state={state} place={screen.place} act={act} back={toBack(screen.place)} />
      );
    case "life":
      // 日々の営みの窓（P-02）：市場・料理・賭け・人・掲示板・祈り・食事・棚
      return (
        <LifeScreen
          state={state}
          view={screen.view}
          place={screen.place}
          act={act}
          back={toBack(screen.place)}
        />
      );
    case "journey":
      // 旅の途中（P-02）：町と町の間の街道。野営で日が進む
      return <JourneyScreen state={state} act={act} back={toMenu} />;
    case "status":
      return <StatusScreen state={state} back={toBack()} />;
    case "settings":
      return <SettingsScreen back={toBack()} />;
    case "retire":
      return <RetireScreen onRetire={onRetire} back={toBack()} />;
    case "reset":
      return <ResetScreen back={toBack()} onReset={onReset} />;
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
