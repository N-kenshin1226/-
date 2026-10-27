/** 仕事画面とミニゲーム（手動プレイ）の皮（UI-01：世界の窓＋コマンド列） */
import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "../fx/sound.js";
import {
  BeatRail,
  ClashLine,
  FxPopsLayer,
  MG_RAIL_Y,
  OpponentFace,
  PushGauge,
  QualityMeter,
  ResultReveal,
  ShakeBox,
  SparkBurst,
  useFxPops,
} from "../fx/minigame.js";
import {
  beatPhase,
  clashDelta,
  comboCount,
  negoMood,
  railXPct,
  type BeatMark,
} from "../fx/motion.js";
import type { ActionEvent, DealCard, GameState } from "@trace/core";
import { balance } from "@trace/content";
import {
  crisisOrders,
  eventLines,
  isBoardKind,
  isTimingKind,
  marketFactorOf,
  minigameResult,
  orderList,
  placeOf,
  placeTakesKind,
  showdownOrderOf,
  simpleQuality,
  skillList,
  specialOrderOf,
  startMinigame,
  t,
  tickMinigame,
  tpl,
  type BoardState,
  type DealState,
  type MinigameKind,
  type Order,
  type SpecialOrder,
  type TimingState,
} from "../game.js";
import { theme } from "../theme.js";
import {
  CommandMenu,
  HintBar,
  Kicker,
  WorldFrame,
  pos,
  useHotkeys,
  type Act,
  type MenuEntry,
  type Push,
  type Screen,
} from "../ui.js";

const W = theme.colors.world;

/** 仕事結果の表示行（品質・フラグ・経験・報酬）。state を渡すとライバル名まで解ける（W-03） */
export function workResultLines(
  events: ActionEvent[],
  order: Order,
  quality: number,
  flags: string[],
  state?: GameState,
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
  // R-01：納めた作品の実際の品質・旗は台帳の記録（素材の質・会心作/失敗作の揺らぎ込み）
  const recorded = events.find(
    (e): e is Extract<ActionEvent, { type: "workRecorded" }> => e.type === "workRecorded",
  );
  const shownQuality = Math.round(recorded?.work.quality ?? quality);
  const shownFlags = recorded?.work.flags ?? flags;
  return [
    tpl(t.text.workResult, {
      name: order.name,
      quality: shownQuality,
      flags: shownFlags.length > 0 ? shownFlags.join("・") : "―",
      amount: (gain?.amount ?? 0).toFixed(1),
    }),
    ...(tierUp ? [tpl(t.text.workResultTier, { tier: tierUp.tier })] : []),
    ...(paid ? [tpl(t.text.moneyPaid, { amount: paid.amount })] : []),
    ...eventLines(
      events.filter(
        (e) => e.type !== "gainApplied" && e.type !== "moneyPaid" && e.type !== "tierUp",
      ),
      state,
    ),
  ];
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

export function WorkScreen({
  state,
  place,
  setScreen,
}: {
  state: GameState;
  /** 注文が届いた場所（P-01。街の鍛冶場・市場・ギルドなど）。省略時は全注文 */
  place?: string;
  setScreen: (s: Screen) => void;
}) {
  const placeDef = placeOf(place);
  const backTo: Screen = place !== undefined ? { name: "place", place } : { name: "menu" };
  const special = specialOrderOf(state.seed, state.time.day);
  // 今日の勝負所の注文（F-05）：showdown の印のある注文から日替わり1件。
  // 一覧には「勝負所：」の印を付ける —— 日常の注文は簡易判定が標準
  const showdown = showdownOrderOf(state);
  // 危機の接点（W-02）：「異変：」の印を付けた注文が日替わりで混ざる。受けても受けなくてもよい
  const crisis = crisisOrders(state);
  // 特別注文と異変の注文は先頭に並べる（目玉がスクロール下に埋もれないように）
  const all: (Order | SpecialOrder)[] = [...(special ? [special] : []), ...crisis, ...orderList];
  // 場所ごとの注文（P-01）：その場所に届く技能の注文だけを並べる。
  // 場所が無い（古い画面遷移）なら全注文のまま —— 機能は必ずどこかの場所から届く
  const list = placeDef !== undefined ? all.filter((o) => placeTakesKind(placeDef, o.kind)) : all;
  const entries: MenuEntry[] = [
    ...(special !== undefined || crisis.length > 0
      ? [{ kind: "header" as const, text: t.text.specialOrder }]
      : []),
    ...list.map((o) => {
      const kind = skillList.find((s) => s.id === o.kind)?.name ?? o.kind;
      const isSpecial = "special" in o && o.special === true;
      const isShowdown = showdown !== null && o.id === showdown.id;
      // R-01 市場の揺らぎ：日×種目の相場が動く。大きく振れた日は印を出す
      const market = marketFactorOf(state, o.kind);
      const trend = market >= 1.05 ? "・相場▲" : market <= 0.95 ? "・相場▼" : "";
      return {
        id: `order-${o.id}`,
        label: isShowdown ? `${t.text.showdownTag}${o.name}` : o.name,
        sub: `${kind}・目標${o.targetQuality}・${o.rewardMoney}G${trend}`,
        gold: isSpecial || isShowdown,
        onPick: () => setScreen({ name: "workMode", order: o, place }),
      };
    }),
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: () => setScreen(backTo) },
  ];
  return (
    <div data-testid="screen-work" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 600, bottom: 200 }), padding: "14px 4px" }}
      >
        <div style={{ margin: "2px 14px 10px" }}>
          <Kicker text="WORK" />
          <div
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 24,
              fontWeight: 800,
              color: W.hi,
              marginTop: 2,
            }}
          >
            {placeDef !== undefined ? `${placeDef.name} ―― ${t.text.orderPick}` : t.text.orderPick}
          </div>
        </div>
        <div className="scroll" style={{ maxHeight: "78%", overflowY: "auto" }}>
          <CommandMenu entries={entries} onBack={() => setScreen(backTo)} />
        </div>
      </WorldFrame>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}

export function WorkModeScreen({
  state,
  order,
  place,
  setScreen,
  act,
  push,
}: {
  state: GameState;
  order: Order;
  /** 注文が届いた場所（P-01。戻る先と景色の根拠） */
  place?: string;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
}) {
  const backTo: Screen = place !== undefined ? { name: "place", place } : { name: "menu" };
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
        // 報酬0は「記載なし」：台帳の市場価値がそのまま入る（湖畔の釣りなど。P-01）
        ...(order.rewardMoney > 0 ? { rewardMoney: order.rewardMoney } : {}),
      },
      { format: (ev) => workResultLines(ev, order, quality, [], state) },
    );
    setScreen(backTo);
  };
  const entries: MenuEntry[] = [
    {
      id: "work-manual",
      label: "自分でやる",
      sub: "ミニゲーム",
      primary: true,
      onPick: () => setScreen({ name: "minigame", kind: kindToMinigame(order.kind), order, place }),
    },
    {
      id: "work-simple",
      label: "まかせる（簡易判定・経験半分）",
      onPick: doSimple,
    },
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: () => setScreen({ name: "work", place }) },
  ];
  return (
    <div data-testid="screen-workmode" className="scene">
      <WorldFrame style={{ ...pos({ left: 300, top: 180, width: 680 }), padding: "16px 4px" }}>
        <div style={{ margin: "2px 14px 4px" }}>
          <Kicker text="ORDER" />
          <div
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 24,
              fontWeight: 800,
              color: W.hi,
              marginTop: 2,
            }}
          >
            {order.name}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: W.dim }}>{order.note}</p>
          <p style={{ margin: "8px 0 4px", fontSize: 14, color: W.text }}>
            {t.text.workModePrompt}
          </p>
        </div>
        <CommandMenu entries={entries} onBack={() => setScreen({ name: "work", place })} />
      </WorldFrame>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}

// ---- ミニゲーム（手動） ----
/** タイミング系の決定ボタンの名（鍛冶=打つ・演奏=奏でる・釣り=掛ける） */
function pressLabelOf(kind: MinigameKind): string {
  return kind === "performance"
    ? t.text.performancePress
    : kind === "fishing"
      ? t.text.fishingPress
      : "打つ";
}

export function MinigameScreen({
  state,
  kind,
  order,
  finale,
  occasion,
  place,
  setScreen,
  act,
}: {
  state: GameState;
  kind: MinigameKind;
  order: Order;
  /** 決着の場面の勝負所なら場面の id（W-03。出来は危機の備えへ寄与する） */
  finale?: string;
  /** 勝負所の行事なら行事の id（X-10。出来は行事の勝敗へ） */
  occasion?: string;
  /** 注文が届いた場所（P-01。戻る先） */
  place?: string;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  const [gs, setGs] = useState<TimingState | BoardState | DealState>(() =>
    startMinigame(kind, state),
  );
  const res = minigameResult(kind, gs);
  // 「勝負所です」の開始行はその日の勝負所の注文にだけ付く（F-05、03 §2「使い所の原則」）。
  // 日常の注文・行事の器・決着の場面の勝負所（別の語りを持つ）には付けない
  const showdown = showdownOrderOf(state);
  const isShowdown = finale === undefined && occasion === undefined && order.id === showdown?.id;
  // 結果が出た一拍の音（F-02）：目標を超えた出来なら扇、届かなければ窓の開く音
  const doneRef = useRef(false);
  useEffect(() => {
    if (!res.done || doneRef.current) return;
    doneRef.current = true;
    playSfx(res.quality >= order.targetQuality ? "fanfare" : "notice");
  }, [res.done, res.quality, order.targetQuality]);
  const quit = () =>
    setScreen(
      occasion !== undefined
        ? { name: "occasion" }
        : finale !== undefined
          ? { name: "crisis" }
          : { name: "work", place },
    );
  const startLine = isTimingKind(kind)
    ? tpl(
        kind === "performance"
          ? isShowdown
            ? t.text.performanceStart
            : t.text.performanceStartCasual
          : kind === "fishing"
            ? isShowdown
              ? t.text.fishingStart
              : t.text.fishingStartCasual
            : isShowdown
              ? t.text.workStart
              : t.text.workStartCasual,
        { name: order.name, beats: (gs as TimingState).beats.length },
      )
    : isBoardKind(kind)
      ? tpl(kind === "appraisal" ? t.text.appraisalStart : t.text.miningStart, {
          name: order.name,
        })
      : `《${order.name}》`;

  const commit = () => {
    // 勝負所の行事（X-10）：作品ではなく出来（品質→0〜1）として行事の勝敗へ
    if (occasion !== undefined) {
      act(
        { type: "occasionAttempt", id: occasion, score: res.quality / 100 },
        { format: (ev) => eventLines(ev, state) },
      );
      setScreen({ name: "menu" });
      return;
    }
    // 決着の場面の勝負所（W-03）：作品ではなく出来（品質→0〜1）として世界の備えへ
    if (finale !== undefined) {
      act(
        { type: "crisisFinaleAttempt", id: finale, score: res.quality / 100 },
        { format: (ev) => eventLines(ev, state) },
      );
      setScreen({ name: "menu" });
      return;
    }
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
        ...(order.rewardMoney > 0 ? { rewardMoney: order.rewardMoney } : {}),
      },
      { format: (ev) => workResultLines(ev, order, res.quality, res.flags, state) },
    );
    setScreen(place !== undefined ? { name: "place", place } : { name: "menu" });
  };

  const entries: MenuEntry[] = [
    ...(res.done
      ? [
          {
            id: "minigame-commit",
            // 勝負所の行事は作品の納入ではない —— 出来を勝敗として確定する
            label: occasion !== undefined ? "結果を確定" : "作品を納める",
            primary: true,
            onPick: commit,
          } satisfies MenuEntry,
        ]
      : []),
    {
      id: "minigame-quit",
      label: "やめる",
      onPick: quit,
    },
  ];

  // F-03：遊んでいる間はミニゲームの皮がキーを握る（Space/Enter・矢印・Esc）。
  // コマンド列は結果が出てから Enter を受ける（自動的に「納める」側に乗る）
  const hints: (readonly [string, string])[] = res.done
    ? [
        ["Enter", "確定"],
        ["Esc", "戻る"],
      ]
    : isTimingKind(kind)
      ? [
          ["Space・Enter", pressLabelOf(kind)],
          ["Esc", "やめる"],
        ]
      : isBoardKind(kind)
        ? [
            ["↑↓←→", "マスを選ぶ"],
            ["Enter・Space", kind === "appraisal" ? "鑑定する" : "掘る"],
            ["Esc", "やめる"],
          ]
        : [
            ["←→", "札を選ぶ"],
            ["Enter・Space", "出す"],
            ["Esc", "やめる"],
          ];

  return (
    <div data-testid="minigame" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 300, top: 130, width: 680, bottom: 200 }), padding: "16px 4px" }}
      >
        <div style={{ margin: "2px 14px 4px" }}>
          <Kicker text="WORK" />
          <div
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 22,
              fontWeight: 800,
              color: W.hi,
              marginTop: 2,
            }}
          >
            {startLine}
          </div>
        </div>
        <div style={{ margin: "0 16px" }}>
          {/* F-03：品質が目に見えて積み上がる（core の result を各拍に映す） */}
          <QualityMeter value={res.quality} target={order.targetQuality} />
          {isTimingKind(kind) && (
            <TimingView kind={kind} gs={gs as TimingState} onTick={setGs} onQuit={quit} />
          )}
          {isBoardKind(kind) && (
            <BoardView
              kind={kind}
              name={order.name}
              gs={gs as BoardState}
              onTick={setGs}
              onQuit={quit}
            />
          )}
          {kind === "negotiation" && (
            <NegotiationView gs={gs as DealState} onTick={setGs} onQuit={quit} />
          )}
        </div>
        {res.done && <ResultReveal detail={res.detail} quality={res.quality} flags={res.flags} />}
        <CommandMenu entries={entries} onBack={quit} auto={res.done} />
      </WorldFrame>
      <HintBar items={hints} />
    </div>
  );
}

/** タイミング系の皮の共通画面（鍛冶・演奏・釣り）。動く拍に合わせて押す */
function TimingView({
  kind,
  gs,
  onTick,
  onQuit,
}: {
  kind: MinigameKind;
  gs: TimingState;
  onTick: (s: TimingState) => void;
  onQuit: () => void;
}) {
  const startRef = useRef<number | null>(null);
  const [now, setNow] = useState(0);
  /** 各拍の成否（core は命中数だけ持つ。印は表示側で覚える） */
  const [marks, setMarks] = useState<BeatMark[]>([]);
  /** 命中の火花を出す拍の番号（外れでは出さない） */
  const [spark, setSpark] = useState<{ i: number; x: number; key: number } | null>(null);
  const [pulse, setPulse] = useState(0);
  const { pops, push } = useFxPops();
  const gsRef = useRef(gs);
  gsRef.current = gs;
  const sparkKey = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const elapsed = startRef.current === null ? 0 : now - startRef.current;
  const phase = beatPhase(elapsed, gs.beats, gs.halfWidth, gs.cursor);

  /** 拍を打つ（Space・Enter・クリックのどれでも） */
  const press = useCallback(() => {
    const cur = gsRef.current;
    if (cur.done || startRef.current === null) return;
    const at = performance.now() - startRef.current;
    const nxt = tickMinigame(kind, cur, { at }) as TimingState;
    const hit = nxt.hits > cur.hits;
    const bi = cur.cursor;
    const bx = railXPct(cur.beats[bi] ?? at, cur.beats);
    // 連打は常に最新の状態に対して判定する（描画を待たない）
    gsRef.current = nxt;
    setMarks((m) => [...m, hit ? "hit" : "miss"]);
    push(hit ? t.text.workHit : t.text.workMiss, hit ? "hit" : "miss", bx);
    // 命中：火花＋芯の音＋小さな揺れ。外れ：乾いた一拍だけ
    playSfx(hit ? "hit" : "miss");
    if (hit) {
      setSpark({ i: bi, x: bx, key: ++sparkKey.current });
      setPulse((p) => p + 1);
    }
    onTick(nxt);
  }, [kind, onTick, push]);

  // F-03：遊んでいる間は Space・Enter・Esc を皮が握る（コマンド列は auto=false）
  useHotkeys({ " ": press, enter: press, escape: onQuit }, !gs.done);

  const combo = comboCount(marks);
  return (
    <div style={{ marginTop: 4, position: "relative" }}>
      <div style={{ fontSize: 13, color: W.dim }}>
        {tpl(
          kind === "performance"
            ? t.text.performanceBeat
            : kind === "fishing"
              ? t.text.fishingBeat
              : t.text.workBeat,
          { n: Math.min(gs.cursor + 1, gs.beats.length) },
        )}
        （{gs.hits} 命中 / 判定窓 ±{Math.round(gs.halfWidth)}ms）
        {combo >= 2 && (
          <span data-testid="mg-combo" style={{ marginLeft: 12, color: theme.colors.special }}>
            {tpl(t.text.workCombo, { n: combo })}
          </span>
        )}
      </div>
      <ShakeBox pulse={pulse}>
        <div style={{ position: "relative" }}>
          <BeatRail gs={gs} elapsed={elapsed} marks={marks} />
          {spark !== null && (
            <SparkBurst
              key={spark.key}
              seedIndex={spark.i}
              // レールの上マージン 6px + 芯の高さ
              style={{ left: `${spark.x}%`, top: MG_RAIL_Y + 6, position: "absolute" }}
            />
          )}
        </div>
      </ShakeBox>
      <FxPopsLayer pops={pops} />
      <button
        type="button"
        data-testid={`${kind}-hit`}
        data-armed={phase.armed ? "1" : "0"}
        disabled={gs.done}
        onClick={(e) => {
          press();
          // クリック後のフォーカス残りで Space/Enter が二度効かないよう外す
          e.currentTarget.blur();
        }}
        style={{
          minHeight: 44,
          padding: "0 34px",
          border: `2px solid ${W.frame}`,
          background: "linear-gradient(180deg, #2e2418, #191320)",
          color: theme.colors.special,
          fontFamily: theme.font.mincho,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: "0.2em",
          cursor: "pointer",
        }}
      >
        {pressLabelOf(kind)}
      </button>
    </div>
  );
}

/** 盤面推理系の皮の共通画面（採掘・鑑定）。マスを1つずつ開く。開けるたび手応えあり */
function BoardView({
  kind,
  name,
  gs,
  onTick,
  onQuit,
}: {
  kind: MinigameKind;
  /** 注文の名（{name} の差し込み元。テンプレートを素のまま出さない） */
  name: string;
  gs: BoardState;
  onTick: (s: BoardState) => void;
  onQuit: () => void;
}) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const gsRef = useRef(gs);
  gsRef.current = gs;
  /** 直近に開けたマス（開ける瞬間のアニメ対象） */
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  /** 空地の手がかり数の写し（core が出したヒントをそのマスに残す。隠し情報は増やさない） */
  const [hints, setHints] = useState<Record<number, number>>({});
  const [pulse, setPulse] = useState(0);
  const { pops, push } = useFxPops();
  const foundNoun = kind === "appraisal" ? "真品" : "鉱石";

  const dig = useCallback(
    (i: number) => {
      const cur = gsRef.current;
      if (cur.done) return;
      const c = cur.cells[i];
      if (c === undefined || c.revealed) return;
      const nxt = tickMinigame(kind, cur, {
        x: i % cur.width,
        y: Math.floor(i / cur.width),
      }) as BoardState;
      gsRef.current = nxt;
      // クリックで開けたマスをカーソル位置に合わせる（続けて Enter で隣を掘れる）
      setFocus(i);
      setLastIdx(i);
      if (c.kind === "ore") {
        // 鉱石・真品：光る＋小気味よい音＋収穫の浮き文字
        playSfx("coin");
        push(
          tpl(kind === "appraisal" ? t.text.appraisalFound : t.text.miningOre, {
            found: nxt.ores,
            ores: nxt.ores,
            total: nxt.oresTotal,
          }),
          "coin",
        );
      } else if (c.kind === "rock") {
        // 危ないマス：ひび・鈍い音・揺れ
        playSfx("miss");
        push(kind === "appraisal" ? t.text.appraisalMiss : t.text.miningRock, "warn");
        setPulse((p) => p + 1);
      } else {
        playSfx("tag");
        // 空地の手がかりはマスの中に残す（core が今回返したヒントの写し）
        if (nxt.lastHint !== null) setHints((h) => ({ ...h, [i]: nxt.lastHint! }));
      }
      onTick(nxt);
    },
    [kind, onTick, push],
  );

  useHotkeys(
    {
      arrowleft: () => setFocus((f) => Math.max(0, f - 1)),
      arrowright: () => setFocus((f) => Math.min(gs.cells.length - 1, f + 1)),
      arrowup: () => setFocus((f) => Math.max(0, f - gs.width)),
      arrowdown: () => setFocus((f) => Math.min(gs.cells.length - 1, f + gs.width)),
      " ": () => dig(focusRef.current),
      enter: () => dig(focusRef.current),
      escape: onQuit,
    },
    !gs.done,
  );

  return (
    <div style={{ marginTop: 4, position: "relative" }}>
      <div style={{ fontSize: 13, color: W.dim }}>
        {gs.lastHint === null
          ? tpl(kind === "appraisal" ? t.text.appraisalStart : t.text.miningStart, { name })
          : tpl(kind === "appraisal" ? t.text.appraisalHint : t.text.miningHint, {
              radius: gs.hintRadius,
              n: gs.lastHint,
            })}
        （{foundNoun} {gs.ores}/{gs.oresTotal}）
      </div>
      <ShakeBox pulse={pulse}>
        <div
          data-testid={`${kind}-board`}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gs.width}, 36px)`,
            gap: 4,
            margin: "8px 0",
            width: "fit-content",
          }}
        >
          {gs.cells.map((c, i) => {
            const x = i % gs.width;
            const y = Math.floor(i / gs.width);
            const mark = !c.revealed
              ? "？"
              : c.kind === "ore"
                ? "◆"
                : c.kind === "rock"
                  ? "▲"
                  : "・";
            const color =
              c.kind === "ore" && c.revealed
                ? theme.colors.special
                : c.kind === "rock" && c.revealed
                  ? theme.colors.bad
                  : theme.colors.world.dim;
            const revCls =
              i === lastIdx
                ? c.kind === "ore"
                  ? " mg-rev-ore"
                  : c.kind === "rock"
                    ? " mg-rev-rock"
                    : " mg-rev-empty"
                : "";
            return (
              <button
                key={i}
                data-testid={`cell-${x}-${y}`}
                disabled={c.revealed || gs.done}
                onClick={(e) => {
                  dig(i);
                  e.currentTarget.blur();
                }}
                className={`board-cell${c.revealed ? " revealed" : ""}${revCls}${i === focus && !c.revealed && !gs.done ? " mg-focus" : ""}`}
                style={{ color, position: "relative" }}
              >
                {mark}
                {hints[i] !== undefined && <span className="mg-cell-hint">{hints[i]}</span>}
              </button>
            );
          })}
        </div>
      </ShakeBox>
      <FxPopsLayer pops={pops} />
    </div>
  );
}

/** 駆け引き系の皮（交渉）。相手の表情と押し合いの針を見せる */
function NegotiationView({
  gs,
  onTick,
  onQuit,
}: {
  gs: DealState;
  onTick: (s: DealState) => void;
  onQuit: () => void;
}) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const gsRef = useRef(gs);
  gsRef.current = gs;
  /** 直近の応酬（出した札×相手の札・与えた/被った） */
  const [clash, setClash] = useState<{
    you: DealCard;
    opp: DealCard | undefined;
    dealt: number;
    taken: number;
    key: number;
  } | null>(null);
  const { pops, push } = useFxPops();
  const topicName = (id: string) =>
    balance.minigame.negotiation.topics.find((x) => x.id === id)?.name ?? id;
  const hpMax = balance.minigame.negotiation.hp;
  const mood = negoMood(gs.playerHp, gs.opponentHp, hpMax, gs.done, gs.won);
  const edgeText =
    mood === "ahead"
      ? t.text.negoEdgeWin
      : mood === "behind"
        ? t.text.negoEdgeLose
        : t.text.negoEdgeEven;

  const play = useCallback(
    (i: number) => {
      const cur = gsRef.current;
      if (cur.done) return;
      const card = cur.hand[i];
      if (card === undefined) return;
      const opp = cur.opponentDeck[0];
      const nxt = tickMinigame("negotiation", cur, { hand: i }) as DealState;
      gsRef.current = nxt;
      const d = clashDelta(cur, nxt);
      setClash({ you: card, opp, dealt: d.dealt, taken: d.taken, key: nxt.round });
      // F-02：切った手が相手に刺されば命中音、返り討ちなら重い音
      playSfx(
        nxt.opponentHp < cur.opponentHp ? "hit" : nxt.playerHp < cur.playerHp ? "miss" : "tag",
      );
      if (d.dealt > 0) push(`あいて −${d.dealt}`, "hit", 20);
      if (d.taken > 0) push(`こちら −${d.taken}`, "warn", 78);
      // 手札が減った分、カーソルを範囲内に収める
      setFocus((f) => Math.min(f, Math.max(0, nxt.hand.length - 1)));
      onTick(nxt);
    },
    [onTick, push],
  );

  const keymap: Record<string, () => void> = {
    arrowleft: () => setFocus((f) => Math.max(0, f - 1)),
    arrowright: () => setFocus((f) => Math.min(gs.hand.length - 1, f + 1)),
    " ": () => play(focusRef.current),
    enter: () => play(focusRef.current),
    escape: onQuit,
  };
  // 数字キーでも札を出せる（手札の並びのまま 1〜9）
  gs.hand.forEach((_, i) => {
    keymap[String(i + 1)] = () => play(i);
  });
  useHotkeys(keymap, !gs.done);

  return (
    <div style={{ marginTop: 4, position: "relative" }} data-testid="nego">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <OpponentFace mood={mood} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: W.dim }}>
            {tpl(t.text.negoHp, { player: gs.playerHp, opponent: gs.opponentHp })}（{gs.round}R）
          </div>
          <PushGauge player={gs.playerHp} opponent={gs.opponentHp} max={hpMax} />
          <div style={{ fontSize: 12, color: W.dim, letterSpacing: "0.08em" }}>{edgeText}</div>
        </div>
      </div>
      {clash !== null && (
        <ClashLine
          key={clash.key}
          you={clash.you}
          opp={clash.opp}
          dealt={clash.dealt}
          taken={clash.taken}
          topicName={topicName}
        />
      )}
      <div style={{ fontSize: 13, color: W.dim }}>
        {tpl(t.text.negoPreview, {
          preview: gs.preview.map((c) => `${topicName(c.topic)}${c.power}`).join(" / ") || "―",
        })}
      </div>
      <div style={{ margin: "8px 0", color: W.text }}>{t.text.negoPrompt}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {gs.hand.map((c, i) => (
          <button
            key={i}
            type="button"
            data-testid={`hand-${i}`}
            disabled={gs.done}
            onClick={(e) => {
              play(i);
              e.currentTarget.blur();
            }}
            className={`nego-card${i === focus && !gs.done ? " focus" : ""}`}
          >
            {topicName(c.topic)} {c.power}
          </button>
        ))}
      </div>
      <FxPopsLayer pops={pops} />
    </div>
  );
}
