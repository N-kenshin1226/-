/**
 * 画面共通のUI部品と共通型（X-2 で App.tsx から分離）。
 * スタイル値は theme.ts に集約する方針のまま、css オブジェクトとして各画面へ配る
 */
import type { ActionEvent, Command, GameState } from "@trace/core";
import type { EnemyJson } from "@trace/content";
import type { MinigameKind, Order } from "./game.js";
import { theme } from "./theme.js";

export type Screen =
  | { name: "menu" }
  | { name: "train" }
  | { name: "sleep" }
  | { name: "work" }
  | { name: "workMode"; order: Order }
  | { name: "minigame"; kind: MinigameKind; order: Order }
  | { name: "hunt" }
  | { name: "combat"; enemy: EnemyJson }
  /** 深層ダンジョン（T-43）：層を下る連戦。進行は AbyssRun が持つ */
  | { name: "abyss" }
  | { name: "lore"; atomId?: string }
  | { name: "book" }
  | { name: "records" }
  | { name: "society" }
  | { name: "mentor" }
  | { name: "status" }
  /** 引退の確認（T-40） */
  | { name: "retire" }
  /** 生の継ぎ方の選択（T-48）：転生（新しい世界）か次代（同じ世界）か */
  | { name: "succession"; prev: GameState; cause: "retire" | "oldAge" }
  /** 一生の終わり画面（T-40）：伝記＋継承の選択＋新しい生の出自 */
  | { name: "rebirth"; prev: GameState; cause: "retire" | "oldAge" }
  /** 次代を継ぐ画面（T-48）：同じ世界 seed で新キャラ。弱い引継ぎ・年代記には刻まない */
  | { name: "heir"; prev: GameState; cause: "retire" | "oldAge" };

export const css = {
  app: {
    minHeight: "100vh",
    color: theme.colors.text,
    fontFamily: theme.font.family,
    padding: "16px",
    boxSizing: "border-box" as const,
    maxWidth: 760,
    margin: "0 auto",
  },
  /** 通常カード（紙の面・濃紺の太枠）。主役の画面は panelHero を使う */
  panel: {
    background: theme.colors.panel,
    borderRadius: 16,
    padding: "14px 18px",
    marginBottom: 14,
    border: `2.5px solid ${theme.colors.navy}`,
    boxShadow: "0 4px 0 rgba(44,58,94,0.14), 0 8px 20px rgba(44,58,94,0.10)",
  },
  /** 主役カード（1画面に1つまで）：淡い金の面で大きく */
  panelHero: {
    background: "linear-gradient(160deg, #fffbe6 0%, #fffdf4 70%)",
    borderColor: theme.colors.yellow,
    boxShadow: "0 5px 0 rgba(232,164,0,0.35), 0 10px 24px rgba(44,58,94,0.14)",
  },
  /** 補助の薄い面（カード内の区切り・ログ欄） */
  panelInset: {
    background: theme.colors.panel2,
    border: `1.5px solid ${theme.colors.textDim}`,
  },
  log: {
    fontFamily: theme.font.mono,
    fontSize: 14,
    lineHeight: 1.75,
    whiteSpace: "pre-wrap" as const,
    maxHeight: 340,
    overflowY: "auto" as const,
  },
  dim: { color: theme.colors.textDim },
  sys: { color: theme.colors.system },
  accent: { color: theme.colors.accentDark, fontWeight: 700 },
};

/** カードの見出し（濃紺テキスト＋色マーカー）。tone で意味を変える */
export function CardTitle({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "gold" | "red" | "green";
}) {
  return <div className={tone !== undefined ? `card-title ${tone}` : "card-title"}>{children}</div>;
}

export function Btn({
  children,
  primary,
  gold,
  danger,
  sel,
  big,
  disabled,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  /** 主行動＝黄（1画面1つまで） */
  primary?: boolean;
  /** 特別＝金枠（ユニーク・称号など） */
  gold?: boolean;
  /** 危険＝赤（記録を消す等） */
  danger?: boolean;
  /** 選択中＝琥珀（トグルの ON 表示） */
  sel?: boolean;
  big?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const cls = [
    "tbtn",
    primary ? "primary" : "",
    gold ? "gold" : "",
    danger ? "danger" : "",
    sel ? "sel" : "",
    big ? "big" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button data-testid={testId} disabled={disabled} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** step を1回実行する共通コールバック（App が持ち、各画面に props で渡す） */
export type Act = (
  c: Command,
  opts?: { atHome?: boolean; format?: (ev: ActionEvent[]) => string[] },
) => void;

/** ログへの追記（App が持ち、各画面に props で渡す） */
export type Push = (l: string | string[]) => void;
