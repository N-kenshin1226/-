/** 記録・見聞系の画面：街の記録・年代記・見聞録（X-2 で App.tsx から分離） */
import { canAct, createRng, rivalsOf, type GameState } from "@trace/core";
import { balance, enemies, pinnacles, rivals, titles } from "@trace/content";
import {
  atomList,
  bioLines,
  cfg,
  eventLines,
  loadChronicle,
  narrator,
  skillList,
  societyDefs,
  t,
  tpl,
  workName,
} from "../game.js";
import { Btn, css, type Act, type Screen } from "../ui.js";

// ---- 街の記録 ----
export function RecordsScreen({ state, back }: { state: GameState; back: () => void }) {
  return (
    <section style={css.panel} data-testid="screen-records">
      <div style={css.accent}>{t.text.recordsHeader}</div>
      <div>{tpl(t.text.recordsLedger, { count: state.ledger.length })}</div>
      {state.ledger.length === 0 && <div style={css.dim}>{t.text.recordsLedgerEmpty}</div>}
      {state.ledger.slice(-10).map((w, i) => (
        <div key={w.id} style={css.dim}>
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
      <div style={{ marginTop: 8 }}>
        {tpl(t.text.recordsTitles, { titles: state.titles.join("、") || "―" })}
      </div>
      <div style={{ marginTop: 8 }}>
        {tpl(t.text.recordsLore, {
          facts: state.lore.facts.length,
          conns: state.lore.connections.length,
        })}
      </div>
      <div style={{ ...css.dim, marginTop: 4 }}>
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
      <div style={{ ...css.dim, marginTop: 12 }}>
        {bioLines(state).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      {/* 討伐図鑑（T-44）：kill.species.* / kill.unique.* カウンタから実績一覧 */}
      <div style={{ marginTop: 12 }}>{t.text.recordsHunt}</div>
      {enemies.enemies.map((e) => {
        const kills = state.counters[`kill.species.${e.id}`] ?? 0;
        const uniques = state.counters[`kill.unique.${e.id}`] ?? 0;
        if (kills === 0) return null;
        return (
          <div key={e.id} style={css.dim}>
            {tpl(t.text.recordsHuntLine, {
              name: e.name,
              kills,
              unique: uniques > 0 ? tpl(t.text.recordsHuntUnique, { unique: uniques }) : "",
            })}
          </div>
        );
      })}
      {/* 深層の自己ベスト（T-43）：abyss.best / abyss.runs カウンタ */}
      <div style={{ marginTop: 8 }}>
        {(state.counters["abyss.runs"] ?? 0) === 0
          ? t.text.recordsAbyssNone
          : tpl(t.text.recordsAbyss, {
              best: state.counters["abyss.best"] ?? 0,
              runs: state.counters["abyss.runs"] ?? 0,
            })}
      </div>
      {/* ライバル・ランキング（T-47。派生値：state.rng は消費しない） */}
      <div style={{ marginTop: 12 }} data-testid="records-rivals">
        <div>{t.text.recordsRivals}</div>
        {rivalsOf(state, rivals, balance.rivals).entries.map((e) => (
          <div key={e.rank} style={e.isPlayer ? undefined : css.dim}>
            {tpl(t.text.recordsRivalLine, {
              rank: e.rank,
              name: e.name,
              epithet: e.epithet ? tpl(t.text.recordsRivalEpithet, { epithet: e.epithet }) : "",
              score: e.score,
              you: e.isPlayer ? t.text.recordsRivalYou : "",
            })}
          </div>
        ))}
        <div style={css.dim}>{t.text.recordsRivalNote}</div>
      </div>
      {/* 年代記（T-38。周回をまたぐ記録。セーブとは別領域に残る） */}
      <ChronicleView />
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

/** 年代記の一覧（CLI の chronicleLines と同じ組み立て） */
function ChronicleView() {
  const chronicle = loadChronicle();
  return (
    <div style={{ marginTop: 12 }} data-testid="chronicle">
      <div>{tpl(t.text.chronicleHeader, { count: chronicle.lives.length })}</div>
      {chronicle.lives.length === 0 && <div style={css.dim}>{t.text.chronicleEmpty}</div>}
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
          <div key={i} style={css.dim}>
            <div>
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
          </div>
        );
      })}
    </div>
  );
}

// ---- 見聞録 ----
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
  const atom = atomList.find((a) => a.id === atomId);
  const canActNow = canAct(state.time, cfg.time);
  if (atom) {
    const read = state.lore.read.includes(atom.id);
    return (
      <section style={css.panel} data-testid="lore-atom">
        <div style={css.accent}>《{atom.title}》</div>
        <div style={css.dim}>（{atom.kind}）</div>
        {read ? (
          <div style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{atom.text}</div>
        ) : (
          <div style={css.dim}>――まだ読んでいない。読むには1行動を使う。</div>
        )}
        {!read && (
          <Btn
            primary
            testId="lore-read"
            disabled={!canActNow}
            onClick={() => {
              act(
                { type: "readAtom", id: atom.id },
                {
                  format: (ev) => [
                    tpl(t.text.loreRead, { title: atom.title, text: atom.text }),
                    ...eventLines(ev.filter((e) => e.type !== "atomRead")),
                  ],
                },
              );
            }}
          >
            読む（1行動）
          </Btn>
        )}
        <Btn onClick={() => setScreen({ name: "lore" })}>一覧へ</Btn>
      </section>
    );
  }
  return (
    <section style={css.panel} data-testid="screen-lore">
      <div>
        {tpl(t.text.loreListHeader, {
          read: state.lore.read.length,
          total: atomList.length,
          facts: state.lore.facts.length,
        })}
      </div>
      {atomList.length === 0 && <div style={css.dim}>{t.text.loreNone}</div>}
      {atomList.map((a) => (
        <div key={a.id}>
          <Btn testId={`atom-${a.id}`} onClick={() => setScreen({ name: "lore", atomId: a.id })}>
            {state.lore.read.includes(a.id) ? "📖" : "◻"} {a.title}
            <span style={css.dim}>（{a.kind}）</span>
          </Btn>
        </div>
      ))}
      <Btn onClick={() => setScreen({ name: "menu" })}>戻る</Btn>
    </section>
  );
}
