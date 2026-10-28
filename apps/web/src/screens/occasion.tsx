/**
 * 勝負所の行事（X-10、docs/03 §2）：人物から届いた打診への応えと勝負所。
 * ここは「届いたものへの応え方」を置く窓であって、行事をクエスト一覧としては
 * 見せない ―― 打診が届いていなければメニューに項目自体が出ず、断っても不利益はない。
 * 勝負の器は既存のミニゲームの皮か一騎打ち（判定・採点は core、ここでは振り分けだけ）
 */
import type { GameState } from "@trace/core";
import {
  cfg,
  cfgFor,
  enemyList,
  eventLines,
  occasionOffers,
  occasionSpeaker,
  t,
  tpl,
  type MinigameKind,
  type Order,
} from "../game.js";
import {
  CommandMenu,
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

/** 器に使う技能ID → 遊ぶミニゲームの皮（表示側の対応付けだけ。判定は core） */
const SKILL_TO_MINIGAME: Record<string, MinigameKind> = {
  smithing: "smithing",
  performance: "performance",
  fishing: "fishing",
  mining: "mining",
  appraisal: "appraisal",
  eloquence: "negotiation",
};

export function OccasionScreen({
  state,
  setScreen,
  act,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
}) {
  if (cfg.occasions === undefined) return null;
  // G-01：話し手の名簿はその世界のもの（生成地方は生成の住人が打診を届ける）
  const occs = occasionOffers(state, cfgFor(state).occasions!);

  const statusOf = (o: (typeof occs)[number]) =>
    o.attempted
      ? t.text.occasionStatusDone
      : o.accepted
        ? t.text.occasionStatusAccepted
        : t.text.occasionStatusOffered;

  // ---- 打診に応える（行動は消費しない。応えなくても行事は過ぎていく） ----
  const accept = (id: string) => {
    act({ type: "occasionAccept", id }, { format: (ev) => eventLines(ev, state) });
  };

  // ---- 勝負所に臨む：器に応じた画面へ（戦闘 or ミニゲーム）。結果は器が確定する ----
  const attempt = (o: (typeof occs)[number]) => {
    const vessel = o.def.vessel;
    if (vessel.kind === "combat") {
      const enemy =
        enemyList.find((e) => e.id === vessel.ref) ??
        [...enemyList].sort((a, b) => b.challenge - a.challenge)[0]!;
      setScreen({ name: "combat", enemy, occasion: o.def.id });
      return;
    }
    // ミニゲームの皮には注文の形だけ渡す（品名＝行事名、技能は器の指定）
    const order: Order = {
      id: `occasion.${o.def.id}`,
      kind: vessel.skill,
      name: o.def.name,
      targetQuality: vessel.targetQuality,
      rewardMoney: 0,
    };
    setScreen({
      name: "minigame",
      kind: SKILL_TO_MINIGAME[vessel.skill] ?? "smithing",
      order,
      occasion: o.def.id,
    });
  };

  const entries: MenuEntry[] = [
    // 打診に応える：届いた分だけ。受けなくてもよい ―― 応えない選択肢は「戻る」
    ...occs
      .filter((o) => !o.accepted && !o.attempted)
      .map((o): MenuEntry => ({
        id: `occasion-accept-${o.def.id}`,
        label: tpl(t.text.occasionAcceptOption, { name: o.def.name }),
        gold: true,
        onPick: () => accept(o.def.id),
      })),
    // 勝負所に臨む：請けた行事に限り当日1回
    ...occs
      .filter((o) => o.accepted && !o.attempted)
      .map((o): MenuEntry => ({
        id: `occasion-attempt-${o.def.id}`,
        label: tpl(t.text.occasionAttemptOption, { name: o.def.name }),
        primary: true,
        onPick: () => attempt(o),
      })),
    { kind: "divider" },
    { id: "occasion-back", label: t.text.occasionBack, onPick: () => setScreen({ name: "menu" }) },
  ];

  return (
    <div data-testid="screen-occasion" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 300, top: 140, width: 680 }), padding: "16px 4px 12px" }}
        corners={["tl", "br"]}
      >
        <div style={{ margin: "2px 14px 4px" }}>
          <Kicker text="OCCASION" />
          <div
            style={{ fontFamily: theme.font.mincho, fontSize: 24, fontWeight: 800, color: W.hi }}
          >
            {t.text.occasionSceneHeader.replace(/^[─\s]+|[─\s]+$/g, "")}
          </div>
        </div>
        {/* 打診は人物からの言葉として届く（docs/03 §2：会話の窓で持ちかける。
            クエストボードにはしない ―― 台詞と名札が打診そのもの） */}
        {occs
          .filter((o) => !o.attempted)
          .map((o) => {
            const sp = occasionSpeaker(state, cfgFor(state).occasions!, o.def);
            const speaker =
              sp !== undefined
                ? sp.role !== undefined && sp.role !== ""
                  ? `${sp.role} ${sp.name}`
                  : sp.name
                : "街";
            return (
              <DialogueBox
                key={o.def.id}
                speaker={speaker}
                style={{ margin: "6px 16px 10px" }}
                testId={`occasion-offer-${o.def.id}`}
              >
                <p style={{ margin: 0, fontSize: 17 }}>{o.def.line}</p>
              </DialogueBox>
            );
          })}
        <div style={{ margin: "8px 16px", borderTop: `1px solid ${W.frame}` }}>
          {occs.map((o) => (
            <p
              key={o.def.id}
              data-testid={`occasion-line-${o.def.id}`}
              style={{ margin: "8px 0", fontSize: 15, color: W.text }}
            >
              {tpl(t.text.occasionSceneLine, {
                name: o.def.name,
                status: statusOf(o),
              }).replace(/^\s+/, "")}
            </p>
          ))}
        </div>
        <CommandMenu entries={entries} onBack={() => setScreen({ name: "menu" })} />
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
export {};
