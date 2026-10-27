/**
 * 3種類の窓（UI-01、README §3）：
 *   WorldFrame（金）     … コマンド・会話・HUD。金の三重線＋菱形の角飾り
 *   BlessingWindow（銀青）… ステータス・起床ログ・システムの声。円の角飾り＋外光
 *   Paper               … 新聞・手紙・書物・見聞録。焼けた縁・傾き・落ち影
 * 角飾りは SVG で窓の外側に少しはみ出して置く（見本と同じ 28/30px）
 */
import type { CSSProperties, ReactNode } from "react";
import { theme } from "../theme.js";

type Corner = "tl" | "tr" | "bl" | "br";
const ALL: Corner[] = ["tl", "tr", "bl", "br"];

/** 世界の窓の角飾り（菱形を含む二重の肘線） */
function GoldCorner({ at }: { at: Corner }) {
  return (
    <svg className={`cnr ${at}`} viewBox="0 0 28 28" aria-hidden="true">
      <path d="M3 26V10c0-3.9 3.1-7 7-7h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 26V13c0-2.8 2.2-5 5-5h13" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="1.5" y="1.5" width="5" height="5" transform="rotate(45 4 4)" fill="currentColor" />
    </svg>
  );
}

/** 加護の窓の角飾り（円を含む二重の肘線） */
function BlessCorner({ at }: { at: Corner }) {
  return (
    <svg className={`cnr ${at}`} viewBox="0 0 30 30" aria-hidden="true">
      <path d="M3 28V11c0-4.4 3.6-8 8-8h17" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 28V14c0-3.3 2.7-6 6-6h14" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

function Corners({ list, kind }: { list: Corner[]; kind: "gold" | "bless" }) {
  return (
    <>
      {list.map((c) =>
        kind === "gold" ? <GoldCorner key={c} at={c} /> : <BlessCorner key={c} at={c} />,
      )}
    </>
  );
}

export function WorldFrame({
  children,
  style,
  corners = ALL,
  testId,
  label,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  /** 出す角飾り（既定は四隅） */
  corners?: Corner[];
  testId?: string;
  label?: string;
}) {
  return (
    <section className="frame" style={style} data-testid={testId} aria-label={label}>
      <Corners list={corners} kind="gold" />
      {children}
    </section>
  );
}

export function BlessingWindow({
  children,
  style,
  corners = ALL,
  testId,
  label,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  corners?: Corner[];
  testId?: string;
  label?: string;
}) {
  return (
    <section className="win" style={style} data-testid={testId} aria-label={label}>
      <Corners list={corners} kind="bless" />
      {children}
    </section>
  );
}

/** 紙（新聞・見聞録・書物）。わずかな傾きは既定 -1.2deg */
export function Paper({
  children,
  style,
  tilt = -1.2,
  testId,
  label,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  tilt?: number;
  testId?: string;
  label?: string;
}) {
  return (
    <article
      className="paper"
      style={{ transform: `rotate(${tilt}deg)`, ...style }}
      data-testid={testId}
      aria-label={label}
    >
      {children}
    </article>
  );
}

/** 名札プレート（場所名・会話窓の話し手） */
export function Plate({
  children,
  style,
  testId,
}: {
  children: ReactNode;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <div className="plate" style={style} data-testid={testId}>
      {children}
    </div>
  );
}

/** 欧文の小見出し（ACTION など、Cinzel・字間広め） */
export function Kicker({
  text,
  style,
  bless = false,
}: {
  text: string;
  style?: CSSProperties;
  bless?: boolean;
}) {
  return (
    <p className="menu-head" style={bless ? { ...style, color: theme.colors.bless.glow } : style}>
      {text}
    </p>
  );
}

/** 区切りの細い帯（左右に消えるグラデーション線） */
export function Divider({ bless = false, style }: { bless?: boolean; style?: CSSProperties }) {
  return <div className={bless ? "divider b" : "divider"} style={style} />;
}
