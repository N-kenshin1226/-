/**
 * 街の窓（UI-01）：鍛錬・宿・書店は世界の窓（金）＋コマンド列、
 * 能力（Status見本）は加護の窓（銀青）＋タブ・技能行・紋章・レーダー
 */
import { useState } from "react";
import {
  canAct,
  describe,
  isSkillUnlocked,
  lifespanProgress,
  shelfBooks,
  type GameState,
  type InnRank,
} from "@trace/core";
import { titles } from "@trace/content";
import {
  bioLines,
  bookList,
  cfg,
  eventLines,
  innCost,
  innQuality,
  inns,
  loadChronicle,
  originList,
  qualityLabel,
  skillChip,
  skillList,
  societyDefs,
  t,
  tpl,
} from "../game.js";
import {
  BlessingWindow,
  CommandMenu,
  Divider,
  HintBar,
  Kicker,
  Paper,
  RankCrest,
  SkillBar,
  StChip,
  WorldFrame,
  pos,
  skillBandOf,
  useHotkeys,
  type Act,
  type MenuEntry,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;
const B = theme.colors.bless;

/** 称号ID → 表示名 */
const titleNameOf = (id: string) => titles.titles.find((x) => x.id === id)?.name ?? id;

/** 窓の左上の欧文見出し＋和名の行（サブ画面共通の頭） */
function WinHead({
  kicker,
  title,
  bless = false,
}: {
  kicker: string;
  title: string;
  bless?: boolean;
}) {
  const c = bless ? B : W;
  return (
    <div style={{ margin: "2px 14px 10px" }}>
      <Kicker text={kicker} bless={bless} />
      <div
        style={{
          fontFamily: theme.font.mincho,
          fontSize: 24,
          fontWeight: 800,
          color: c.hi,
          letterSpacing: "0.1em",
          marginTop: 2,
        }}
      >
        {title}
      </div>
    </div>
  );
}

/** サブ画面の世界の窓＋戻る（左に大きく、会話窓と重ならない高さ） */
function TownWindow({
  kicker,
  title,
  children,
  testId,
  entries,
  onBack,
  width = 560,
  top = 120,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
  testId: string;
  entries: MenuEntry[];
  onBack: () => void;
  width?: number;
  top?: number;
}) {
  return (
    <div data-testid={testId} className="scene">
      <WorldFrame style={{ ...pos({ left: 28, top, width, bottom: 200 }), padding: "14px 4px" }}>
        <WinHead kicker={kicker} title={title} />
        <div className="scroll" style={{ maxHeight: "78%", overflowY: "auto" }}>
          <CommandMenu
            entries={[
              ...entries,
              { kind: "divider" },
              { id: "back", label: "戻る", onPick: onBack },
            ]}
            onBack={onBack}
          />
        </div>
        {children}
      </WorldFrame>
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

// ---- 鍛錬 ----
export function TrainScreen({
  state,
  act,
  back,
}: {
  state: GameState;
  act: Act;
  back: () => void;
}) {
  // 技能→難度は一段のコマンド列で潜る（キー操作を一本に保つため）
  const [picked, setPicked] = useState<string | null>(null);
  const sk = skillList.find((s) => s.id === picked);
  const canActNow = canAct(state.time, cfg.time);
  const entries: MenuEntry[] =
    sk === undefined
      ? skillList
          .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
          .map((s) => {
            const st = state.player.skills[s.id]!;
            return {
              id: `skill-${s.id}`,
              label: s.name,
              sub: (
                <>
                  {st.value.toFixed(1)}
                  {st.pending > 0 && (
                    <span style={{ color: theme.colors.grow }}> +{st.pending.toFixed(1)}</span>
                  )}
                </>
              ),
              onPick: () => setPicked(s.id),
            };
          })
      : [
          { kind: "header" as const, text: `《${sk.name}》― 難度を選ぶ` },
          ...[0, 10, 20, 30].map((add) => {
            const diff = Math.round(state.player.skills[sk.id]!.value) + add;
            return {
              id: `diff-${add}`,
              label: `難度 ${diff}`,
              sub: add === 10 ? "おすすめ" : "",
              disabled: !canActNow,
              onPick: () => act({ type: "train", skill: sk.id, difficulty: diff }),
            };
          }),
        ];
  return (
    <div data-testid="screen-train" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 560, bottom: 200 }), padding: "14px 4px" }}
      >
        <WinHead kicker="TRAIN" title={sk ? `《${sk.name}》を鍛える` : "鍛錬"} />
        {sk && (
          <div
            style={{ margin: "0 16px 8px", fontSize: 13, color: W.dim }}
            data-testid="train-difficulty"
          >
            {tpl(t.text.difficultyPrompt, {
              recommended: Math.round(state.player.skills[sk.id]!.value) + 10,
            })}
          </div>
        )}
        <div className="scroll" style={{ maxHeight: "76%", overflowY: "auto" }}>
          <CommandMenu
            entries={[
              ...entries,
              { kind: "divider" },
              {
                id: "back",
                label: sk ? "選び直す" : "戻る",
                onPick: () => (sk ? setPicked(null) : back()),
              },
            ]}
            onBack={() => (sk ? setPicked(null) : back())}
          />
        </div>
      </WorldFrame>
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

// ---- 寝る ----
export function SleepScreen({
  state,
  act,
  back,
}: {
  state: GameState;
  act: Act;
  back: () => void;
}) {
  const [dinner, setDinner] = useState(true);
  const entries: MenuEntry[] = [
    { kind: "header", text: "宿を選ぶ" },
    ...inns.map((inn): MenuEntry => {
      const cost = innCost(inn, state);
      return {
        id: `inn-${inn}`,
        label: t.display.innNames[inn],
        sub: `質：${qualityLabel(innQuality(inn, dinner))}・${cost}G`,
        disabled: cost > state.player.money,
        onPick: () => act({ type: "sleep", inn: inn as InnRank, dinner }),
      };
    }),
    { kind: "divider" },
    { kind: "header", text: t.text.dinnerPrompt },
    {
      id: "dinner-yes",
      label: t.display.dinnerNames.with,
      sub: dinner ? "◆" : "",
      onPick: () => setDinner(true),
    },
    {
      id: "dinner-no",
      label: t.display.dinnerNames.without,
      sub: !dinner ? "◆" : "",
      onPick: () => setDinner(false),
    },
    { kind: "divider" },
    {
      id: "sleep-home",
      label: `${t.display.homeName}で休む`,
      sub: "無料",
      onPick: () => act({ type: "rest" }, { atHome: true }),
    },
  ];
  return (
    <TownWindow kicker="INN" title="眠る" testId="screen-sleep" entries={entries} onBack={back} />
  );
}

// ---- 書店（T-26） ----
// 棚に並ぶのは条件を満たす書物だけ（X-5：失われた手記は転生フラグが立つと現れる）
export function BookScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canRead = canAct(state.time, cfg.time);
  const shelf = shelfBooks(state, { books: bookList }, cfg.time);
  const entries: MenuEntry[] = shelf.flatMap((b): MenuEntry[] => {
    const owned = state.books.owned.includes(b.id);
    const read = state.books.read.some((r) => r.id === b.id);
    const mark = read ? "読了" : owned ? "読める" : `${b.price}G`;
    return [
      {
        id: owned && !read ? `book-read-${b.id}` : read ? `book-${b.id}` : `book-buy-${b.id}`,
        label: `《${b.name}》`,
        sub: `${b.desc}（${mark}）`,
        disabled: (!owned && state.player.money < b.price) || (owned && !read && !canRead) || read,
        onPick: () => {
          if (!owned) act({ type: "buyBook", id: b.id });
          else if (!read) {
            act(
              { type: "readBook", id: b.id },
              {
                format: (ev) => [
                  tpl(t.text.bookRead, { name: b.name, text: b.readText }),
                  ...eventLines(ev),
                ],
              },
            );
          }
        },
      },
    ];
  });
  return (
    <div data-testid="screen-book" className="scene">
      <Paper
        style={{ ...pos({ left: 300, top: 90, width: 680, height: 520 }), padding: "26px 34px" }}
      >
        <div
          style={{
            textAlign: "center",
            borderBottom: `3px double ${theme.colors.paper.text}`,
            paddingBottom: 8,
            marginBottom: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.mincho,
              fontWeight: 800,
              fontSize: 28,
              letterSpacing: "0.2em",
              color: theme.colors.paper.head,
            }}
          >
            古書店
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: theme.colors.paper.dim }}>
            {tpl(t.text.bookShopHeader, { money: state.player.money })}
          </p>
        </div>
        <div className="scroll" style={{ height: "78%", overflowY: "auto" }}>
          {/* 紙の上の目録：墨色のコマンド列（paper バリアント） */}
          <CommandMenu paper entries={entries} onBack={back} />
        </div>
      </Paper>
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

// ---- 能力（Status見本） ----
const TABS = ["技能", "称号", "経歴", "年代記"] as const;

export function StatusScreen({ state, back }: { state: GameState; back: () => void }) {
  const [tab, setTab] = useState(0);
  const [focus, setFocus] = useState(0);
  const unlocked = skillList.filter((s) =>
    isSkillUnlocked(state, { id: s.id, condition: s.unlock }),
  );
  const locked = skillList.filter(
    (s) => !isSkillUnlocked(state, { id: s.id, condition: s.unlock }),
  );
  useHotkeys({
    q: () => setTab((t0) => (t0 + TABS.length - 1) % TABS.length),
    e: () => setTab((t0) => (t0 + 1) % TABS.length),
    arrowdown: () => setFocus((f) => Math.min(unlocked.length - 1, f + 1)),
    arrowup: () => setFocus((f) => Math.max(0, f - 1)),
    escape: back,
  });
  const focused = unlocked[focus];
  return (
    <div data-testid="screen-status" className="scene">
      {/* 上のタブ帯（見本：STATUS＋タブ＋Q E 切り替え） */}
      <header
        style={{
          ...pos({ top: 22, left: 40, right: 40 }),
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          borderBottom: `1px solid ${B.frame}`,
          paddingBottom: 0,
        }}
      >
        <span
          style={{
            marginRight: 24,
            paddingBottom: 8,
            fontFamily: theme.font.en,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.3em",
            color: "#eaf8fb",
          }}
        >
          STATUS
        </span>
        {TABS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={i === tab ? "tab on" : "tab"}
            data-testid={`tab-${i}`}
            onClick={() => setTab(i)}
          >
            {name}
          </button>
        ))}
        <span style={{ marginLeft: "auto", paddingBottom: 8, fontSize: 13, color: B.dim }}>
          <span className="key b">Q</span> <span className="key b">E</span> 切り替え
        </span>
      </header>

      {/* 左：人物（名・出自・立場・レーダー・疲労） */}
      <BlessingWindow
        style={{ ...pos({ left: 40, top: 92, width: 360, height: 560 }), padding: 22 }}
        corners={["tl", "br"]}
      >
        <PersonPanel state={state} />
      </BlessingWindow>

      {/* 右：タブの中身 */}
      {tab === 0 && (
        <>
          <BlessingWindow
            style={{ ...pos({ left: 424, top: 92, right: 40, height: 420 }), padding: "14px 10px" }}
            corners={["tr", "bl"]}
          >
            <div className="scroll b" style={{ height: "100%", overflowY: "auto" }}>
              {unlocked.map((s, i) => {
                const st = state.player.skills[s.id]!;
                const band = skillBandOf(st.value);
                const chip = skillChip(state, s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={i === focus ? "srow on" : "srow"}
                    onMouseEnter={() => setFocus(i)}
                    onClick={() => setFocus(i)}
                  >
                    <RankCrest letter={band.crest} />
                    <span>
                      <span
                        style={{
                          fontFamily: theme.font.mincho,
                          fontSize: 19,
                          color: "#eaf8fb",
                        }}
                      >
                        {s.name}
                      </span>{" "}
                      <span style={{ fontSize: 12, color: B.dim }}>{band.name}</span>
                      <div style={{ marginTop: 5, maxWidth: 320 }}>
                        <SkillBar value={st.value} pending={st.pending} bless />
                      </div>
                    </span>
                    <span
                      style={{
                        fontFamily: theme.font.en,
                        fontSize: 22,
                        fontWeight: 700,
                        textAlign: "right",
                        color: "#eaf8fb",
                      }}
                    >
                      {st.value.toFixed(1)}
                    </span>
                    <StChip tone={chip.tone}>{chip.text}</StChip>
                  </button>
                );
              })}
              {/* 未発見の技能（？？？ 行。世界はまだ教えてくれない） */}
              {locked.map((s) => (
                <div key={s.id} className="srow" style={{ opacity: 0.55 }}>
                  <RankCrest letter="？" unknown />
                  <span>
                    <span
                      style={{
                        fontFamily: theme.font.mincho,
                        fontSize: 19,
                        color: theme.colors.muted,
                      }}
                    >
                      ？？？
                    </span>
                    <div style={{ marginTop: 5, maxWidth: 320 }}>
                      <SkillBar value={0} bless />
                    </div>
                  </span>
                  <span
                    style={{
                      fontFamily: theme.font.en,
                      fontSize: 22,
                      fontWeight: 700,
                      textAlign: "right",
                      color: theme.colors.muted,
                    }}
                  >
                    ―
                  </span>
                  <StChip>未発見</StChip>
                </div>
              ))}
            </div>
          </BlessingWindow>
          {/* 下：選んだ技能の説明（見本の「説明」窓） */}
          <BlessingWindow
            style={{
              ...pos({ left: 424, top: 532, right: 40, height: 120 }),
              padding: "18px 24px",
            }}
            corners={["bl", "tr"]}
          >
            {focused ? (
              <SkillDetail state={state} skillId={focused.id} />
            ) : (
              <p style={{ color: B.dim, margin: 0 }}>――使える技はまだない。</p>
            )}
          </BlessingWindow>
        </>
      )}
      {tab === 1 && <TitlesPanel state={state} />}
      {tab === 2 && <BioPanel state={state} />}
      {tab === 3 && <ChroniclePanel />}
      <HintBar
        bless
        items={[
          ["↑↓", "選択"],
          ["QE", "切替"],
          ["Esc", "閉じる"],
        ]}
      />
    </div>
  );
}

/** 人物パネル：名・出自・立場・六角レーダー・疲労・気配 */
function PersonPanel({ state }: { state: GameState }) {
  const d = describe(state.time, cfg.time);
  const standing = societyDefs.standings.find((s) => s.id === state.society.standing);
  const profession = societyDefs.professions.find((p) => p.id === state.society.profession);
  const offers = state.society.pendingOffers.length;
  return (
    <>
      <p
        style={{
          margin: 0,
          fontFamily: theme.font.mincho,
          fontSize: 30,
          fontWeight: 800,
          color: "#f2fcfe",
        }}
      >
        {state.player.name}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: B.dim }}>
        {d.age}歳 ・ {originName(state)}
      </p>
      <p style={{ margin: "10px 0 0", fontSize: 14 }}>
        {standing?.name ?? state.society.standing} <span style={{ color: B.dim }}>／</span>{" "}
        {profession?.name ?? "職業なし"}
      </p>
      {offers > 0 && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: theme.colors.grow }}>
          ◆ 認定の打診が {offers}件 あります
        </p>
      )}
      {/* 六芒のレーダー（基礎能力） */}
      <Radar state={state} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <span style={{ width: 40, color: B.dim }}>疲労</span>
        <div
          style={{
            flex: 1,
            height: 8,
            background: B.cellOff,
            border: `1px solid ${B.cellEdge}`,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${Math.min(100, state.player.fatigue)}%`,
              background: "linear-gradient(180deg, #f3d48e, #b8873a)",
            }}
          />
        </div>
        <span style={{ fontFamily: theme.font.en, width: 60, textAlign: "right" }}>
          {Math.round(state.player.fatigue)}/100
        </span>
      </div>
      {/* 寿命の気配（T-36）：満ちた月に近いほど色が変わる */}
      <p
        style={{
          margin: "10px 0 0",
          fontFamily: theme.font.mincho,
          fontSize: 14,
          color: B.dim,
          textAlign: "center",
        }}
      >
        {cfg.aging !== undefined && lifespanProgress(d.age, cfg.time.startAge, cfg.aging) > 0.85
          ? "――月が、だいぶ傾いている。"
          : state.player.overwork.active
            ? "――身体が、悲鳴を上げている。"
            : "――何かが、噛み合いかけている。"}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: B.faint, textAlign: "center" }}>
        運命：{t.display.tendencyNames[state.tendency] ?? state.tendency}
        {state.vows.length > 0 && `・誓約 ${state.vows.length}`}
      </p>
    </>
  );
}

function originName(state: GameState): string {
  return originList.find((o) => o.id === state.player.origin)?.name ?? state.player.origin;
}

/** 基礎能力の六角レーダー（Status見本の中央の図形） */
function Radar({ state }: { state: GameState }) {
  const ids = Object.keys(state.player.stats) as (keyof typeof state.player.stats)[];
  const n = ids.length;
  const cx = 160;
  const cy = 95;
  const r = 62;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const scale = Math.max(...ids.map((id) => state.player.stats[id]), 40);
  const pt = (i: number, v: number) =>
    `${cx + Math.cos(angle(i)) * r * Math.min(1, v / scale)},${cy + Math.sin(angle(i)) * r * Math.min(1, v / scale)}`;
  const ring = (f: number) =>
    ids
      .map((_, i) => `${cx + Math.cos(angle(i)) * r * f},${cy + Math.sin(angle(i)) * r * f}`)
      .join(" ");
  return (
    <svg
      width="320"
      height="190"
      viewBox="0 0 320 190"
      style={{ display: "block", margin: "8px auto 0" }}
    >
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke={B.frameInner} strokeWidth="1" />
      ))}
      {ids.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(angle(i)) * r}
          y2={cy + Math.sin(angle(i)) * r}
          stroke={B.frameInner}
          strokeWidth="1"
        />
      ))}
      <polygon
        points={ids.map((id, i) => pt(i, state.player.stats[id])).join(" ")}
        fill="rgba(143,224,239,.22)"
        stroke={B.glow}
        strokeWidth="1.5"
      />
      {ids.map((id, i) => (
        <text
          key={id}
          x={cx + Math.cos(angle(i)) * (r + 20)}
          y={cy + Math.sin(angle(i)) * (r + 20) + 5}
          textAnchor="middle"
          fontFamily="Shippori Mincho B1, serif"
          fontSize="13"
          fill={B.text}
        >
          {t.display.statNames[id] ?? id}
        </text>
      ))}
    </svg>
  );
}

/** 選んだ技能の詳細（「説明」窓：名・階級・素質・未定着・錆） */
function SkillDetail({ state, skillId }: { state: GameState; skillId: string }) {
  const def = skillList.find((s) => s.id === skillId)!;
  const st = state.player.skills[skillId]!;
  const band = skillBandOf(st.value);
  const chip = skillChip(state, skillId);
  const lastUsed = state.time.day - st.lastUsedDay;
  return (
    <div style={{ display: "flex", gap: 28 }}>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontFamily: theme.font.mincho,
            fontSize: 18,
            fontWeight: 700,
            color: "#f2fcfe",
          }}
        >
          《{def.name}》 ― {band.name}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.7, color: "#cdeff6" }}>
          {chip.text === "―"
            ? "――使えば育ち、置けば錆びる。"
            : `――${chip.text}。使えば育ち、置けば錆びる。`}
        </p>
      </div>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "6px 16px",
          fontSize: 13,
          alignContent: "start",
        }}
      >
        <dt style={{ color: B.dim }}>素質</dt>
        <dd style={{ margin: 0, fontFamily: theme.font.en }}>{Math.round(st.potential)}%</dd>
        <dt style={{ color: B.dim }}>未定着</dt>
        <dd style={{ margin: 0, fontFamily: theme.font.en }}>+{st.pending.toFixed(1)}</dd>
        <dt style={{ color: B.dim }}>最高値</dt>
        <dd style={{ margin: 0, fontFamily: theme.font.en }}>{st.peak.toFixed(1)}</dd>
        <dt style={{ color: B.dim }}>最後に使ったのは</dt>
        <dd style={{ margin: 0, fontFamily: theme.font.en }}>
          {st.lastUsedDay < 0 ? "―" : `${lastUsed}日前`}
        </dd>
        <dt style={{ color: B.dim }}>様子</dt>
        <dd style={{ margin: 0, fontFamily: theme.font.en }}>{chip.text}</dd>
      </dl>
    </div>
  );
}

/** 称号タブ */
function TitlesPanel({ state }: { state: GameState }) {
  return (
    <BlessingWindow
      style={{ ...pos({ left: 424, top: 92, right: 40, bottom: 70 }), padding: "18px 24px" }}
      corners={["tr", "bl"]}
    >
      <WinHead kicker="TITLES" title="名付けられたもの" bless />
      <div className="scroll b" style={{ maxHeight: "78%", overflowY: "auto" }}>
        {state.titles.length === 0 && <p style={{ color: B.dim }}>――まだ、呼ばれる名はない。</p>}
        {state.titles.map((id) => {
          const def = titles.titles.find((x) => x.id === id);
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                padding: "8px 0",
                borderBottom: `1px solid ${B.frameInner}`,
              }}
            >
              <span
                style={{
                  fontFamily: theme.font.en,
                  fontSize: 13,
                  color: theme.colors.grow,
                  width: 24,
                }}
              >
                {def?.rank ?? "?"}
              </span>
              <span style={{ fontFamily: theme.font.mincho, fontSize: 18, color: "#eaf8fb" }}>
                {titleNameOf(id)}
              </span>
              <span style={{ fontSize: 12, color: B.dim }}>{def?.message ?? ""}</span>
            </div>
          );
        })}
      </div>
    </BlessingWindow>
  );
}

/** 経歴タブ：いまの生の伝記（途中経過） */
function BioPanel({ state }: { state: GameState }) {
  return (
    <BlessingWindow
      style={{ ...pos({ left: 424, top: 92, right: 40, bottom: 70 }), padding: "18px 24px" }}
      corners={["tr", "bl"]}
    >
      <WinHead kicker="RECORD" title="これまでの記録" bless />
      <div className="scroll b" style={{ maxHeight: "78%", overflowY: "auto" }}>
        {bioLines(state).map((l, i) => (
          <p key={i} style={{ margin: "0 0 8px", fontSize: 15, color: "#d7eef3" }}>
            {l}
          </p>
        ))}
        <Divider bless />
        <p style={{ fontSize: 13, color: B.dim }}>
          台帳 {state.ledger.length}件・倒した数{" "}
          {Object.entries(state.counters)
            .filter(([k]) => k.startsWith("kill.species."))
            .reduce((a, [, v]) => a + v, 0)}
          ・深層 最深{state.counters["abyss.best"] ?? 0}層
        </p>
      </div>
    </BlessingWindow>
  );
}

/** 年代記タブ（records の年代記と同じ内容・加護の窓で） */
function ChroniclePanel() {
  const chronicle = loadChronicle();
  return (
    <BlessingWindow
      style={{ ...pos({ left: 424, top: 92, right: 40, bottom: 70 }), padding: "18px 24px" }}
      corners={["tr", "bl"]}
    >
      <WinHead kicker="CHRONICLE" title="世界が覚えている生" bless />
      <div className="scroll b" style={{ maxHeight: "78%", overflowY: "auto" }}>
        {chronicle.lives.length === 0 && <p style={{ color: B.dim }}>{t.text.chronicleEmpty}</p>}
        {chronicle.lives.map((life, i) => (
          <p key={i} style={{ margin: "0 0 10px", fontSize: 14, color: "#d7eef3" }}>
            {tpl(t.text.chronicleLine, {
              i: i + 1,
              name: life.name,
              epithet: life.epithet
                ? `《${titles.titles.find((x) => x.id === life.epithet)?.name ?? life.epithet}》`
                : "",
              days: life.daysLived,
              cause: t.display.causeNames[life.cause] ?? life.cause,
            })}
          </p>
        ))}
      </div>
    </BlessingWindow>
  );
}
export {};
