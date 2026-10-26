/** 仕事画面とミニゲーム（手動プレイ）の皮（X-2 で App.tsx から分離） */
import { useEffect, useRef, useState } from "react";
import type { ActionEvent, GameState } from "@trace/core";
import { balance } from "@trace/content";
import {
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
import { Btn, CardTitle, css, type Act, type Push, type Screen } from "../ui.js";

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
  const list: (Order | SpecialOrder)[] = special ? [...orderList, special] : orderList;
  return (
    <section style={css.panel} data-testid="screen-work">
      <CardTitle>{t.text.orderPick}</CardTitle>
      {special && <div style={{ ...css.accent }}>{t.text.specialOrder}</div>}
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
      { format: (ev) => workResultLines(ev, order, quality, []) },
    );
    setScreen({ name: "menu" });
  };
  return (
    <section style={css.panel} data-testid="screen-workmode">
      <CardTitle>{order.name}</CardTitle>
      <div style={css.dim}>{order.note}</div>
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
export function MinigameScreen({
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
      <CardTitle>{startLine}</CardTitle>
      {isTimingKind(kind) && <TimingView kind={kind} gs={gs as TimingState} onTick={setGs} />}
      {isBoardKind(kind) && <BoardView kind={kind} gs={gs as BoardState} onTick={setGs} />}
      {kind === "negotiation" && <NegotiationView gs={gs as DealState} onTick={setGs} />}
      {res.done && (
        <div data-testid="minigame-done" style={{ marginTop: 8 }} className="pop-in">
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.colors.accentDark }}>
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
      <div style={{ letterSpacing: 6, fontSize: 22, margin: "8px 0" }}>
        {gs.beats.map((b, i) => (
          <span
            key={i}
            style={{
              color:
                i < gs.cursor
                  ? theme.colors.gold
                  : i === gs.cursor && near
                    ? theme.colors.good
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
              ? theme.colors.gold
              : c.kind === "rock" && c.revealed
                ? theme.colors.bad
                : theme.colors.textDim;
          return (
            <button
              key={i}
              data-testid={`cell-${x}-${y}`}
              disabled={c.revealed || gs.done}
              onClick={() => onTick(tickMinigame(kind, gs, { x, y }) as BoardState)}
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
