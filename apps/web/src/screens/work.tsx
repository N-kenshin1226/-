/** 仕事画面とミニゲーム（手動プレイ）の皮（UI-01：世界の窓＋コマンド列） */
import { useEffect, useRef, useState } from "react";
import { playSfx } from "../fx/sound.js";
import type { ActionEvent, GameState } from "@trace/core";
import { balance } from "@trace/content";
import {
  crisisOrders,
  eventLines,
  isBoardKind,
  isTimingKind,
  minigameResult,
  orderList,
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
  setScreen,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
}) {
  const special = specialOrderOf(state.seed, state.time.day);
  // 危機の接点（W-02）：「異変：」の印を付けた注文が日替わりで混ざる。受けても受けなくてもよい
  const crisis = crisisOrders(state);
  // 特別注文と異変の注文は先頭に並べる（目玉がスクロール下に埋もれないように）
  const list: (Order | SpecialOrder)[] = [...(special ? [special] : []), ...crisis, ...orderList];
  const entries: MenuEntry[] = [
    ...(special !== undefined || crisis.length > 0
      ? [{ kind: "header" as const, text: t.text.specialOrder }]
      : []),
    ...list.map((o) => {
      const kind = skillList.find((s) => s.id === o.kind)?.name ?? o.kind;
      const isSpecial = "special" in o && o.special === true;
      return {
        id: `order-${o.id}`,
        label: o.name,
        sub: `${kind}・目標${o.targetQuality}・${o.rewardMoney}G`,
        gold: isSpecial,
        onPick: () => setScreen({ name: "workMode", order: o }),
      };
    }),
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: () => setScreen({ name: "menu" }) },
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
            {t.text.orderPick}
          </div>
        </div>
        <div className="scroll" style={{ maxHeight: "78%", overflowY: "auto" }}>
          <CommandMenu entries={entries} onBack={() => setScreen({ name: "menu" })} />
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
  setScreen,
  act,
  push,
}: {
  state: GameState;
  order: Order;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
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
      { format: (ev) => workResultLines(ev, order, quality, [], state) },
    );
    setScreen({ name: "menu" });
  };
  const entries: MenuEntry[] = [
    {
      id: "work-manual",
      label: "自分でやる",
      sub: "ミニゲーム",
      primary: true,
      onPick: () => setScreen({ name: "minigame", kind: kindToMinigame(order.kind), order }),
    },
    {
      id: "work-simple",
      label: "まかせる（簡易判定・経験半分）",
      onPick: doSimple,
    },
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: () => setScreen({ name: "work" }) },
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
        <CommandMenu entries={entries} onBack={() => setScreen({ name: "work" })} />
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
export function MinigameScreen({
  state,
  kind,
  order,
  finale,
  occasion,
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
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  const [gs, setGs] = useState<TimingState | BoardState | DealState>(() =>
    startMinigame(kind, state),
  );
  const res = minigameResult(kind, gs);
  // 結果が出た一拍の音（F-02）：目標を超えた出来なら扇、届かなければ窓の開く音
  const doneRef = useRef(false);
  useEffect(() => {
    if (!res.done || doneRef.current) return;
    doneRef.current = true;
    playSfx(res.quality >= order.targetQuality ? "fanfare" : "notice");
  }, [res.done, res.quality, order.targetQuality]);
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
        rewardMoney: order.rewardMoney,
      },
      { format: (ev) => workResultLines(ev, order, res.quality, res.flags, state) },
    );
    setScreen({ name: "menu" });
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
      onPick: () =>
        setScreen(
          occasion !== undefined
            ? { name: "occasion" }
            : finale !== undefined
              ? { name: "crisis" }
              : { name: "work" },
        ),
    },
  ];

  return (
    <div data-testid="minigame" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 300, top: 130, width: 680, bottom: 200 }), padding: "16px 4px" }}
      >
        <div style={{ margin: "2px 14px 8px" }}>
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
          {isTimingKind(kind) && <TimingView kind={kind} gs={gs as TimingState} onTick={setGs} />}
          {isBoardKind(kind) && (
            <BoardView kind={kind} name={order.name} gs={gs as BoardState} onTick={setGs} />
          )}
          {kind === "negotiation" && <NegotiationView gs={gs as DealState} onTick={setGs} />}
        </div>
        {res.done && (
          <div
            data-testid="minigame-done"
            style={{ margin: "8px 16px", padding: "8px 12px", border: `1px solid ${W.frame}` }}
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: 17,
                color: theme.colors.special,
                fontFamily: theme.font.mincho,
              }}
            >
              {res.detail}（品質 {res.quality}
              {res.flags.length > 0 ? `・${res.flags.join("・")}` : ""}）
            </span>
          </div>
        )}
        <CommandMenu
          entries={entries}
          onBack={() =>
            setScreen(
              occasion !== undefined
                ? { name: "occasion" }
                : finale !== undefined
                  ? { name: "crisis" }
                  : { name: "work" },
            )
          }
        />
      </WorldFrame>
      <HintBar
        items={[
          ["Space", "打つ"],
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", "やめる"],
        ]}
      />
    </div>
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
  const pressLabel =
    kind === "performance"
      ? t.text.performancePress
      : kind === "fishing"
        ? t.text.fishingPress
        : "打つ";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 13, color: W.dim }}>
        {tpl(
          kind === "performance"
            ? t.text.performanceBeat
            : kind === "fishing"
              ? t.text.fishingBeat
              : t.text.workBeat,
          { n: gs.cursor + 1 },
        )}
        （{gs.hits} 命中 / 判定窓 ±{Math.round(gs.halfWidth)}
        ms）
      </div>
      <div style={{ letterSpacing: 6, fontSize: 22, margin: "8px 0" }}>
        {gs.beats.map((b, i) => (
          <span
            key={i}
            style={{
              color:
                i < gs.cursor
                  ? theme.colors.special
                  : i === gs.cursor && near
                    ? theme.colors.good
                    : theme.colors.world.dim,
            }}
          >
            ●
          </span>
        ))}
      </div>
      <button
        type="button"
        data-testid={`${kind}-hit`}
        disabled={gs.done}
        onClick={() => {
          const nxt = tickMinigame(kind, gs, { at: elapsed }) as TimingState;
          // F-02：命中は槌の芯、外れは乾いた一拍
          playSfx(nxt.hits > gs.hits ? "hit" : "miss");
          onTick(nxt);
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
        {pressLabel}
      </button>
    </div>
  );
}

/** 盤面推理系の皮の共通画面（採掘・鑑定）。マスを1つずつ開く */
function BoardView({
  kind,
  name,
  gs,
  onTick,
}: {
  kind: MinigameKind;
  /** 注文の名（{name} の差し込み元。テンプレートを素のまま出さない） */
  name: string;
  gs: BoardState;
  onTick: (s: BoardState) => void;
}) {
  const foundNoun = kind === "appraisal" ? "真品" : "鉱石";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 13, color: W.dim }}>
        {gs.lastHint === null
          ? tpl(kind === "appraisal" ? t.text.appraisalStart : t.text.miningStart, { name })
          : tpl(kind === "appraisal" ? t.text.appraisalHint : t.text.miningHint, {
              radius: gs.hintRadius,
              n: gs.lastHint,
            })}
        （{foundNoun} {gs.ores}/{gs.oresTotal}）
      </div>
      <div
        data-testid={`${kind}-board`}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gs.width}, 36px)`,
          gap: 4,
          margin: "8px 0",
        }}
      >
        {gs.cells.map((c, i) => {
          const x = i % gs.width;
          const y = Math.floor(i / gs.width);
          const mark = !c.revealed ? "？" : c.kind === "ore" ? "◆" : c.kind === "rock" ? "▲" : "・";
          const color =
            c.kind === "ore" && c.revealed
              ? theme.colors.special
              : c.kind === "rock" && c.revealed
                ? theme.colors.bad
                : theme.colors.world.dim;
          return (
            <button
              key={i}
              data-testid={`cell-${x}-${y}`}
              disabled={c.revealed || gs.done}
              onClick={() => {
                const nxt = tickMinigame(kind, gs, { x, y }) as BoardState;
                // F-02：鉱石・真品は小気味よい音、ハズレの石は重い音
                playSfx(c.kind === "ore" ? "coin" : c.kind === "rock" ? "miss" : "tag");
                onTick(nxt);
              }}
              className={c.revealed ? "board-cell revealed" : "board-cell"}
              style={{ color }}
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
    <div style={{ marginTop: 4 }} data-testid="nego">
      <div style={{ fontSize: 13, color: W.dim }}>
        {tpl(t.text.negoHp, { player: gs.playerHp, opponent: gs.opponentHp })}（{gs.round}R）
      </div>
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
            onClick={() => {
              const nxt = tickMinigame("negotiation", gs, { hand: i }) as DealState;
              // F-02：切った手が相手に刺されば命中音、返り討ちなら重い音
              playSfx(
                nxt.opponentHp < gs.opponentHp
                  ? "hit"
                  : nxt.playerHp < gs.playerHp
                    ? "miss"
                    : "tag",
              );
              onTick(nxt);
            }}
            style={{
              minHeight: 44,
              padding: "0 16px",
              border: `1px solid ${W.frame}`,
              background: "rgba(24,24,38,.9)",
              color: W.text,
              fontFamily: theme.font.mincho,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {topicName(c.topic)} {c.power}
          </button>
        ))}
      </div>
    </div>
  );
}
