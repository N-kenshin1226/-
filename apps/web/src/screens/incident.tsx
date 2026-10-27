/**
 * 日々の出来事（F-05）：行動の合間に届く会話の挿話。
 * ここは「届いたものへの応え方」を置く窓であって、出来事をクエスト一覧としては
 * 見せない ―― 届いていなければメニューに項目自体が出ず、先送りしても不利益はない。
 * 応えは会話の一瞬（行動を消費しない）。勝負所の行事とは別物でミニゲームは出さない
 * ―― 選んだ途端に結末の一文が返るだけ（結果の抽選は core、ここでは表示だけ）
 */
import { useEffect, useState } from "react";
import { incidentOutcome, type GameState } from "@trace/core";
import { cfg, incidentPendingChoice, incidentSpeaker, t, type IncidentOffer } from "../game.js";
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

/** 話し手の名札（街の住人は「役職 名」、話し手なしの出来事は「街」） */
function speakerName(offer: IncidentOffer, state: GameState): string {
  if (cfg.incidents === undefined) return "街";
  const sp = incidentSpeaker(state, cfg.incidents, offer.def);
  if (sp === undefined) return "街";
  return sp.role !== undefined && sp.role !== "" ? `${sp.role} ${sp.name}` : sp.name;
}

export function IncidentScreen({
  state,
  setScreen,
  act,
  /** 今日先送りにした出来事のid（自動割り込みでうるさくしないための記憶） */
  deferred,
  /** メニューに居るときの自動割り込みなら true —— 先送り済みは窓に出さない */
  auto,
  onDefer,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
  deferred: ReadonlySet<string>;
  auto: boolean;
  onDefer: (id: string) => void;
}) {
  const pending = cfg.incidents !== undefined ? incidentPendingChoice(state, cfg.incidents) : [];
  // 自動割り込みでは「あとにする」とした出来事はその日は再び割り込まない。
  // メニューから開いた窓（auto=false）では先送り済みも含めて全部に応えられる
  const visible = auto ? pending.filter((o) => !deferred.has(o.def.id)) : pending;
  const offer = visible[0];
  /** 応えた直後の結末の文（窓の中で一段見せる。記録には act が既に刻んでいる） */
  const [result, setResult] = useState<string | null>(null);

  // 応えるべき出来事が尽きた（結末も見終わった）らメニューへ帰る
  useEffect(() => {
    if (offer === undefined && result === null) setScreen({ name: "menu" });
  }, [offer, result, setScreen]);

  if (cfg.incidents === undefined) return null;
  if (offer === undefined && result === null) return null;

  /** 選択肢に応える：結末は core の抽選と同じ乱数列から先読みして窓に出し、
      確定は act（incidentChoose）に任せる。結果を読めるよう窓はこの画面に留める */
  const choose = (o: IncidentOffer, choiceId: string) => {
    const choice = o.def.choices.find((c) => c.id === choiceId);
    if (choice === undefined) return;
    const outcome = incidentOutcome(state, o.def, choice);
    const sp = incidentSpeaker(state, cfg.incidents!, o.def);
    const text = sp !== undefined ? outcome.text.replaceAll("{name}", sp.name) : outcome.text;
    act({ type: "incidentChoose", id: o.def.id, choice: choice.id });
    setResult(text);
    if (auto) setScreen({ name: "incident" });
  };

  /** あとにする：その日は再び割り込まない。窓はメニューへ帰る（不利益はない） */
  const defer = (o: IncidentOffer) => {
    onDefer(o.def.id);
    setScreen({ name: "menu" });
  };

  const entries: MenuEntry[] =
    result !== null || offer === undefined
      ? [
          {
            id: "incident-next",
            label: "次へ",
            primary: true,
            onPick: () => setResult(null),
          },
        ]
      : [
          ...offer.def.choices.map((c): MenuEntry => ({
            id: `incident-choice-${c.id}`,
            label: c.label,
            ...(c.hint !== undefined && c.hint !== "" ? { sub: c.hint } : {}),
            onPick: () => choose(offer, c.id),
          })),
          { kind: "divider" },
          {
            id: "incident-defer",
            label: t.text.incidentDefer,
            onPick: () => defer(offer),
          },
        ];

  const speaker = offer !== undefined ? speakerName(offer, state) : "街";
  return (
    <div data-testid="screen-incident" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 300, top: 140, width: 680 }), padding: "16px 4px 12px" }}
        corners={["tl", "br"]}
      >
        <div style={{ margin: "2px 14px 4px" }}>
          <Kicker text="EVENT" />
          <div
            data-testid="incident-name"
            style={{ fontFamily: theme.font.mincho, fontSize: 24, fontWeight: 800, color: W.hi }}
          >
            {offer !== undefined ? `《${offer.def.name}》` : t.text.incidentSceneHeader}
          </div>
        </div>
        {result !== null ? (
          <div style={{ margin: "6px 16px 10px" }}>
            <p
              data-testid="incident-result"
              style={{ margin: 0, fontSize: 17, color: W.text, fontFamily: theme.font.mincho }}
            >
              {result}
            </p>
          </div>
        ) : (
          offer !== undefined && (
            <>
              <div style={{ margin: "6px 16px 4px" }}>
                <p
                  data-testid="incident-text"
                  style={{ margin: 0, fontSize: 15, color: W.text, lineHeight: 1.7 }}
                >
                  {offer.def.text}
                </p>
              </div>
              {/* 話し手のいる出来事は人物の口から届く（docs/03 §2 の会話の窓と同じ形） */}
              {offer.def.say !== undefined && (
                <DialogueBox
                  speaker={speaker}
                  style={{ margin: "6px 16px 10px" }}
                  testId="incident-say"
                >
                  <p style={{ margin: 0, fontSize: 17 }}>{offer.def.say}</p>
                </DialogueBox>
              )}
            </>
          )
        )}
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
