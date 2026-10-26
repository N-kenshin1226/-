/** 立場・目標と師匠の画面（UI-01：世界の窓＋コマンド列） */
import {
  canAct,
  canApprentice,
  routeProgress,
  suggestGoals,
  visiblePinnacles,
  type ActionEvent,
  type GameState,
} from "@trace/core";
import {
  cfg,
  eventLines,
  mentorList,
  offerName,
  pinnacleList,
  skillList,
  societyDefs,
  t,
  tpl,
} from "../game.js";
import { CommandMenu, HintBar, Kicker, WorldFrame, pos, type Act, type MenuEntry } from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 窓の頭（社会系画面共通） */
function WinHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div style={{ margin: "2px 14px 10px" }}>
      <Kicker text={kicker} />
      <div
        style={{
          fontFamily: theme.font.mincho,
          fontSize: 24,
          fontWeight: 800,
          color: W.hi,
          marginTop: 2,
        }}
      >
        {title}
      </div>
      {sub !== undefined && <div style={{ marginTop: 4, fontSize: 13, color: W.dim }}>{sub}</div>}
    </div>
  );
}

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

  // 志せる頂（X-9）：発見済みのルートだけ出す。隠しルートは噂を読むまで出ない
  const shownPinnacles = visiblePinnacles(pinnacleList, state.flags);
  const hasHidden = shownPinnacles.length < pinnacleList.length;
  const donation = cfg.donation;
  const canDonate =
    donation !== undefined && canAct(state.time, cfg.time) && state.player.money >= donation.amount;

  const entries: MenuEntry[] = [
    { kind: "header" as const, text: t.text.societyPinnacleHeader },
    ...shownPinnacles.map((r): MenuEntry => {
      const p = routeProgress(state, r);
      return {
        id: `pinnacle-${r.id}`,
        label: tpl(t.text.societyPinnacleLine, {
          name: r.name,
          done: p.done,
          total: p.total,
          desc: r.desc,
        }).trim(),
        onPick: () => {},
      };
    }),
    ...(hasHidden
      ? [
          {
            id: "pinnacle-hidden-hint",
            label: t.text.societyPinnacleHidden.trim(),
            disabled: true,
            onPick: () => {},
          } satisfies MenuEntry,
        ]
      : []),
    { kind: "divider" as const },
    ...(donation !== undefined
      ? [
          {
            id: "donate",
            label: tpl(t.text.societyDonateAction, { amount: donation.amount }),
            disabled: !canDonate,
            onPick: () => act({ type: "donate" }),
          } satisfies MenuEntry,
          { kind: "divider" as const },
        ]
      : []),
    ...(offers.length > 0
      ? [
          { kind: "header" as const, text: "認定の打診" },
          ...offers.map((id, i): MenuEntry => ({
            id: `offer-${id}`,
            label: tpl(t.text.societyOfferLine, { i: i + 1, name: offerName(id), kind: "" }).trim(),
            gold: true,
            onPick: () => act({ type: "acceptOffer", id }),
          })),
          { kind: "divider" as const },
        ]
      : []),
    { kind: "header", text: t.text.societyGoalsHeader },
    ...(goal
      ? [
          {
            id: "goal-abandon",
            label: `《${goal.name}》を取り下げる`,
            danger: true,
            onPick: () => act({ type: "abandonGoal" }),
          } satisfies MenuEntry,
        ]
      : suggested.length === 0
        ? []
        : suggested.map((g, i): MenuEntry => ({
            id: `goal-${g.id}`,
            label: tpl(t.text.societyGoalLine, { i: i + 1, name: g.name }),
            onPick: () => act({ type: "declareGoal", id: g.id }),
          }))),
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: back },
  ];

  return (
    <div data-testid="screen-society" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 600, bottom: 200 }), padding: "14px 4px" }}
      >
        <WinHead
          kicker="STANDING"
          title="目標と認定"
          sub={tpl(t.text.societyHeader, {
            standing: standing?.name ?? state.society.standing,
            profession: profession?.name ?? "―",
            goal: goal?.name ?? "―",
          })}
        />
        {offers.length === 0 && (
          <p style={{ margin: "0 16px 8px", fontSize: 13, color: W.dim }}>
            {t.text.societyNoOffers}
          </p>
        )}
        <div className="scroll" style={{ maxHeight: "72%", overflowY: "auto" }}>
          <CommandMenu entries={entries} onBack={back} />
        </div>
        <p style={{ margin: "8px 16px 0", fontSize: 12, color: W.faint }}>
          達成済み：{state.society.achievedGoals.length}
        </p>
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
        ...eventLines(
          ev.filter((e) => e.type !== "gainApplied"),
          state,
        ),
      ];
    };
    const entries: MenuEntry[] = [
      { kind: "header", text: tpl(t.text.difficultyPrompt, { recommended }) },
      ...[0, 10, 20, 30].map((add): MenuEntry => {
        const diff = recommended - 10 + add;
        return {
          id: `mentor-train-${add}`,
          label: `難度 ${diff}`,
          sub: `${current.fee}G`,
          disabled: !canTrain,
          onPick: () =>
            act(
              { type: "trainWithMentor", difficulty: diff },
              { format: (ev) => formatTrain(ev, diff) },
            ),
        };
      }),
      { kind: "divider" },
      {
        id: "mentor-leave",
        label: "弟子をやめる",
        danger: true,
        onPick: () => act({ type: "leaveMentor" }),
      },
      { id: "back", label: "戻る", onPick: back },
    ];
    return (
      <div data-testid="screen-mentor" className="scene">
        <WorldFrame
          style={{ ...pos({ left: 28, top: 120, width: 600, bottom: 200 }), padding: "14px 4px" }}
        >
          <WinHead
            kicker="MENTOR"
            title={tpl(t.text.mentorHeaderCurrent, {
              name: current.name,
              skill: skillName(current.skill),
              days: state.time.day - state.mentor!.sinceDay + 1,
            })}
            sub={current.desc}
          />
          {state.player.money < current.fee && (
            <p style={{ margin: "0 16px 6px", fontSize: 13, color: theme.colors.warn }}>
              {t.text.bookTooPoor}
            </p>
          )}
          {!canAct(state.time, cfg.time) && (
            <p style={{ margin: "0 16px 6px", fontSize: 13, color: theme.colors.warn }}>
              {t.text.mustSleep}
            </p>
          )}
          <CommandMenu entries={entries} onBack={back} />
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

  const entries: MenuEntry[] = [
    ...mentorList.flatMap((m): MenuEntry[] => {
      const ok = canApprentice(state, m.id, cfg.mentors, cfg.time);
      const mark = ok ? t.text.mentorMarkOk : t.text.mentorMarkNg;
      return [
        {
          id: `mentor-${m.id}`,
          label: `${m.name}\u3000《${skillName(m.skill)}》― ${m.desc}`,
          sub: `稽古 ${m.fee}G・${mark}`,
          onPick: () => {},
        },
        ...(ok
          ? [
              {
                id: `mentor-apprentice-${m.id}`,
                label: `↳ ${m.name}に弟子入りする`,
                primary: true,
                onPick: () => act({ type: "apprentice", id: m.id }),
              } satisfies MenuEntry,
            ]
          : []),
      ];
    }),
    { kind: "divider" },
    { id: "back", label: "戻る", onPick: back },
  ];
  return (
    <div data-testid="screen-mentor" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 640, bottom: 200 }), padding: "14px 4px" }}
      >
        <WinHead kicker="MENTOR" title={t.text.mentorHeaderNone} />
        <div className="scroll" style={{ maxHeight: "78%", overflowY: "auto" }}>
          <CommandMenu entries={entries} onBack={back} />
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
