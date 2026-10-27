/**
 * F-03 ミニゲームの動き —— 皮の演出部品。
 *   BeatRail      … タイミング系の拍レール：動く針・判定窓・縮む輪・成否の印
 *   QualityMeter  … 品質が目に見えて積み上がるゲージ（目標の刻み付き）
 *   useFxPops     … 判定・収穫の浮き文字（命中！／外れ／鉱脈だ！）
 *   SparkBurst    … 命中の一拍に散る火花（散り方は拍の番号で決まる）
 *   ShakeBox      … 命中の一拍に小さく揺れる枠
 *   ResultReveal  … 終了時の見せ場：品質のカウントアップ＋旗の章。クリックで即確定
 *   OpponentFace  … 交渉相手のシルエット（押し合いの局面で表情が変わる）
 *   PushGauge     … 押している／押されているの引き分けゲージ
 *
 * ルールには触れない ―― core が返す状態を映すだけ。乱数は使わない
 * （火花の向き・浮き文字の出方は拍・札の番号から決める）。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { DealCard, TimingState } from "@trace/core";
import { theme } from "../theme.js";
import { CountUp } from "./fx.js";
import { fxMs, motionOff, useFxSettings } from "./settings.js";
import {
  beatPhase,
  railXPct,
  ringProgress,
  sparkDirs,
  type BeatMark,
  type NegoMood,
} from "./motion.js";

const W = theme.colors.world;

/* ── 浮き文字（判定・収穫のひと言） ── */

export interface FxPop {
  key: number;
  text: string;
  /** hit=金の命中 / miss=鈍い外れ / coin=収穫 / warn=危ない手 / plain=平常 */
  tone: "hit" | "miss" | "coin" | "warn" | "plain";
  /** レール上の位置（%）。省略時は中央 */
  leftPct?: number;
}

/**
 * 浮き文字を積むフック。push は描画位置だけ決め、寿命（fx.floatMs）で自然に抜ける。
 * 「演出を短く」では寿命が短い側に切り替わる
 */
export function useFxPops(): {
  pops: readonly FxPop[];
  push: (text: string, tone?: FxPop["tone"], leftPct?: number) => void;
} {
  const [pops, setPops] = useState<FxPop[]>([]);
  const keyRef = useRef(0);
  const push = useCallback((text: string, tone: FxPop["tone"] = "plain", leftPct?: number) => {
    const key = ++keyRef.current;
    setPops((p) => [...p.slice(-5), { key, text, tone, leftPct }]);
    const life = fxMs(theme.fx.floatMs, theme.fx.floatShortMs);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.key !== key)), life + 80);
  }, []);
  return { pops, push };
}

export function FxPopsLayer({ pops }: { pops: readonly FxPop[] }) {
  const s = useFxSettings();
  const ms = s.shortFx ? theme.fx.floatShortMs : theme.fx.floatMs;
  return (
    <div aria-hidden className="mg-pops">
      {pops.map((p) => (
        <span
          key={p.key}
          className={`mg-float mg-float-${p.tone}`}
          style={{ left: `${p.leftPct ?? 50}%`, animationDuration: `${ms}ms` }}
        >
          {p.text}
        </span>
      ))}
    </div>
  );
}

/* ── 火花（命中の一拍） ── */

export function SparkBurst({
  seedIndex,
  style,
}: {
  /** 拍の番号 → 散り方が決まる */
  seedIndex: number;
  style?: CSSProperties;
}) {
  if (motionOff()) return null;
  return (
    <span aria-hidden className="mg-spark" style={style}>
      {sparkDirs(seedIndex).map(([dx, dy], i) => (
        <i key={i} className="mg-spark-line" style={{ "--dx": dx, "--dy": dy } as CSSProperties} />
      ))}
    </span>
  );
}

/* ── 揺れ（命中の一拍に小さく） ── */

/** pulse が増えるたびに一回だけ揺れる。prefers-reduced-motion では揺れない */
export function ShakeBox({
  pulse,
  children,
  style,
}: {
  pulse: number;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const s = useFxSettings();
  const ms = s.shortFx ? theme.fx.shakeShortMs : theme.fx.shakeMs;
  return (
    <div
      key={pulse}
      className={pulse > 0 && !motionOff() ? "mg-shake" : undefined}
      style={{ animationDuration: `${ms}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* ── タイミング系の拍レール ── */

const RAIL_H = 78;
/** レールの芯の高さ（火花・浮き文字を拍の位置に合わせるため外からも使う） */
export const MG_RAIL_Y = 44;
const RAIL_Y = MG_RAIL_Y;

/**
 * 拍の流れるレール。針（現在時刻）・判定窓（拍の周りの帯）・縮む輪・
 * 解いた拍の印（命中＝金の●・外れ＝珊瑚の×）を重ねる。
 * data-armed は「今押せば届く」間だけ立つ（e2e が押し所を待つ印）。
 */
export function BeatRail({
  gs,
  elapsed,
  marks,
}: {
  gs: TimingState;
  elapsed: number;
  marks: readonly BeatMark[];
}) {
  const beats = gs.beats;
  const X = (t: number) => railXPct(t, beats);
  const phase = beatPhase(elapsed, beats, gs.halfWidth, gs.cursor);
  const winPct = phase.at !== null ? X(phase.at + gs.halfWidth) - X(phase.at - gs.halfWidth) : 0;
  const prev = gs.cursor > 0 ? (beats[gs.cursor - 1] ?? 0) : 0;
  const rp = phase.at !== null ? ringProgress(elapsed, phase.at, prev) : 1;
  const ringD = 44 - 34 * rp; // 外 44 → 的 10
  return (
    <div
      data-testid="mg-beat-rail"
      data-armed={phase.armed ? "1" : "0"}
      data-late={phase.late ? "1" : "0"}
      className="mg-rail"
      style={{ position: "relative", height: RAIL_H, margin: "6px 0 2px" }}
    >
      {/* レールの芯 */}
      <div className="mg-rail-line" style={{ top: RAIL_Y }} />
      {/* 判定窓：今の拍の周りの帯（ここに針が重なれば届く） */}
      {phase.at !== null && (
        <div
          data-testid="mg-window"
          className={`mg-window${phase.armed ? " on" : ""}`}
          style={{
            left: `calc(${X(phase.at)}% - ${winPct / 2}%)`,
            width: `${winPct}%`,
            top: RAIL_Y - 15,
            height: 30,
          }}
        />
      )}
      {/* 拍の印 */}
      {beats.map((b, i) => {
        const m = marks[i];
        const cur = i === gs.cursor;
        const glyph = m === "hit" ? "●" : m === "miss" ? "×" : cur ? "◎" : "○";
        const cls = `mg-beat${m === "hit" ? " hit" : ""}${m === "miss" ? " miss" : ""}${cur ? " cur" : ""}`;
        return (
          <span key={i} className={cls} style={{ left: `${X(b)}%`, top: RAIL_Y }}>
            {glyph}
          </span>
        );
      })}
      {/* 縮む輪：外側から的へ収まる。窓の内側は緑、遅れは珊瑚 */}
      {phase.at !== null && (
        <div
          className={`mg-ring${phase.armed ? " armed" : ""}${phase.late ? " late" : ""}`}
          style={{
            left: `${X(phase.at)}%`,
            top: RAIL_Y,
            width: ringD,
            height: ringD,
            marginLeft: -ringD / 2,
            marginTop: -ringD / 2,
          }}
        />
      )}
      {/* 針：経過時間の現在位置 */}
      <div className="mg-playhead" style={{ left: `${X(elapsed)}%`, top: RAIL_Y - 22 }} />
    </div>
  );
}

/* ── 品質の積み上げゲージ ── */

/**
 * 「出来」の今の見込みを数と帯で見せる。core の result() を各拍に映すので
 * 命中・収穫のたびに伸び、外すと頭打ちが見える。目標品質の刻み付き。
 */
export function QualityMeter({
  value,
  target,
  max = 100,
  testId = "mg-quality",
}: {
  value: number;
  /** 注文の目標品質（帯の刻み） */
  target?: number;
  max?: number;
  testId?: string;
}) {
  const prev = useRef(0);
  const from = prev.current;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const reached = target !== undefined && value >= target;
  return (
    <div className="mg-quality" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          color: W.dim,
          fontFamily: theme.font.sys,
          fontSize: 11,
          letterSpacing: "0.14em",
        }}
      >
        品質
      </span>
      <div className="mg-qbar" style={{ position: "relative", flex: 1 }}>
        <div
          className={`mg-qbar-v${reached ? " reached" : ""}`}
          style={{ width: `${pct}%` }}
          data-testid={`${testId}-bar`}
          data-value={pct.toFixed(1)}
        />
        {target !== undefined && (
          <div
            className="mg-qbar-tick"
            style={{ left: `${Math.min(100, (target / max) * 100)}%` }}
            title={`目標 ${target}`}
          />
        )}
      </div>
      <span
        style={{
          fontFamily: theme.font.en,
          fontSize: 15,
          color: reached ? theme.colors.good : W.light,
          minWidth: 40,
          textAlign: "right",
        }}
      >
        <CountUp from={from} to={value} digits={0} testId={testId} />
      </span>
    </div>
  );
}

/* ── 結果の見せ場 ── */

/**
 * 終了の一拍の窓：detail（何を成したか）・品質のカウントアップ・旗の章。
 * 窓をクリックすれば動きを飛ばして確定できる（演出は Enter/クリックで飛ばせる）。
 */
export function ResultReveal({
  detail,
  quality,
  flags,
  testId = "minigame-done",
}: {
  detail: string;
  quality: number;
  flags: readonly string[];
  testId?: string;
}) {
  const [settled, setSettled] = useState(false);
  const s = useFxSettings();
  const revealMs = s.shortFx ? theme.fx.revealShortMs : theme.fx.revealMs;
  return (
    <div
      data-testid={testId}
      data-settled={settled ? "1" : "0"}
      className="mg-result"
      role="button"
      tabIndex={0}
      onClick={() => setSettled(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setSettled(true);
      }}
      style={{ animationDuration: `${revealMs}ms` }}
    >
      <div className="mg-result-detail" style={{ animationDelay: `${revealMs * 0.35}ms` }}>
        {detail}
      </div>
      <div className="mg-result-q">
        <span className="mg-result-qlabel">品質</span>
        <span className="mg-result-qnum" data-testid="mg-result-quality">
          {settled ? (
            Math.round(quality)
          ) : (
            <CountUp from={0} to={quality} digits={0} testId="mg-result-countup" />
          )}
        </span>
      </div>
      {flags.length > 0 && (
        <div className="mg-result-flags">
          {flags.map((f, i) => (
            <span
              key={f}
              data-testid="mg-flag"
              className="mg-flag"
              style={{ animationDelay: `${revealMs * 0.5 + i * 120}ms` }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
      {!settled && <div className="mg-result-skip">クリックで確定</div>}
    </div>
  );
}

/* ── 交渉：相手の顔と押し合い ── */

/**
 * 口論の相手のシルエット（仮の絵）。押し合いの局面で表情が変わる：
 * 互角＝真っ直ぐ／こちら優勢＝焦り／あいて優勢＝にやり／折れた＝×目／ほくそ笑む。
 */
export function OpponentFace({ mood }: { mood: NegoMood }) {
  const eyeL = mood === "beaten" ? "M36 42 l7 7 M43 42 l-7 7" : null;
  const eyeR = mood === "beaten" ? "M53 42 l7 7 M60 42 l-7 7" : null;
  const mouth =
    mood === "beaten"
      ? "M42 64 q6 -4 12 0" // うめき
      : mood === "smug"
        ? "M40 58 q8 7 16 0" // ほくそ笑み
        : mood === "ahead"
          ? "M41 62 q7 -5 14 0" // 焦りのへの字
          : mood === "behind"
            ? "M42 60 q7 4 14 -2" // にやり（非対称）
            : "M42 60 h12"; // 互角
  const tilt = mood === "ahead" ? 7 : mood === "behind" || mood === "smug" ? -4 : 0;
  const droop = mood === "beaten" ? 5 : 0;
  return (
    <svg
      viewBox="0 0 96 104"
      width="86"
      height="94"
      className="mg-face"
      data-testid="nego-face"
      data-mood={mood}
      aria-hidden="true"
    >
      {/* 外套のシルエット */}
      <path
        d="M12 100 Q8 58 26 40 Q36 28 48 28 Q60 28 70 40 Q88 58 84 100 Z"
        fill="#13111c"
        stroke={W.frame}
        strokeWidth="1.4"
      />
      <g
        transform={`rotate(${tilt} 48 46) translate(0 ${droop})`}
        style={{ transition: "transform .3s" }}
      >
        {/* 顔（フードの影） */}
        <circle cx="48" cy="48" r="19" fill="#1d1928" stroke={W.edge} strokeWidth="1" />
        {eyeL !== null ? (
          <>
            <path d={eyeL} stroke={W.text} strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d={eyeR!} stroke={W.text} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* 目：優勢で細く、焦りで見開く */}
            <ellipse
              cx="40"
              cy="46"
              rx={mood === "ahead" ? 2.4 : 2}
              ry={mood === "behind" || mood === "smug" ? 1 : mood === "ahead" ? 2.6 : 2}
              fill={W.text}
            />
            <ellipse
              cx="56"
              cy="46"
              rx={mood === "ahead" ? 2.4 : 2}
              ry={mood === "behind" || mood === "smug" ? 1 : mood === "ahead" ? 2.6 : 2}
              fill={W.text}
            />
          </>
        )}
        <path
          d={mouth}
          stroke={mood === "smug" || mood === "behind" ? W.light : W.text}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** 押し合いの引き分けゲージ：針がこちら側に寄れば押している */
export function PushGauge({
  player,
  opponent,
  max,
}: {
  player: number;
  opponent: number;
  max: number;
}) {
  const edge = max <= 0 ? 0 : Math.min(1, Math.max(-1, (player - opponent) / max));
  const x = 50 + edge * 44; // 中央 50%、端までは ±44%
  return (
    <div className="mg-push" data-testid="nego-push" data-edge={edge.toFixed(2)}>
      <span className="mg-push-side" style={{ left: 0 }}>
        あいて
      </span>
      <div className="mg-push-bar">
        <div className="mg-push-center" />
        <div className="mg-push-needle" style={{ left: `${x}%` }} />
      </div>
      <span className="mg-push-side" style={{ right: 0 }}>
        こちら
      </span>
    </div>
  );
}

/** 交渉の1手の応酬の見せ（「値段3 × 品質2」に与・被の差を添える） */
export function ClashLine({
  you,
  opp,
  dealt,
  taken,
  topicName,
}: {
  you: DealCard;
  opp: DealCard | undefined;
  dealt: number;
  taken: number;
  topicName: (id: string) => string;
}) {
  return (
    <div className="mg-clash" data-testid="nego-clash">
      <span className="mg-clash-card you">
        {topicName(you.topic)}
        {you.power}
      </span>
      <span className="mg-clash-x">×</span>
      <span className="mg-clash-card opp">
        {opp !== undefined ? `${topicName(opp.topic)}${opp.power}` : "――"}
      </span>
      <span className="mg-clash-dmg" style={{ color: theme.colors.good }}>
        −{dealt}
      </span>
      <span className="mg-clash-dmg" style={{ color: theme.colors.bad }}>
        −{taken}
      </span>
    </div>
  );
}
