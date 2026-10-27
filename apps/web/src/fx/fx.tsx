/**
 * 演出部品（F-02）。表示だけの動きを集める：
 *   CountUp    … 数値が滑らかに変わる（起床ログの 25.1 → 26.8 など）
 *   FxTagLayer … B通知の札：右上に滑り込み、数秒で消える。クリックでも畳める
 *   CrestShift … 熟練の階級が変わったとき紋章が入れ替わる
 *
 * 演出時間は theme.fx の値を「演出を短く」設定で短い側に切り替える。
 * ゲーム状態には一切触れない（表示層専用）。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FxTag } from "../game.js";
import { RankCrest } from "../ui/hud.js";
import { theme } from "../theme.js";
import { fxMs, motionOff, useFxSettings } from "./settings.js";
import { playSfx } from "./sound.js";

/**
 * 数値のカウントアップ。from→to をイーズアウトで `ms` ミリ秒かけて描く。
 * data-value 属性に今表示中の値を出すので e2e が途中経過を見られる。
 * prefers-reduced-motion では即座に最終値になる。
 */
export function CountUp({
  from,
  to,
  digits = 1,
  ms,
  className,
  style,
  testId,
}: {
  from: number;
  to: number;
  digits?: number;
  /** 省略時は theme.fx.countUpMs（「演出を短く」で countUpShortMs） */
  ms?: number;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  const dur = ms ?? fxMs(theme.fx.countUpMs, theme.fx.countUpShortMs);
  const [v, setV] = useState(from);
  useEffect(() => {
    if (motionOff() || dur <= 0 || from === to) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      // easeOutCubic：最初は速く、終わりでゆっくり止まる
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, dur]);
  return (
    <span className={className} style={style} data-testid={testId} data-value={v.toFixed(digits)}>
      {v.toFixed(digits)}
    </span>
  );
}

export type { FxTag };

export interface FxTagItem {
  key: number;
  tag: FxTag;
  /** 退場中（フェードアウト）か */
  leaving: boolean;
}

/**
 * B通知の札の重なり（画面右上）。各札は寿命で自動的に消え、クリックでも畳める。
 * Enter キーは握らない ―― 札は非モーダルなので下の画面の操作を妨げない
 */
export function FxTagLayer({
  items,
  onDismiss,
}: {
  items: FxTagItem[];
  onDismiss: (key: number) => void;
}) {
  const s = useFxSettings();
  const life = s.shortFx ? theme.fx.tagLifeShortMs : theme.fx.tagLifeMs;
  return (
    <div
      data-testid="fx-tags"
      aria-live="polite"
      style={{
        position: "absolute",
        right: 24,
        top: 96,
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {items.map((it) => (
        <FxTagView key={it.key} item={it} life={life} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE_ICON: Record<FxTag["tone"], string | null> = {
  title: "称号",
  coin: "G",
  whisper: null,
  plain: null,
};

function FxTagView({
  item,
  life,
  onDismiss,
}: {
  item: FxTagItem;
  life: number;
  onDismiss: (key: number) => void;
}) {
  const { key, tag } = item;
  // 寿命タイマ：life 後に退場へ。退場アニメ分は呼び出し側が畳む
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    timer.current = window.setTimeout(() => onDismiss(key), life);
    return () => window.clearTimeout(timer.current);
  }, [key, life, onDismiss]);
  // 届いた一拍に小さな音（F-02）：報酬は銅貨、ほかは控えめな滑り込み音
  useEffect(() => playSfx(tag.tone === "coin" ? "coin" : "tag"), [tag.tone]);
  const icon = TONE_ICON[tag.tone];
  return (
    <button
      type="button"
      data-testid="fx-tag"
      data-tone={tag.tone}
      className={`fx-tag fx-tag-${tag.tone}${item.leaving ? " out" : ""}`}
      onClick={() => onDismiss(key)}
      style={{ pointerEvents: "auto" }}
    >
      {icon !== null && <span className="fx-tag-icon">{icon}</span>}
      {tag.text}
    </button>
  );
}

/**
 * 熟練の階級の紋章が変わる演出。from/to の文字が同じなら静止した紋章、
 * 違えば古い紋章が消えて新しい紋章が弾ける（.crest-out / .crest-in）。
 */
export function CrestShift({
  from,
  to,
  size = 30,
}: {
  /** 変化前の階級の頭文字（見・初・一・熟・達・極） */
  from: string;
  /** 変化後の階級の頭文字 */
  to: string;
  size?: number;
}) {
  if (from === to) return <RankCrest letter={to} size={size} />;
  return (
    <span
      className="crest-shift"
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: (size / 40) * 44,
      }}
      aria-label={`階級 ${from} から ${to} へ`}
    >
      <span className="crest-out" style={{ position: "absolute", inset: 0 }}>
        <RankCrest letter={from} size={size} />
      </span>
      <span className="crest-in" style={{ position: "absolute", inset: 0 }}>
        <RankCrest letter={to} size={size} />
      </span>
    </span>
  );
}

/**
 * 所持金が変わった瞬間の小さな演出（数がめくれ、チップが光る）。
 * anim の区間だけ CountUp を挿し、終わると静的な数に戻す
 */
export function MoneyCount({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const prev = useRef(value);
  const [anim, setAnim] = useState<{ from: number; to: number } | null>(null);
  const dur = fxMs(theme.fx.countUpMs, theme.fx.countUpShortMs) * 0.6;
  useEffect(() => {
    if (prev.current === value) return undefined;
    const from = prev.current;
    prev.current = value;
    setAnim({ from, to: value });
    const id = window.setTimeout(() => setAnim(null), Math.max(dur, theme.fx.coinFlashMs));
    return () => window.clearTimeout(id);
  }, [value, dur]);
  return (
    <span className={anim !== null ? "coin-flash" : undefined} style={style}>
      {anim === null ? (
        <span className={className}>{value}</span>
      ) : (
        <CountUp
          className={className}
          from={anim.from}
          to={anim.to}
          digits={0}
          ms={Math.round(dur)}
        />
      )}
    </span>
  );
}
