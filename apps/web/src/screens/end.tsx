/**
 * 終了・継承系の画面（UI-01）：引退の確認は世界の窓、
 * 生の継ぎ方・次代・転生は夜の情景に紙の伝記＋一本のコマンド列
 */
import { useMemo, useState } from "react";
import { heirGenerationOf, heirKindOf, type GameState } from "@trace/core";
import { balance, titles } from "@trace/content";
import {
  bioLines,
  legacyDefaults,
  loadChronicle,
  originList,
  t,
  tpl,
  vowList,
  workName,
  type FateChoice,
} from "../game.js";
import {
  CommandMenu,
  ConfirmWindow,
  HintBar,
  Paper,
  WorldFrame,
  pos,
  type MenuEntry,
} from "../ui.js";
import { theme } from "../theme.js";
import { tendencyEntries, vowEntries } from "./title.js";

const P = theme.colors.paper;
const W = theme.colors.world;

/** 伝記の紙（継ぎ方・次代・転生の画面で終わった生を振り返る） */
function BioPaper({ bio, testId }: { bio: readonly string[]; testId: string }) {
  return (
    <Paper
      tilt={-0.6}
      style={{ ...pos({ left: 120, top: 90, width: 460, bottom: 120 }), padding: "22px 30px" }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontFamily: theme.font.mincho,
          fontSize: 18,
          fontWeight: 800,
          color: P.head,
          borderBottom: `3px double ${P.text}`,
          paddingBottom: 6,
        }}
      >
        終わった生の記録
      </p>
      <div
        className="scroll"
        data-testid={testId}
        style={{ maxHeight: "84%", overflowY: "auto", fontSize: 15, color: P.text }}
      >
        {bio.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: l.startsWith("――") || l.startsWith("━") ? theme.font.sys : undefined,
              color: l.startsWith("――") ? P.dim : P.text,
              padding: "1px 0",
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </Paper>
  );
}

/** 継承系画面の選択窓（右側・縦に長いコマンド列） */
function ChoiceWindow({
  title,
  entries,
  width = 560,
  left = 640,
  notes,
  testId,
}: {
  title: string;
  entries: MenuEntry[];
  width?: number;
  left?: number;
  /** 窓の上段の注記（継承できるものが無い時の案内など） */
  notes?: readonly string[];
  testId?: string;
}) {
  return (
    <WorldFrame
      testId={testId}
      style={{ ...pos({ left, top: 90, width, bottom: 120 }), padding: "16px 4px" }}
    >
      <p
        style={{
          margin: "0 16px 10px",
          fontFamily: theme.font.mincho,
          fontSize: 20,
          fontWeight: 800,
          color: W.hi,
        }}
      >
        {title}
      </p>
      {notes !== undefined && notes.length > 0 && (
        <div style={{ margin: "0 16px 8px", fontSize: 13, color: W.dim }}>
          {notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}
      <div className="scroll" style={{ maxHeight: "86%", overflowY: "auto" }}>
        <CommandMenu entries={entries} />
      </div>
    </WorldFrame>
  );
}

// ---- 引退（T-40。06 §1：いつでも選べる。確認は1回） ----
export function RetireScreen({
  onRetire,
  back,
}: {
  onRetire: (confirmed: boolean) => void;
  back: () => void;
}) {
  return (
    <div data-testid="screen-retire" className="scene">
      <div style={pos({ left: 340, top: 240, width: 600 })}>
        <ConfirmWindow
          title="引退"
          body={t.text.retireConfirm}
          yes="引退する"
          no="思いとどまる"
          yesId="retire-yes"
          noId="retire-no"
          onYes={() => onRetire(true)}
          onNo={() => {
            onRetire(false);
            back();
          }}
        />
      </div>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}

// ---- 生の継ぎ方（T-48。06 §1：転生＝新しい世界へ / 次代＝同じ世界で継ぐ） ----
/**
 * 終わった生をどう継ぐかの選択画面。伝記はログに開かれている。
 * 転生を選ぶとその時点で年代記に1頁刻まれ（recordLifeEnd・冪等）転生画面へ、
 * 次代を選ぶと刻まずに次代画面へ
 */
export function SuccessionScreen({
  prev,
  cause,
  onChoose,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onChoose: (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => void;
}) {
  const entries: MenuEntry[] = [
    {
      id: "succession-rebirth",
      label: "新しい世界に転生する",
      sub: "年代記に刻まれ、継承は大きい",
      primary: true,
      onPick: () => onChoose(prev, cause, "rebirth"),
    },
    {
      id: "succession-heir",
      label: "この世界で次代を継ぐ",
      sub: "年代記には刻まず、継承は小さい",
      onPick: () => onChoose(prev, cause, "heir"),
    },
  ];
  return (
    <div data-testid="screen-succession" className="scene">
      <BioPaper
        testId="succession-bio"
        bio={bioLines(prev, cause === "retire" ? "retire" : "death")}
      />
      <ChoiceWindow title={t.text.heirWayPick} entries={entries} />
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
        ]}
      />
    </div>
  );
}

// ---- 次代を継ぐ（T-48。06 §1「子や弟子に継承して延長」） ----
/**
 * 同じ世界 seed で新キャラを始める画面。前代の記録はその場の伝記が担い、
 * 年代記には刻まない。継承は legacy より弱い引継ぎ（素質補正の小さい版のみ）。
 * 世界が同じなので運命の傾向は前世のものを継ぎ、誓約は生ごとの選択として選び直す（D-38）
 */
export function HeirScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (prev: GameState, originId: string, vows: readonly string[]) => void;
}) {
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  const kind = useMemo(() => heirKindOf(prev), [prev]);
  const [originId, setOriginId] = useState<string | null>(null);
  const [pickedVows, setPickedVows] = useState<string[]>([]);
  const toggleVow = (id: string) =>
    setPickedVows((vs) => (vs.includes(id) ? vs.filter((x) => x !== id) : [...vs, id]));
  const entries: MenuEntry[] = [
    { kind: "header", text: t.text.rebirthOriginPrompt },
    ...originList.map((o) => ({
      id: `heir-origin-${o.id.replace("origin.", "")}`,
      label: o.name,
      sub: (
        <>
          {o.desc}
          {originId === o.id ? " ◆" : ""}
        </>
      ),
      onPick: () => setOriginId(o.id),
    })),
    { kind: "divider" },
    { kind: "header", text: t.text.vowPick },
    ...vowList.map((v) => ({
      id: `heir-vow-${v.id}`,
      label: v.name,
      sub: (
        <>
          {v.desc}
          {pickedVows.includes(v.id) ? " ◆" : ""}
        </>
      ),
      onPick: () => toggleVow(v.id),
    })),
    { kind: "divider" },
    {
      id: "heir-born",
      label: t.text.rebirthBorn,
      primary: true,
      disabled: originId === null,
      onPick: () => {
        if (originId !== null) onBorn(prev, originId, pickedVows);
      },
    },
  ];
  return (
    <div data-testid="screen-heir" className="scene">
      <BioPaper testId="heir-bio" bio={bio} />
      <div
        style={{
          ...pos({ left: 640, top: 56 }),
          fontFamily: theme.font.sys,
          fontSize: 13,
          color: W.dim,
        }}
      >
        <span data-testid="heir-kind">
          {tpl(t.text.heirKindLine, {
            kind: t.display.heirKindNames[kind] ?? kind,
            gen: heirGenerationOf(prev) + 1,
          })}
        </span>{" "}
        <span data-testid="heir-nochronicle" style={{ color: W.faint }}>
          {t.text.heirNoChronicle}
        </span>
      </div>
      <ChoiceWindow title="次代の生を継ぐ" entries={entries} />
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定・重ね掛け"],
        ]}
      />
    </div>
  );
}

// ---- 転生（T-40。06 §1「伝記→年代記→継承→転生」） ----
/**
 * 一生の終わり画面：伝記・二つ名（年代記から）・継承の選択・新しい生の出自。
 * 記憶の称号は rememberedMax まで、遺物は台帳の上位から1個。初期値は自動選択と同じ
 */
export function RebirthScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (
    prev: GameState,
    originId: string,
    rememberedTitles: string[],
    artifactId: string | undefined,
    fate: FateChoice,
  ) => void;
}) {
  const { auto, topWorks } = useMemo(() => legacyDefaults(prev), [prev]);
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  // 二つ名は年代記に刻まれた頁から読む（recordLife が自動で選んでいる）。
  // この一生の頁を探す（末尾とは限らない：別の生が後に刻まれている場合もある）
  const epithet = useMemo(
    () =>
      [...loadChronicle().lives]
        .reverse()
        .find((l) => l.worldSeed === prev.seed && l.cause === cause)?.epithet,
    [prev, cause],
  );
  const [pickedTitles, setPickedTitles] = useState<string[]>(auto.rememberedTitles);
  // 自動選択の遺物は品質最高の1件＝topWorks[0]（legacyOf と同じ順位付け）
  const [artifactId, setArtifactId] = useState<string | undefined>(topWorks[0]?.id);
  const [originId, setOriginId] = useState<string | null>(null);
  // 生まれ変わる世の運命（T-45/T-46）：傾向は穏やか・誓約はなしが既定
  const [fate, setFate] = useState<FateChoice>({ tendency: "calm", vows: [] });
  const toggleTitle = (id: string) =>
    setPickedTitles((ts) =>
      ts.includes(id)
        ? ts.filter((x) => x !== id)
        : [...ts, id].slice(-balance.legacy.rememberedMax),
    );

  const entries: MenuEntry[] = [
    ...(prev.titles.length > 0
      ? [
          {
            kind: "header" as const,
            text: tpl(t.text.legacyTitlesPrompt, { max: balance.legacy.rememberedMax }),
          },
          ...prev.titles.map((id): MenuEntry => ({
            id: `rebirth-title-${id}`,
            label: titles.titles.find((x) => x.id === id)?.name ?? id,
            sub: pickedTitles.includes(id) ? "◆ 記憶に残す" : "",
            onPick: () => toggleTitle(id),
          })),
          { kind: "divider" as const },
        ]
      : []),
    ...(topWorks.length > 0
      ? [
          { kind: "header" as const, text: t.text.legacyArtifactPrompt },
          ...topWorks.map((w): MenuEntry => ({
            id: `rebirth-artifact-${w.id}`,
            label: `《${workName(w)}》`,
            sub: (
              <>
                質{w.quality}・{w.day + 1}日目{artifactId === w.id ? " ◆" : ""}
              </>
            ),
            onPick: () => setArtifactId((a) => (a === w.id ? undefined : w.id)),
          })),
          { kind: "divider" as const },
        ]
      : []),
    { kind: "header", text: t.text.rebirthOriginPrompt },
    ...originList.map((o): MenuEntry => ({
      id: `rebirth-origin-${o.id.replace("origin.", "")}`,
      label: o.name,
      sub: (
        <>
          {o.desc}
          {originId === o.id ? " ◆" : ""}
        </>
      ),
      onPick: () => setOriginId(o.id),
    })),
    { kind: "divider" },
    // 運命の傾向と誓約（タイトルと同じ項目を共有。接頭辞で testid を分ける）
    ...tendencyEntries(fate, setFate),
    ...vowEntries(fate, setFate, "rebirth-vow"),
    { kind: "divider" },
    {
      id: "rebirth-born",
      label: t.text.rebirthBorn,
      primary: true,
      disabled: originId === null,
      onPick: () => {
        if (originId !== null) onBorn(prev, originId, pickedTitles, artifactId, fate);
      },
    },
  ];

  return (
    <div data-testid="screen-rebirth" className="scene">
      <BioPaper testId="rebirth-bio" bio={bio} />
      {/* 二つ名：年代記が選んだこの生の呼び名 */}
      {epithet !== undefined && (
        <div
          data-testid="rebirth-epithet"
          style={{
            ...pos({ left: 640, top: 56 }),
            fontFamily: theme.font.mincho,
            fontSize: 15,
            color: theme.colors.special,
          }}
        >
          {tpl(t.text.rebirthEpithet, {
            name: titles.titles.find((x) => x.id === epithet)?.name ?? epithet,
          })}
        </div>
      )}
      <ChoiceWindow
        title={t.text.legacyHeader}
        entries={entries}
        width={600}
        left={620}
        testId="rebirth-artifacts"
        notes={[
          ...(prev.titles.length === 0 ? [t.text.legacyNoTitles] : []),
          ...(topWorks.length === 0 ? [t.text.legacyNoArtifact] : []),
        ]}
      />
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定・重ね掛け"],
        ]}
      />
    </div>
  );
}
