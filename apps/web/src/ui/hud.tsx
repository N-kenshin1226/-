/**
 * HUD 部品（UI-01、README 部品節）：
 *   Candles   … 残り行動。灯っている＝残り
 *   CellGauge … 疲労の10マス区切りゲージ
 *   SegGauge  … 起床ログの技能ゲージ（定着分＝青白・伸び分＝金）
 *   SkillBar  … 熟練の細いバー＋未定着分の半透明オーバーレイ
 *   WindChip  … 追い風（▲金）／逆風（▼珊瑚）
 *   RankCrest … 盾形の紋章に階級の頭文字（見・初・一・熟・達・極）
 */
import type { CSSProperties } from "react";

/** 蝋燭1本分のSVG（灯っている=金の炎、消えた=芯だけ） */
function Candle({ lit }: { lit: boolean }) {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
      {lit && <path d="M7 1C9 5 11 7 11 10a4 4 0 01-8 0c0-3 2-5 4-9z" fill="#f0c26a" />}
      <rect x="4" y="13" width="6" height="7" fill={lit ? "#e9e1cc" : "#6d6658"} />
    </svg>
  );
}

/** 残り行動の蝋燭（lit 本が灯っている） */
export function Candles({ lit, total }: { lit: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }} aria-label={`残り行動 ${total}のうち${lit}`}>
      {Array.from({ length: total }, (_, i) => (
        <Candle key={i} lit={i < lit} />
      ))}
    </div>
  );
}

/** 疲労の10マス区切りゲージ（世界の窓の中用） */
export function CellGauge({
  value,
  max = 100,
  cells = 10,
}: {
  value: number;
  max?: number;
  cells?: number;
}) {
  const lit = Math.round((value / max) * cells);
  return (
    <div style={{ display: "flex", gap: 2 }} aria-label={`疲労 ${Math.round(value)}/${max}`}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={i < lit ? "cell f" : "cell"} />
      ))}
    </div>
  );
}

/**
 * 起床ログの区切りゲージ（加護の窓用）。from→to を 0〜scale でマスに写す。
 * 定着分は青白（.f）、伸び分は金（.g）
 */
export function SegGauge({
  from,
  to,
  scale = 100,
  cells = 20,
}: {
  from: number;
  to: number;
  scale?: number;
  cells?: number;
}) {
  const f = Math.round((from / scale) * cells);
  const t = Math.max(f + (to > from ? 1 : 0), Math.round((to / scale) * cells));
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={i < f ? "seg f" : i < t ? "seg g" : "seg"} />
      ))}
    </div>
  );
}

/** 熟練の細いバー＋未定着分の半透明オーバーレイ */
export function SkillBar({
  value,
  pending = 0,
  max = 100,
  bless = false,
  width,
}: {
  value: number;
  pending?: number;
  max?: number;
  bless?: boolean;
  width?: number | string;
}) {
  const v = Math.min(100, (value / max) * 100);
  const p = Math.min(100 - v, (pending / max) * 100);
  return (
    <div
      className={bless ? "skbar b" : "skbar"}
      style={width !== undefined ? { width } : undefined}
    >
      <div className="v" style={{ width: `${v}%` }} />
      {p > 0 && <div className="p" style={{ left: `${v}%`, width: `${p}%` }} />}
    </div>
  );
}

/** 追い風（▲金）・逆風（▼珊瑚）の札 */
export function WindChip({
  direction,
  label,
  style,
}: {
  direction: "tailwind" | "headwind";
  label: string;
  style?: CSSProperties;
}) {
  return (
    <span className={direction === "tailwind" ? "windchip tail" : "windchip head"} style={style}>
      {direction === "tailwind" ? "▲" : "▼"} {label}
    </span>
  );
}

/** ステータス行の右側チップ（追い風＝金・伸び悩み/錆＝珊瑚・通常＝銀青） */
export function StChip({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "gold" | "warn";
}) {
  return (
    <span className={`stchip${tone === "gold" ? " gold" : tone === "warn" ? " warn" : ""}`}>
      {children}
    </span>
  );
}

/**
 * ランクの紋章（盾形＋頭文字）。unknown は未発見（？・輪郭だけ暗い）
 */
export function RankCrest({
  letter,
  unknown = false,
  size = 40,
}: {
  letter: string;
  unknown?: boolean;
  size?: number;
}) {
  const h = (size / 40) * 44;
  return (
    <svg className="crest" width={size} height={h} viewBox="0 0 40 44" aria-hidden="true">
      <path
        d="M20 2 L37 8 V22 C37 33 29 40 20 42 C11 40 3 33 3 22 V8 Z"
        fill={unknown ? "#0b1820" : "#123543"}
        stroke={unknown ? "#2c5866" : "#8fc7d4"}
        strokeWidth="1.5"
      />
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fontFamily="'Shippori Mincho B1', serif"
        fontSize="16"
        fontWeight="700"
        fill={unknown ? "#4f7f8c" : "#eaf8fb"}
      >
        {letter}
      </text>
    </svg>
  );
}
