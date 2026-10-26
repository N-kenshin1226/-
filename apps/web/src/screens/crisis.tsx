/**
 * 決着の場面（W-03、docs/08 §6）：打診への応え・勝負所への臨み方・自分で起こす。
 * ここは「届いたものへの応え方」を置く窓であって、世界の危機をクエスト一覧としては
 * 見せない ―― 打診が届いていなければメニューに項目自体が出ず、何もしなくても
 * 世界はNPCや勢力の手で進む（W-01 の判定は変えない）
 */
import { useState } from "react";
import type { CrisisFieldId, GameState } from "@trace/core";
import { narration } from "@trace/content";
import {
  cfg,
  crisisFinaleOffers,
  crisisOfferSpeaker,
  enemyList,
  eventLines,
  t,
  tpl,
  type MinigameKind,
  type Order,
} from "../game.js";
import {
  CommandMenu,
  ConfirmWindow,
  DialogueBox,
  HintBar,
  Kicker,
  WorldFrame,
  pos,
  type Act,
  type MenuEntry,
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 勝負所の遊び方（役目 → 実際に遊ぶ器）。score の換算は各器が行う */
type AttemptVessel =
  { kind: "combat"; enemyId: string } | { kind: "minigame"; minigame: MinigameKind };

/** 役目と場面の前線（def.ref）から、遊ぶ器を決める（表示側の振り分けだけ。判定は core） */
function attemptVessel(state: GameState, role: string, ref?: string): AttemptVessel {
  if (role === "vanguard") {
    const foe =
      enemyList.find((e) => e.id === ref) ??
      [...enemyList].sort((a, b) => b.challenge - a.challenge)[0]!;
    return { kind: "combat", enemyId: foe.id };
  }
  if (role === "artisan") {
    // 工芸の役目：自分の得意な技能で見せる（技能値の最も高い artisan 系の皮）
    const skills = cfg.crisis?.involvement?.roleSkills.artisan ?? ["smithing"];
    const best = [...skills].sort(
      (a, b) => (state.player.skills[b]?.value ?? 0) - (state.player.skills[a]?.value ?? 0),
    )[0]!;
    const minigame: MinigameKind =
      best === "performance" || best === "fishing"
        ? best
        : best === "mining" || best === "appraisal"
          ? best
          : "smithing";
    return { kind: "minigame", minigame };
  }
  // 会議の場・まとめ役：駆け引きの場として交渉の皮で遊ぶ
  return { kind: "minigame", minigame: "negotiation" };
}

export function CrisisScreen({
  state,
  setScreen,
  act,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  const offers = crisisFinaleOffers(state, cfg.crisis);
  /** 「自分で起こす」の対象として選んだ場面（分野選び → 確認の2段） */
  const [leadTarget, setLeadTarget] = useState<string | null>(null);
  /** 選んだ分野（undefined=全面的に）＋確認窓を出すか */
  const [confirm, setConfirm] = useState<{ id: string; field?: CrisisFieldId } | null>(null);

  const statusOf = (o: (typeof offers)[number]) =>
    o.attempted
      ? t.text.crisisStatusDone
      : o.joined
        ? t.text.crisisStatusJoined
        : t.text.crisisStatusOffered;

  const pending = offers.find((o) => o.joinable || (o.joined && !o.attempted));
  // W-04：届いた打診だけを見せる（クエスト一覧にしない）。
  // 段階の番号・関与の進行度はここにも出さない ―― 打診は人物の言葉として届く
  const invited = offers.filter((o) => o.offered || o.joined || o.attempted);
  // 打診を運ぶ人：その場面にいちばん備えを積んだ勢力の使い（core が決める）
  const speaker =
    pending !== undefined ? (crisisOfferSpeaker(state, cfg.crisis, pending.def.id) ?? null) : null;

  // ---- 打診に応える（行動は消費しない。応えなくても世界は進む） ----
  const join = (id: string) => {
    act({ type: "crisisFinaleJoin", id });
  };

  // ---- 勝負所に臨む：役目に応じた器へ（戦闘 or ミニゲーム）。結果は器が確定する ----
  const attempt = (o: (typeof offers)[number]) => {
    const vessel = attemptVessel(state, o.role, o.def.ref);
    if (vessel.kind === "combat") {
      const enemy = enemyList.find((e) => e.id === vessel.enemyId)!;
      setScreen({ name: "combat", enemy, finale: o.def.id });
      return;
    }
    // ミニゲームの皮には注文の形だけ渡す（品名＝場面名、中身は使わない）
    const order: Order = {
      id: `crisis.${o.def.id}`,
      kind: "eloquence",
      name: o.def.name,
      targetQuality: 50,
      rewardMoney: 0,
    };
    setScreen({ name: "minigame", kind: vessel.minigame, order, finale: o.def.id });
  };

  // ---- 自分で起こす（段階4）：分野を絞るか全面的に → 確認 → step ----
  const leadDef = offers.find((o) => o.def.id === leadTarget)?.def;
  const doLead = (id: string, field?: CrisisFieldId) => {
    // 率いた決着は定型の出来事行（finale.hero/heroFail・end.*）を出す（eventLines 任せ）
    act(
      { type: "crisisLead", id, ...(field !== undefined ? { field } : {}) },
      { format: (ev) => eventLines(ev, state) },
    );
    setConfirm(null);
    setLeadTarget(null);
    setScreen({ name: "menu" });
  };

  const entries: MenuEntry[] = [
    // 打診に応える：届いた分だけ。受けなくてもよい ―― 応えない選択肢は「戻る」
    ...(pending?.joinable === true
      ? [
          {
            id: `crisis-join-${pending.def.id}`,
            label: tpl(t.text.crisisJoinOption, { name: pending.def.name }),
            gold: true,
            onPick: () => join(pending.def.id),
          } satisfies MenuEntry,
        ]
      : []),
    // 勝負所に臨む：請けた場面に限り1回
    ...(pending !== undefined && pending.joined && !pending.attempted
      ? [
          {
            id: `crisis-attempt-${pending.def.id}`,
            label: tpl(t.text.crisisAttemptOption, { name: pending.def.name }),
            primary: true,
            onPick: () => attempt(pending),
          } satisfies MenuEntry,
        ]
      : []),
    // 自分で起こす：関与が段階4（率いた）のとき未決着の場面それぞれに
    ...offers
      .filter((o) => o.leadable)
      .map((o): MenuEntry => ({
        id: `crisis-lead-${o.def.id}`,
        label: tpl(t.text.crisisLeadOption, { name: o.def.name }),
        onPick: () => setLeadTarget(o.def.id),
      })),
    { kind: "divider" },
    { id: "crisis-back", label: t.text.crisisBack, onPick: () => setScreen({ name: "menu" }) },
  ];

  // 分野の選び方（多フィールドの場面だけ。1分野なら直接確認へ）
  const leadFieldEntries: MenuEntry[] =
    leadDef !== undefined
      ? [
          { kind: "header" as const, text: t.text.crisisLeadFieldPrompt },
          {
            id: "lead-all",
            label: t.text.crisisLeadFieldAll,
            onPick: () => setConfirm({ id: leadDef.id }),
          },
          ...leadDef.fields.map((f): MenuEntry => ({
            id: `lead-field-${f}`,
            label: t.display.crisisFieldNames[f] ?? f,
            sub: "分野に絞る",
            onPick: () => setConfirm({ id: leadDef.id, field: f }),
          })),
          { kind: "divider" as const },
          {
            id: "lead-cancel",
            label: t.text.crisisBack,
            onPick: () => setLeadTarget(null),
          },
        ]
      : [];

  return (
    <div data-testid="screen-crisis" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 300, top: 140, width: 680 }), padding: "16px 4px 12px" }}
        corners={["tl", "br"]}
      >
        <div style={{ margin: "2px 14px 4px" }}>
          <Kicker text="CRISIS" />
          <div
            style={{ fontFamily: theme.font.mincho, fontSize: 24, fontWeight: 800, color: W.hi }}
          >
            {t.text.crisisSceneHeader.replace(/^[─\s]+|[─\s]+$/g, "")}
          </div>
          {/* あなたの役目だけを伝える（関与の段階・進行度の数字は出さない。W-04） */}
          {pending !== undefined && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: W.text }}>
              {tpl(t.text.crisisSceneRole, {
                role: t.display.crisisRoleNames[pending.role] ?? pending.role,
              })}
            </p>
          )}
        </div>
        {/* 打診は人物からの言葉として届く（W-04、docs/08 §6：会話の窓で持ちかける） */}
        {pending?.joinable === true && (
          <DialogueBox
            speaker={tpl(narration.crisis.offer.speaker, {
              faction: speaker ?? "街",
            })}
            style={{ margin: "6px 16px 10px" }}
            testId="crisis-offer-dialogue"
          >
            <p style={{ margin: 0, fontSize: 17 }}>
              {tpl(narration.crisis.offer.line, { name: pending.def.name })}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: W.dim }}>
              {narration.crisis.offer.hint}
            </p>
          </DialogueBox>
        )}
        <div style={{ margin: "8px 16px", borderTop: `1px solid ${W.frame}` }}>
          {invited.map((o) => (
            <p
              key={o.def.id}
              data-testid={`crisis-finale-${o.def.id}`}
              style={{ margin: "8px 0", fontSize: 15, color: W.text }}
            >
              {tpl(t.text.crisisSceneLine, {
                name: o.def.name,
                status: statusOf(o),
                seasons: o.remainingBoundaries,
              }).replace(/^\s+/, "")}
            </p>
          ))}
        </div>
        {leadTarget === null ? (
          <CommandMenu entries={entries} onBack={() => setScreen({ name: "menu" })} />
        ) : (
          <CommandMenu entries={leadFieldEntries} onBack={() => setLeadTarget(null)} />
        )}
      </WorldFrame>
      {confirm !== null && (
        <div style={{ ...pos({ left: 360, top: 260, width: 560 }), zIndex: 20 }}>
          <ConfirmWindow
            title="自分で起こす"
            body={tpl(t.text.crisisLeadConfirm.replace(/（y\/N）$/, ""), {
              name: offers.find((o) => o.def.id === confirm.id)?.def.name ?? confirm.id,
            })}
            yes="起こす"
            no="やめる"
            onYes={() => doLead(confirm.id, confirm.field)}
            onNo={() => setConfirm(null)}
          />
        </div>
      )}
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
export {};
