/**
 * タイトル画面（UI-01）：夜明け前の街の情景にロゴ、出自と運命（傾向・誓約）を
 * 一本のコマンド列で選ぶ。開始につながる「出自」を先頭に置く（運命は選ばなくても
 * 既定値で始められる任意項目＝後段に回す）。Enter で確定、誓約は Enter で重ね掛けする
 */
import {
  loadChronicle,
  originList,
  t,
  tendencyIds,
  tpl,
  vowList,
  type FateChoice,
} from "../game.js";
import {
  CommandMenu,
  HintBar,
  Plate,
  SceneBackground,
  WorldFrame,
  pos,
  type MenuEntry,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 運命の傾向（T-45）の項目（誓約は vowEntries で別に作る） */
export function tendencyEntries(fate: FateChoice, setFate: (f: FateChoice) => void): MenuEntry[] {
  const tendency = fate.tendency ?? "calm";
  return [
    { kind: "header", text: "運命の傾向 ― この世の気配" },
    ...tendencyIds.map((id) => ({
      id: `tendency-${id}`,
      label: t.display.tendencyNames[id] ?? id,
      sub: tendency === id ? "◆" : "",
      onPick: () => setFate({ ...fate, tendency: id }),
    })),
  ];
}

/** 誓約（T-46）の項目。Enter で◆を重ね掛けする */
export function vowEntries(
  fate: FateChoice,
  setFate: (f: FateChoice) => void,
  prefix = "vow",
): MenuEntry[] {
  const picked = fate.vows ?? [];
  const toggle = (id: string) =>
    setFate({
      ...fate,
      vows: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
    });
  return [
    { kind: "header", text: "誓約 ― 自ら課す縛り" },
    ...vowList.map((v) => ({
      id: `${prefix}-${v.id}`,
      label: v.name,
      sub: (
        <>
          <span style={{ color: theme.colors.world.dim, fontSize: 11, marginRight: 8 }}>
            {v.desc}
          </span>
          {picked.includes(v.id) ? "◆" : ""}
        </>
      ),
      onPick: () => toggle(v.id),
    })),
  ];
}

/** 新規開始画面：年代記の頁数・運命の選択・出自の選択（元 App の !state 分岐） */
export function TitleScreen({
  fate,
  setFate,
  startNew,
}: {
  fate: FateChoice;
  setFate: (f: FateChoice) => void;
  startNew: (originId?: string) => void;
}) {
  // 年代記はセーブとは別領域に残る（T-38。新しい周の始まりでも見える）
  const lives = loadChronicle().lives.length;
  const entries: MenuEntry[] = [
    { kind: "header", text: "出自 ― あなたは何者だったか" },
    ...originList.map((o) => ({
      id: `origin-${o.id.replace("origin.", "")}`,
      label: <span className="cmd-label">{o.name}</span>,
      sub: o.desc,
      onPick: () => startNew(o.id),
    })),
    // 運命の傾向・誓約は2周目以降（年代記に1件以上あるとき）だけ出す（F-06。
    // 1周目は名前と出自だけで始める —— 最初の1時間を読みやすく整える）
    ...(lives > 0
      ? ([
          { kind: "divider" },
          { kind: "header", text: "―― 選ばなくても始められる ――" },
          ...tendencyEntries(fate, setFate),
          { kind: "divider" },
          ...vowEntries(fate, setFate),
        ] satisfies MenuEntry[])
      : []),
  ];
  return (
    <div data-testid="app" className="scene">
      <SceneBackground kind="night" />
      {/* ロゴ：世界の名（Cinzel・大きく・字間広め） */}
      <div style={{ ...pos({ left: 0, right: 0, top: 74 }), textAlign: "center" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: theme.font.en,
            fontWeight: 700,
            fontSize: 74,
            letterSpacing: "0.34em",
            color: W.hi,
            textShadow: `0 0 34px rgba(232,199,127,.4), 0 3px 0 ${theme.colors.world.frameInner}`,
            paddingLeft: "0.34em",
          }}
        >
          TRACE
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: theme.font.mincho,
            fontSize: 15,
            color: W.dim,
            letterSpacing: "0.2em",
          }}
        >
          {t.text.intro}
        </p>
        {lives > 0 && (
          <p
            style={{
              margin: "8px 0 0",
              fontFamily: theme.font.sys,
              fontSize: 12,
              color: W.faint,
            }}
          >
            {tpl(t.text.chronicleLives, { count: lives })}
          </p>
        )}
      </div>
      {/* 運命と出自の選択窓 */}
      <WorldFrame
        style={{
          ...pos({ left: 380, top: 236, width: 520, height: 416 }),
          padding: "16px 6px 12px",
        }}
      >
        <div className="scroll" style={{ height: "100%", overflowY: "auto", paddingRight: 4 }}>
          <CommandMenu entries={entries} />
        </div>
      </WorldFrame>
      <Plate style={pos({ left: 380, top: 214 })}>新しい生</Plate>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
        ]}
      />
    </div>
  );
}
