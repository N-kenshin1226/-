/** 立場・目標と師匠の画面（X-2 で App.tsx から分離） */
import { canAct, canApprentice, suggestGoals, type ActionEvent, type GameState } from "@trace/core";
import { cfg, eventLines, mentorList, offerName, skillList, societyDefs, t, tpl } from "../game.js";
import { Btn, CardTitle, css, type Act } from "../ui.js";

// ---- 立場・目標 ----
export function SocietyScreen({
  state,
  act,
  back,
}: {
  state: GameState;
  act: Act;
  back: () => void;
}) {
  const standing = societyDefs.standings.find((s) => s.id === state.society.standing);
  const profession = societyDefs.professions.find((p) => p.id === state.society.profession);
  const goal = societyDefs.lifeGoals.find((g) => g.id === state.society.goal);
  const offers = state.society.pendingOffers;
  const suggested = suggestGoals(state, cfg.society, 3);
  return (
    <section style={css.panel} data-testid="screen-society">
      <CardTitle>
        {tpl(t.text.societyHeader, {
          standing: standing?.name ?? state.society.standing,
          profession: profession?.name ?? "―",
          goal: goal?.name ?? "―",
        })}
      </CardTitle>
      {offers.length === 0 ? (
        <div style={css.dim}>{t.text.societyNoOffers}</div>
      ) : (
        offers.map((id, i) => (
          <div key={id}>
            <Btn primary testId={`offer-${id}`} onClick={() => act({ type: "acceptOffer", id })}>
              {tpl(t.text.societyOfferLine, { i: i + 1, name: offerName(id), kind: "" }).trim()}
            </Btn>
          </div>
        ))
      )}
      <div style={{ marginTop: 8 }}>
        <CardTitle tone="gold">{t.text.societyGoalsHeader}</CardTitle>
      </div>
      {goal ? (
        <div>
          <div>《{goal.name}》を目指しています</div>
          <Btn testId="goal-abandon" onClick={() => act({ type: "abandonGoal" })}>
            取り下げる
          </Btn>
        </div>
      ) : (
        <>
          {suggested.length === 0 && <div style={css.dim}>{t.text.societyNoGoal}</div>}
          {suggested.map((g, i) => (
            <Btn
              key={g.id}
              testId={`goal-${g.id}`}
              onClick={() => act({ type: "declareGoal", id: g.id })}
            >
              {tpl(t.text.societyGoalLine, { i: i + 1, name: g.name })}
            </Btn>
          ))}
        </>
      )}
      <div style={{ marginTop: 8, ...css.dim }}>達成済み：{state.society.achievedGoals.length}</div>
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}

// ---- 師匠（T-27。弟子入りで担当スキルの伸びが上がり、稽古で素質が戻る） ----
export function MentorScreen({
  state,
  act,
  back,
}: {
  state: GameState;
  act: Act;
  back: () => void;
}) {
  const skillName = (id: string) => skillList.find((s) => s.id === id)?.name ?? id;
  const current = state.mentor ? (mentorList.find((m) => m.id === state.mentor!.id) ?? null) : null;

  if (current) {
    const recommended = Math.round(state.player.skills[current.skill]?.value ?? 0) + 10;
    const canTrain = canAct(state.time, cfg.time) && state.player.money >= current.fee;
    const formatTrain = (ev: ActionEvent[], difficulty: number): string[] => {
      const gain = ev.find((e) => e.type === "gainApplied");
      return [
        tpl(t.text.mentorTrainResult, {
          name: skillName(current.skill),
          difficulty,
          fee: current.fee,
          amount: (gain?.type === "gainApplied" ? gain.amount : 0).toFixed(1),
        }),
        ...eventLines(ev.filter((e) => e.type !== "gainApplied")),
      ];
    };
    return (
      <section style={css.panel} data-testid="screen-mentor">
        <CardTitle>
          {tpl(t.text.mentorHeaderCurrent, {
            name: current.name,
            skill: skillName(current.skill),
            days: state.time.day - state.mentor!.sinceDay + 1,
          })}
        </CardTitle>
        <div style={css.dim}>{current.desc}</div>
        <div style={{ ...css.dim, margin: "8px 0" }}>
          {tpl(t.text.difficultyPrompt, { recommended })}
        </div>
        <div>
          {[0, 10, 20, 30].map((add) => {
            const diff = recommended - 10 + add;
            return (
              <Btn
                key={add}
                testId={`mentor-train-${add}`}
                primary={add === 10}
                disabled={!canTrain}
                onClick={() =>
                  act(
                    { type: "trainWithMentor", difficulty: diff },
                    { format: (ev) => formatTrain(ev, diff) },
                  )
                }
              >
                難度 {diff}（{current.fee}G）
              </Btn>
            );
          })}
        </div>
        {state.player.money < current.fee && <div style={css.sys}>{t.text.bookTooPoor}</div>}
        {!canAct(state.time, cfg.time) && <div style={css.sys}>{t.text.mustSleep}</div>}
        <div style={{ marginTop: 8 }}>
          <Btn testId="mentor-leave" onClick={() => act({ type: "leaveMentor" })}>
            弟子をやめる
          </Btn>
          <Btn onClick={back}>戻る</Btn>
        </div>
      </section>
    );
  }

  return (
    <section style={css.panel} data-testid="screen-mentor">
      <CardTitle>{t.text.mentorHeaderNone}</CardTitle>
      {mentorList.map((m) => {
        const ok = canApprentice(state, m.id, cfg.mentors, cfg.time);
        return (
          <div key={m.id} data-testid={`mentor-${m.id}`} style={{ margin: "10px 0" }}>
            <div>
              <span style={css.accent}>{m.name}</span>
              <span style={css.dim}>
                {" "}
                《{skillName(m.skill)}》・稽古 {m.fee}G{" "}
                {ok ? t.text.mentorMarkOk : t.text.mentorMarkNg}
              </span>
            </div>
            <div style={css.dim}>{m.desc}</div>
            {ok && (
              <Btn
                primary
                testId={`mentor-apprentice-${m.id}`}
                onClick={() => act({ type: "apprentice", id: m.id })}
              >
                弟子入りする
              </Btn>
            )}
          </div>
        );
      })}
      <Btn onClick={back}>戻る</Btn>
    </section>
  );
}
