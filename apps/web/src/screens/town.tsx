/** 街・自宅の単発画面：鍛錬・寝る（宿）・書店・能力（X-2 で App.tsx から分離） */
import { useState } from "react";
import { bookDaysLeft, canAct, isSkillUnlocked, type GameState, type InnRank } from "@trace/core";
import {
  bookList,
  cfg,
  eventLines,
  innCost,
  innQuality,
  inns,
  qualityLabel,
  skillList,
  t,
  tpl,
} from "../game.js";
import { Btn, css, type Act } from "../ui.js";

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
  const [picked, setPicked] = useState<string | null>(null);
  const sk = skillList.find((s) => s.id === picked);
  return (
    <section style={css.panel} data-testid="screen-train">
      <div>{t.text.skillPick}</div>
      <div>
        {skillList
          .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
          .map((s) => {
            const st = state.player.skills[s.id]!;
            return (
              <Btn key={s.id} testId={`skill-${s.id}`} onClick={() => setPicked(s.id)}>
                {s.name}
                <span style={css.dim}>
                  {" "}
                  {st.value.toFixed(1)}
                  {st.pending > 0 && <span style={css.accent}> +{st.pending.toFixed(1)}</span>}
                </span>
              </Btn>
            );
          })}
      </div>
      {sk && (
        <div style={{ marginTop: 8 }} data-testid="train-difficulty">
          <div style={css.dim}>
            {tpl(t.text.difficultyPrompt, {
              recommended: Math.round(state.player.skills[sk.id]!.value) + 10,
            })}
          </div>
          {[0, 10, 20, 30].map((add) => {
            const diff = Math.round(state.player.skills[sk.id]!.value) + add;
            return (
              <Btn
                key={add}
                testId={`diff-${add}`}
                primary={add === 10}
                onClick={() => act({ type: "train", skill: sk.id, difficulty: diff })}
              >
                難度 {diff}
              </Btn>
            );
          })}
        </div>
      )}
      <Btn onClick={back}>戻る</Btn>
    </section>
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
  return (
    <section style={css.panel} data-testid="screen-sleep">
      <div>{t.text.innPick}</div>
      <div>
        {inns.map((inn) => {
          const cost = innCost(inn, state);
          return (
            <Btn
              key={inn}
              testId={`inn-${inn}`}
              disabled={cost > state.player.money}
              onClick={() => {
                act({ type: "sleep", inn: inn as InnRank, dinner });
                back();
              }}
            >
              {t.display.innNames[inn]}
              <span style={css.dim}>
                {" "}
                （質：{qualityLabel(innQuality(inn, dinner))}、{cost}G）
              </span>
            </Btn>
          );
        })}
      </div>
      <div style={{ margin: "8px 0" }}>
        {t.text.dinnerPrompt}{" "}
        <Btn testId="dinner-yes" primary={dinner} onClick={() => setDinner(true)}>
          {t.display.dinnerNames.with}
        </Btn>
        <Btn testId="dinner-no" primary={!dinner} onClick={() => setDinner(false)}>
          {t.display.dinnerNames.without}
        </Btn>
      </div>
      <Btn
        testId="sleep-home"
        onClick={() => {
          act({ type: "rest" }, { atHome: true });
          back();
        }}
      >
        {t.display.homeName}で休む（無料）
      </Btn>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 書店（T-26。書物は購入して持ち、読むと成長効果・潜在回復を得る。読むのに1行動） ----
export function BookScreen({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canRead = canAct(state.time, cfg.time);
  return (
    <section style={css.panel} data-testid="screen-book">
      <div>{tpl(t.text.bookShopHeader, { money: state.player.money })}</div>
      {bookList.map((b) => {
        const owned = state.books.owned.includes(b.id);
        const read = state.books.read.some((r) => r.id === b.id);
        const daysLeft = bookDaysLeft(state, b);
        return (
          <div key={b.id} data-testid={`book-${b.id}`} style={{ margin: "10px 0" }}>
            <div>
              <span style={css.accent}>《{b.name}》</span>
              <span style={css.dim}> {b.desc}</span>
            </div>
            {!owned && (
              <div>
                <Btn
                  testId={`book-buy-${b.id}`}
                  disabled={state.player.money < b.price}
                  onClick={() => act({ type: "buyBook", id: b.id })}
                >
                  買う（{b.price}G）
                </Btn>
              </div>
            )}
            {owned && !read && (
              <div>
                <Btn
                  primary
                  testId={`book-read-${b.id}`}
                  disabled={!canRead}
                  onClick={() =>
                    act(
                      { type: "readBook", id: b.id },
                      {
                        format: (ev) => [
                          tpl(t.text.bookRead, { name: b.name, text: b.readText }),
                          ...eventLines(ev),
                        ],
                      },
                    )
                  }
                >
                  読む（1行動）
                </Btn>
                {!canRead && <span style={css.sys}> {t.text.mustSleep}</span>}
              </div>
            )}
            {read && (
              <div style={css.dim}>
                {t.text.bookAlreadyRead}
                {daysLeft > 0 && ` ${tpl(t.text.bookEffectDays, { days: daysLeft })}`}
              </div>
            )}
          </div>
        );
      })}
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 能力 ----
export function StatusScreen({ state, back }: { state: GameState; back: () => void }) {
  return (
    <section style={css.panel} data-testid="screen-status">
      <div style={css.accent}>スキル</div>
      {skillList
        .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
        .map((s) => {
          const st = state.player.skills[s.id]!;
          return (
            <div key={s.id}>
              {s.name} <span style={css.accent}>{st.value.toFixed(1)}</span>
              {st.pending > 0 && <span style={css.dim}>（+{st.pending.toFixed(1)} 未定着）</span>}
              <span style={css.dim}> 素質 {Math.round(st.potential)}</span>
            </div>
          );
        })}
      <div style={{ ...css.accent, marginTop: 8 }}>基礎能力</div>
      {(Object.keys(state.player.stats) as (keyof typeof state.player.stats)[]).map((id) => (
        <div key={id}>
          {t.display.statNames[id] ?? id}{" "}
          <span style={css.accent}>{Math.round(state.player.stats[id])}</span>
          {(state.player.load[id] ?? 0) > 0 && (
            <span style={css.dim}>（負荷 {(state.player.load[id] ?? 0).toFixed(1)}）</span>
          )}
        </div>
      ))}
      <div style={{ marginTop: 8, ...css.dim }}>
        称号：{state.titles.length === 0 ? "―" : state.titles.join("、")}
      </div>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}
