/**
 * 会話窓（UI-01、README 部品節）：上辺に名札（金のプレート）、右下に ▼。
 * 世界の窓（金）を使う＝人の言葉・記録の声を載せる
 */
import type { CSSProperties, ReactNode } from "react";
import { theme } from "../theme.js";
import { Plate, WorldFrame } from "./frames.js";
import { pos } from "./stage.js";
import { CommandMenu, KeyHints, type MenuEntry } from "./keys.js";

export function DialogueBox({
  speaker,
  children,
  style,
  marker = true,
  testId,
}: {
  /** 名札（話し手・「記録」など） */
  speaker: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  /** 右下の ▼（続きがある合図） */
  marker?: boolean;
  testId?: string;
}) {
  return (
    <WorldFrame style={{ padding: "30px 32px 18px", ...style }} testId={testId}>
      <Plate
        style={{
          position: "absolute",
          top: -16,
          left: 28,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {speaker}
      </Plate>
      <div
        style={{
          fontFamily: theme.font.mincho,
          fontSize: 20,
          lineHeight: 1.8,
          color: "#f4ecd8",
        }}
      >
        {children}
      </div>
      {marker && (
        <span
          style={{
            position: "absolute",
            right: 26,
            bottom: 14,
            color: theme.colors.world.light,
            fontSize: 14,
          }}
        >
          ▼
        </span>
      )}
    </WorldFrame>
  );
}

/**
 * 世界の声（ログ）の窓：メイン画面の会話窓位置に出すスクロール可能な記録。
 * 新しい行ほど明るく、末尾は世界が最後に書いた行
 */
export function LogWindow({
  lines,
  style,
  testId,
}: {
  lines: readonly string[];
  style?: CSSProperties;
  testId?: string;
}) {
  // 窓に見えるのは末尾4行ぶんだが、DOMには8行残す（記録を遡れるように）
  const shown = lines.slice(-8);
  return (
    <DialogueBox speaker="記録" style={style} testId={testId}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          minHeight: 72,
          fontSize: 16,
          overflow: "hidden",
        }}
      >
        {shown.length === 0 && (
          <span style={{ color: theme.colors.world.dim }}>――まだ何も記録されていない。</span>
        )}
        {shown.map((l, i) => (
          <div
            key={`${lines.length - shown.length + i}`}
            style={{
              color: i === shown.length - 1 ? "#f4ecd8" : theme.colors.world.dim,
              fontFamily: l.startsWith("――") || l.startsWith("━") ? theme.font.sys : undefined,
              fontSize: i === shown.length - 1 ? 18 : 14,
              whiteSpace: "pre-wrap",
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </DialogueBox>
  );
}

/** 確認窓（引退・記録削除など。danger=true で「はい」が珊瑚色になる） */
export function ConfirmWindow({
  title,
  body,
  yes,
  no,
  onYes,
  onNo,
  yesId,
  noId,
}: {
  title: string;
  body: ReactNode;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
  yesId?: string;
  noId?: string;
}) {
  const entries: MenuEntry[] = [
    { id: noId ?? "confirm-no", label: no, onPick: onNo },
    { id: yesId ?? "confirm-yes", label: yes, danger: true, onPick: onYes },
  ];
  return (
    <WorldFrame style={{ padding: "26px 30px 20px" }}>
      <Plate style={{ position: "absolute", top: -16, left: 28, fontSize: 15 }}>{title}</Plate>
      <div
        style={{
          fontFamily: theme.font.mincho,
          fontSize: 17,
          lineHeight: 1.8,
          color: theme.colors.world.text,
          marginBottom: 14,
        }}
      >
        {body}
      </div>
      <CommandMenu entries={entries} onBack={onNo} />
    </WorldFrame>
  );
}

/** 画面右下の操作ガイド（README 決まりごと5：常に出す） */
export function HintBar({
  items,
  bless = false,
}: {
  items: (readonly [key: string, label: string])[];
  bless?: boolean;
}) {
  return <KeyHints items={items} bless={bless} style={pos({ right: 28, bottom: 16 })} />;
}
