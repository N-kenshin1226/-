/**
 * キーボード操作（UI-01、README 決まりごと4・5）：
 *   CommandMenu … ↑↓ で選び Enter で決定。選択中は三角カーソル＋金の帯。
 *                  使えない項目は飛ばす。Esc は onBack。マウスでも操作できる。
 *   KeyHints    … 画面下に常に出す操作ガイド（キーキャップ付き）
 *   useHotkeys  … 画面ごとの補助キー（S＝ステータス、N＝新聞、Q/E＝タブなど）
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ── 項目 ── */
export interface CmdItem {
  /** data-testid に使う一意なID（既存のE2Eは menu-train など testId を指す） */
  id: string;
  label: ReactNode;
  /** 右端の小さな補足（場所・費用など） */
  sub?: ReactNode;
  disabled?: boolean;
  /** 危険な操作（記録を消す等）。珊瑚色のラベルになる */
  danger?: boolean;
  /** 主行動（眠る・確定など）。金色のラベルになる。1画面に1つ */
  primary?: boolean;
  /** 特別な項目（強個体・特別注文など）。金色のラベルになる */
  gold?: boolean;
  onPick: () => void;
}
export type MenuEntry = CmdItem | { kind: "header"; text: string } | { kind: "divider" };

const isItem = (e: MenuEntry): e is CmdItem => !("kind" in e);

/**
 * ↑↓/Enter/Esc で動くコマンド列。選択中（.on）・通常・使えない（.off）の3状態。
 * bless=true で加護の窓配色（銀青）に切り替わる
 */
export function CommandMenu({
  entries,
  onBack,
  bless = false,
  paper = false,
  testId,
  auto = true,
}: {
  entries: MenuEntry[];
  onBack?: () => void;
  /** 加護の窓の中の選択肢（銀青の帯・三角） */
  bless?: boolean;
  /** 紙の上の選択肢（本・記録の目次。墨色の帯・三角） */
  paper?: boolean;
  testId?: string;
  /** false の間はキーを受け付けない（モーダル等で入力を止める用） */
  auto?: boolean;
}) {
  const items = useMemo(() => entries.filter(isItem), [entries]);
  const [focus, setFocus] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const focusRef = useRef(focus);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // 項目が変わったらカーソルを範囲内に収める（錆びて消えた項目・増えた難度など）
  useEffect(() => {
    const clamped = Math.min(focusRef.current, Math.max(0, items.length - 1));
    focusRef.current = clamped;
    setFocus(clamped);
  }, [items.length]);
  // スクロール内の列では、動いたカーソルが常に見えるようにする
  useEffect(() => {
    navRef.current?.querySelector(`[data-idx="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);
  // 下にまだ項目があるなら「▼」を出す（開始/主行動が埋もれて見つからない事故の防止）
  const [more, setMore] = useState(false);
  useEffect(() => {
    const scroller = navRef.current?.closest<HTMLElement>(".scroll");
    if (!scroller) {
      setMore(false);
      return;
    }
    const check = () =>
      setMore(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 8);
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [items.length]);

  useEffect(() => {
    if (!auto) return;
    const move = (dir: 1 | -1) => {
      const list = itemsRef.current;
      if (list.length === 0) return;
      let i = focusRef.current;
      for (let n = 0; n < list.length; n++) {
        i = (i + dir + list.length) % list.length;
        if (!list[i]!.disabled) break;
      }
      // ref を先に進める（連打時に React の描画を待たず次のキーを正しく数える）
      focusRef.current = i;
      setFocus(i);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      switch (e.key) {
        case "ArrowDown":
          move(1);
          e.preventDefault();
          break;
        case "ArrowUp":
          move(-1);
          e.preventDefault();
          break;
        case "Enter": {
          const it = itemsRef.current[focusRef.current];
          if (it && !it.disabled) it.onPick();
          e.preventDefault();
          break;
        }
        case "Escape":
          onBackRef.current?.();
          e.preventDefault();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auto]);

  let itemIdx = -1;
  return (
    <nav ref={navRef} data-testid={testId} aria-label="コマンド">
      {entries.map((e, i) => {
        if ("kind" in e) {
          return e.kind === "header" ? (
            <p key={`h${i}`} className="menu-head">
              {e.text}
            </p>
          ) : (
            <div key={`d${i}`} className={bless ? "divider b" : "divider"} />
          );
        }
        itemIdx += 1;
        const on = itemIdx === focus && auto;
        const idx = itemIdx;
        return (
          <button
            key={e.id}
            type="button"
            data-idx={idx}
            data-testid={e.id}
            disabled={e.disabled}
            className={`cmd${bless ? " b" : ""}${paper ? " p" : ""}${on ? " on" : ""}${e.danger === true ? " danger" : ""}${e.primary === true ? " primary" : ""}${e.gold === true ? " gold" : ""}`}
            onMouseEnter={() => {
              if (!e.disabled) {
                focusRef.current = idx;
                setFocus(idx);
              }
            }}
            onClick={() => {
              if (!e.disabled) e.onPick();
            }}
          >
            {e.label}
            {e.sub !== undefined && <span className="cmd-sub">{e.sub}</span>}
          </button>
        );
      })}
      {more && (
        <div className="scroll-more" aria-hidden>
          ▼
        </div>
      )}
    </nav>
  );
}

/** 画面ごとの補助キー（修飾キーなしの単打のみ拾う） */
export function useHotkeys(map: Record<string, () => void>, active = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const fn = ref.current[e.key.toLowerCase()] ?? ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/* ── キーキャップと操作ガイド ── */
export function Keycap({ children, bless = false }: { children: ReactNode; bless?: boolean }) {
  return <span className={bless ? "key b" : "key"}>{children}</span>;
}

/** 画面下に常に出す操作ガイド（README 決まりごと5） */
export function KeyHints({
  items,
  bless = false,
  style,
}: {
  items: (readonly [key: string, label: string])[];
  bless?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className="hints" style={style}>
      {items.map(([k, label]) => (
        <span key={k}>
          <Keycap bless={bless}>{k}</Keycap> {label}
        </span>
      ))}
    </div>
  );
}
