/** 記録・見聞系の画面（UI-01：書かれた記録は「紙」の上に並べる） */
import { canAct, createRng, rivalsOf, visibleAtoms, type GameState } from "@trace/core";
import { balance, enemies, pinnacles, rivals, titles } from "@trace/content";
import {
  allArtDefs,
  atomList,
  bioLines,
  cfg,
  crisisRecordLines,
  dungeonRecordLines,
  occasionRecordLines,
  eventLines,
  landmarkRecordLines,
  loadChronicle,
  narrator,
  skillList,
  societyDefs,
  t,
  tpl,
  uniqueRecordLines,
  workName,
} from "../game.js";
import {
  CommandMenu,
  HintBar,
  Paper,
  pos,
  useHotkeys,
  type Act,
  type MenuEntry,
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const P = theme.colors.paper;

/** 紙の節見出し（記録画面の章立て） */
function PaperHead({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "18px 0 6px",
        fontFamily: theme.font.mincho,
        fontSize: 17,
        fontWeight: 800,
        color: P.head,
        borderBottom: `1px solid ${P.line}`,
        paddingBottom: 3,
      }}
    >
      {children}
    </p>
  );
}

// ---- 街の記録 ----
export function RecordsScreen({ state, back }: { state: GameState; back: () => void }) {
  useHotkeys({ escape: back });
  return (
    <div data-testid="screen-records" className="scene">
      <Paper
        tilt={0.4}
        style={{ ...pos({ left: 300, top: 60, width: 680, bottom: 60 }), padding: "24px 36px" }}
      >
        <p
          style={{
            margin: "0 0 4px",
            textAlign: "center",
            fontFamily: theme.font.mincho,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "0.24em",
            color: P.head,
          }}
        >
          {t.text.recordsHeader}
        </p>
        <div className="scroll" style={{ height: "88%", overflowY: "auto", fontSize: 15 }}>
          <PaperHead>{tpl(t.text.recordsLedger, { count: state.ledger.length })}</PaperHead>
          {state.ledger.length === 0 && (
            <div style={{ color: P.dim }}>{t.text.recordsLedgerEmpty}</div>
          )}
          {state.ledger.slice(-10).map((w, i) => (
            <div key={w.id} style={{ color: P.sub, padding: "2px 0" }}>
              {tpl(t.text.recordsLedgerLine, {
                i: i + 1,
                name: skillList.find((s) => s.id === w.kind)?.name ?? w.kind,
                quality: w.quality,
                tier: w.tier,
                value: w.marketValue,
                day: w.day,
              })}
            </div>
          ))}
          <PaperHead>
            {/* recordsTitles は「称号：{titles}」のテンプレート。見出しには名札部分だけ使う */}
            {tpl(t.text.recordsTitles, { titles: "" }).split("：")[0]}
          </PaperHead>
          <div style={{ color: P.text }}>
            {state.titles
              .map((id) => `《${titles.titles.find((x) => x.id === id)?.name ?? id}》`)
              .join("　") || "――名付けられたものは、まだない。"}
          </div>
          <PaperHead>見聞</PaperHead>
          <div style={{ color: P.sub }}>
            {tpl(t.text.recordsLore, {
              facts: state.lore.facts.length,
              conns: state.lore.connections.length,
            })}
          </div>
          <div style={{ color: P.dim, fontStyle: "italic" }}>
            {narrator
              .narrate(
                {
                  scene: "loreDigest",
                  facts: state.lore.facts.length,
                  connected: state.lore.connections.length,
                },
                createRng(`${state.seed}:loredigest`),
              )
              .join("")}
          </div>
          {/* ここまでの記録（T-37 伝記の途中経過プレビュー） */}
          <div data-testid="records-bio">
            <PaperHead>これまでの記録</PaperHead>
            {bioLines(state).map((l, i) => (
              <div key={i} style={{ color: P.text, padding: "1px 0" }}>
                {l}
              </div>
            ))}
          </div>
          {/* 討伐図鑑（T-44）：kill.species.* / kill.unique.* カウンタから実績一覧 */}
          <PaperHead>{t.text.recordsHunt}</PaperHead>
          {enemies.enemies.map((e) => {
            const kills = state.counters[`kill.species.${e.id}`] ?? 0;
            const uniques = state.counters[`kill.unique.${e.id}`] ?? 0;
            if (kills === 0) return null;
            return (
              <div key={e.id} style={{ color: P.sub }}>
                {tpl(t.text.recordsHuntLine, {
                  name: e.name,
                  kills,
                  unique: uniques > 0 ? tpl(t.text.recordsHuntUnique, { unique: uniques }) : "",
                })}
              </div>
            );
          })}
          {/* 深層の自己ベスト（T-43）：abyss.best / abyss.runs カウンタ */}
          <PaperHead>深層</PaperHead>
          <div style={{ color: P.text }}>
            {(state.counters["abyss.runs"] ?? 0) === 0
              ? t.text.recordsAbyssNone
              : tpl(t.text.recordsAbyss, {
                  best: state.counters["abyss.best"] ?? 0,
                  runs: state.counters["abyss.runs"] ?? 0,
                })}
          </div>
          {/* 有限迷宮（G-03）：生成世界の迷宮と抜いた室数。制覇は《制覇》の印 */}
          <div data-testid="records-dungeons">
            {dungeonRecordLines(state).map((l, i) =>
              i === 0 ? (
                <PaperHead key="head">{l}</PaperHead>
              ) : (
                <div key={i} style={{ color: P.sub }}>
                  {l}
                </div>
              ),
            )}
          </div>
          {/* 名所（X-29）：踏んだ名所が記録に残る —— 霧の中の名は出さない */}
          <div data-testid="records-landmarks">
            {landmarkRecordLines(state).map((l, i) =>
              i === 0 ? (
                <PaperHead key="head">{l}</PaperHead>
              ) : (
                <div key={i} style={{ color: P.sub }}>
                  {l}
                </div>
              ),
            )}
          </div>
          {/* ライバル・ランキング（T-47。派生値：state.rng は消費しない） */}
          <div data-testid="records-rivals">
            <PaperHead>{t.text.recordsRivals}</PaperHead>
            {rivalsOf(state, rivals, balance.rivals).entries.map((e) => (
              <div
                key={e.rank}
                style={
                  e.isPlayer ? { fontWeight: 800, color: P.head, fontSize: 16 } : { color: P.sub }
                }
              >
                {tpl(t.text.recordsRivalLine, {
                  rank: e.rank,
                  name: e.name,
                  epithet: e.epithet ? tpl(t.text.recordsRivalEpithet, { epithet: e.epithet }) : "",
                  score: e.score,
                  you: e.isPlayer ? t.text.recordsRivalYou : "",
                })}
              </div>
            ))}
            <div style={{ color: P.dim, fontSize: 13 }}>{t.text.recordsRivalNote}</div>
          </div>
          {/* 勝負所の行事（X-10）：臨んだ勝負所の記録。淡々とした結果の一覧だけ */}
          <div data-testid="records-occasions">
            {occasionRecordLines(state).map((l, i) =>
              i === 0 ? (
                <PaperHead key="head">{l}</PaperHead>
              ) : (
                <div key={i} style={{ color: P.sub }}>
                  {l}
                </div>
              ),
            )}
          </div>
          {/* ユニークスキル（K-03）：その世界で一人だけの技の記録。
              世界の記録は次代にも継がるので、前代の持ち主も列に残る */}
          <div data-testid="records-uniques">
            {uniqueRecordLines(state).map((l, i) =>
              i === 0 ? (
                <PaperHead key="head">{l}</PaperHead>
              ) : (
                <div key={i} style={{ color: P.sub }}>
                  {l}
                </div>
              ),
            )}
          </div>
          {/* 世界の出来事（W-01、docs/08）：危機の記録。淡々とした出来事の一覧だけ */}
          <div data-testid="records-crisis">
            {crisisRecordLines(state).map((l, i) =>
              i === 0 ? (
                <PaperHead key="head">{l}</PaperHead>
              ) : (
                <div key={i} style={{ color: P.sub }}>
                  {l}
                </div>
              ),
            )}
          </div>
          {/* 年代記（T-38。周回をまたぐ記録。セーブとは別領域に残る） */}
          <ChronicleView />
        </div>
      </Paper>
      <HintBar items={[["Esc", "戻る"]]} />
    </div>
  );
}

/** 年代記の一覧（CLI の chronicleLines と同じ組み立て） */
function ChronicleView() {
  const chronicle = loadChronicle();
  return (
    <div data-testid="chronicle">
      <PaperHead>{tpl(t.text.chronicleHeader, { count: chronicle.lives.length })}</PaperHead>
      {chronicle.lives.length === 0 && <div style={{ color: P.dim }}>{t.text.chronicleEmpty}</div>}
      {chronicle.lives.map((life, i) => {
        const epithet = life.epithet
          ? `《${titles.titles.find((x) => x.id === life.epithet)?.name ?? life.epithet}》`
          : "";
        const standing =
          societyDefs.standings.find((s) => s.id === life.standing)?.name ?? life.standing;
        const profession =
          life.profession === null
            ? "―"
            : (societyDefs.professions.find((p) => p.id === life.profession)?.name ??
              life.profession);
        return (
          <div
            key={i}
            style={{
              color: P.sub,
              padding: "6px 0",
              borderBottom: `1px dashed ${P.line}`,
            }}
          >
            <div style={{ color: P.text, fontWeight: 700 }}>
              {tpl(t.text.chronicleLine, {
                i: i + 1,
                name: life.name,
                epithet,
                days: life.daysLived,
                cause: t.display.causeNames[life.cause] ?? life.cause,
              })}
            </div>
            <div>{tpl(t.text.chronicleRole, { standing, profession })}</div>
            {life.notableWorks.length > 0 && (
              <div>
                {tpl(t.text.chronicleWorks, {
                  works: life.notableWorks
                    .map((w) => `《${workName(w)}》品質${w.quality}`)
                    .join("、"),
                })}
              </div>
            )}
            {/* 頂点に至ったルート（T-41）：年代記の頁に刻む */}
            {life.pinnacles !== undefined && life.pinnacles.length > 0 && (
              <div>
                {tpl(t.text.chroniclePinnacle, {
                  pinnacles: life.pinnacles
                    .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
                    .join("、"),
                })}
              </div>
            )}
            {/* その生が手にしたユニーク（K-03）：「世界に一つだけ」の実績は
                生を越えて年代記に語り継がれる */}
            {life.uniques !== undefined && life.uniques.length > 0 && (
              <div>
                {tpl(t.text.chronicleUniques, {
                  uniques: life.uniques.map((id) => `《${allArtDefs[id]?.name ?? id}》`).join("、"),
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- 見聞録（紙の目次。読むと頁が開く） ----
export function LoreScreen({
  state,
  atomId,
  setScreen,
  act,
}: {
  state: GameState;
  atomId?: string;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  // X-33：見聞録に出るのは条件の立った頁だけ（名所の頁は踏んだ刻印で現れる）
  const visAtoms = visibleAtoms(state, atomList, cfg.time);
  const atom = visAtoms.find((a) => a.id === atomId);
  const canActNow = canAct(state.time, cfg.time);
  if (atom) {
    const read = state.lore.read.includes(atom.id);
    const entries: MenuEntry[] = [
      ...(!read
        ? [
            {
              id: "lore-read",
              label: "読む（1行動）",
              primary: true,
              disabled: !canActNow,
              onPick: () => {
                act(
                  { type: "readAtom", id: atom.id },
                  {
                    format: (ev) => [
                      tpl(t.text.loreRead, { title: atom.title, text: atom.text }),
                      ...eventLines(
                        ev.filter((e) => e.type !== "atomRead"),
                        state,
                      ),
                    ],
                  },
                );
              },
            },
          ]
        : []),
      {
        id: "lore-list",
        label: "一覧へ",
        onPick: () => setScreen({ name: "lore" }),
      },
    ];
    return (
      <div data-testid="lore-atom" className="scene">
        <Paper
          tilt={-0.5}
          style={{ ...pos({ left: 320, top: 80, width: 640, bottom: 120 }), padding: "28px 40px" }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.mincho,
              fontSize: 24,
              fontWeight: 800,
              color: P.head,
              borderBottom: `3px double ${P.text}`,
              paddingBottom: 8,
            }}
          >
            《{atom.title}》
            <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 400, color: P.dim }}>
              {atom.kind}
            </span>
          </p>
          <div className="scroll" style={{ maxHeight: "62%", overflowY: "auto", marginTop: 12 }}>
            {read ? (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 2, color: P.text }}>
                {atom.text}
              </div>
            ) : (
              <div style={{ color: P.dim }}>――まだ読んでいない。読むには1行動を使う。</div>
            )}
          </div>
          <div style={{ position: "absolute", left: 40, right: 40, bottom: 20 }}>
            <CommandMenu paper entries={entries} onBack={() => setScreen({ name: "lore" })} />
          </div>
        </Paper>
        <HintBar
          items={[
            ["↑↓", "選択"],
            ["Enter", "決定"],
            ["Esc", "一覧"],
          ]}
        />
      </div>
    );
  }
  const entries: MenuEntry[] = visAtoms.map((a) => ({
    id: `atom-${a.id}`,
    label: (
      <>
        <span style={{ marginRight: 10, color: P.dim }}>
          {state.lore.read.includes(a.id) ? "読" : "・"}
        </span>
        {a.title}
      </>
    ),
    sub: a.kind,
    onPick: () => setScreen({ name: "lore", atomId: a.id }),
  }));
  return (
    <div data-testid="screen-lore" className="scene">
      <Paper
        tilt={0.4}
        style={{ ...pos({ left: 320, top: 80, width: 640, bottom: 80 }), padding: "24px 36px" }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontFamily: theme.font.mincho,
            fontSize: 22,
            fontWeight: 800,
            color: P.head,
            borderBottom: `3px double ${P.text}`,
            paddingBottom: 8,
          }}
        >
          {tpl(t.text.loreListHeader, {
            read: state.lore.read.length,
            total: visAtoms.length,
            facts: state.lore.facts.length,
          })}
        </p>
        {visAtoms.length === 0 && <div style={{ color: P.dim }}>{t.text.loreNone}</div>}
        <div className="scroll" style={{ height: "82%", overflowY: "auto" }}>
          <CommandMenu
            paper
            entries={[
              ...entries,
              { kind: "divider" },
              { id: "back", label: "戻る", onPick: () => setScreen({ name: "menu" }) },
            ]}
            onBack={() => setScreen({ name: "menu" })}
          />
        </div>
      </Paper>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "開く"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}
