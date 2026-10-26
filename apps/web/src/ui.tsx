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
    background: theme.colors.bg,
    color: theme.colors.text,
    fontFamily: theme.font.family,
    padding: "16px",
    boxSizing: "border-box" as const,
    maxWidth: 720,
    margin: "0 auto",
  },
  panel: {
    background: theme.colors.panel,
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 12,
  },
  btn: {
    background: "#232b34",
    color: theme.colors.text,
    border: `1px solid ${theme.colors.accent}`,
    borderRadius: 6,
    padding: "8px 14px",
    margin: "4px 6px 4px 0",
    fontFamily: theme.font.family,
    fontSize: 15,
    cursor: "pointer",
  },
  btnPrimary: {
    background: theme.colors.accent,
    color: "#101418",
    fontWeight: 700,
  },
  log: {
    fontFamily: theme.font.mono,
    fontSize: 13,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap" as const,
    maxHeight: 340,
    overflowY: "auto" as const,
  },
  dim: { color: theme.colors.textDim },
  sys: { color: theme.colors.system },
  accent: { color: theme.colors.accent },
};

export function Btn({
  children,
  primary,
  disabled,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...css.btn,
        ...(primary ? css.btnPrimary : {}),
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
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
