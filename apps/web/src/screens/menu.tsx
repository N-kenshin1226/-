/**
 * メイン画面（UI-01：Main見本）
 *   左：コマンド列（行動／街／眠る）・右：人物カードと技能上位・右下：住人の会話窓
 *   下帯：噂と操作ガイド。行動できるかは canAct（core）だけを見る
 */
import { canAct, describe, isSkillUnlocked, type GameState } from "@trace/core";
import {
  cfg,
  crisisFinaleOffers,
  occasionOffers,
  originList,
  skillList,
  townRumor,
  townVoice,
  windChips,
} from "../game.js";
import {
  CommandMenu,
  DialogueBox,
  HintBar,
  SkillBar,
  WindChip,
  WorldFrame,
  pos,
  skillBandOf,
  useHotkeys,
  type Act,
  type MenuEntry,
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

export function MenuScreen({
  state,
  setScreen,
  act,
  log,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
  log: readonly string[];
}) {
  const canActNow = canAct(state.time, cfg.time);
  const voice = townVoice(state);
  const rumor = townRumor(state);
  const winds = windChips(state);
  useHotkeys({
    s: () => setScreen({ name: "status" }),
    n: () => setScreen({ name: "news", events: [] }),
  });

  // 人物カードに出す技能：値上位3件（見本はよく使う3技を並べている）
  const top3 = skillList
    .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
    .map((s) => ({ def: s, st: state.player.skills[s.id]! }))
    .sort((a, b) => b.st.value - a.st.value)
    .slice(0, 3);

  const entries: MenuEntry[] = [
    { kind: "header", text: "ACTION" },
    {
      id: "menu-work",
      label: "仕事",
      sub: "注文に応える",
      disabled: !canActNow,
      onPick: () => setScreen({ name: "work" }),
    },
    {
      id: "menu-train",
      label: "鍛錬",
      sub: "技を磨く",
      disabled: !canActNow,
      onPick: () => setScreen({ name: "train" }),
    },
    {
      id: "menu-hunt",
      label: "狩りに出る",
      sub: "街の外",
      disabled: !canActNow,
      onPick: () => setScreen({ name: "hunt" }),
    },
    {
      id: "menu-abyss",
      label: "深層に潜る",
      sub: "灯りが尽きるまで",
      disabled: !canActNow,
      onPick: () => setScreen({ name: "abyss" }),
    },
    // 決着の場面（W-03、docs/08 §6）：打診が届いている・請けている・率いられる
    // ときだけ項目が出る。届いていなければ世界の危機は日常の裏で進むだけ
    ...(canActNow &&
    crisisFinaleOffers(state, cfg.crisis).some(
      (o) => o.joinable || (o.joined && !o.attempted) || o.leadable,
    )
      ? [
          {
            id: "menu-crisis",
            label: "決着の場面",
            sub: "世界からの打診",
            gold: true,
            onPick: () => setScreen({ name: "crisis" }),
          } satisfies MenuEntry,
        ]
      : []),
    // 勝負所の行事（X-10、docs/03 §2）：届いた打診がある日だけ項目が出る。
    // 届いていなければ街の行事は日常の裏で過ぎるだけ（クエストボードにしない）
    ...(canActNow &&
    cfg.occasions !== undefined &&
    occasionOffers(state, cfg.occasions).some((o) => !o.attempted)
      ? [
          {
            id: "menu-occasion",
            label: "勝負所の行事",
            sub: "届いた打診",
            gold: true,
            onPick: () => setScreen({ name: "occasion" }),
          } satisfies MenuEntry,
        ]
      : []),
    { kind: "divider" },
    { kind: "header", text: "TOWN" },
    {
      id: "menu-mentor",
      label: "師匠を訪ねる",
      onPick: () => setScreen({ name: "mentor" }),
    },
    {
      id: "menu-book",
      label: "書店",
      onPick: () => setScreen({ name: "book" }),
    },
    {
      id: "menu-lore",
      label: "見聞録",
      onPick: () => setScreen({ name: "lore" }),
    },
    {
      id: "menu-society",
      label: "目標と認定",
      onPick: () => setScreen({ name: "society" }),
    },
    {
      id: "menu-records",
      label: "街の記録",
      onPick: () => setScreen({ name: "records" }),
    },
    { kind: "divider" },
    {
      id: "menu-sleep",
      label: "宿で眠る",
      sub: "一日を終える",
      onPick: () => setScreen({ name: "sleep" }),
    },
    {
      id: "menu-rest",
      label: "家で休む",
      sub: "無料",
      onPick: () => act({ type: "rest" }, { atHome: true }),
    },
    { kind: "divider" },
    {
      id: "menu-status",
      label: "能力を見る",
      sub: "S",
      onPick: () => setScreen({ name: "status" }),
    },
    {
      id: "menu-news",
      label: "今朝の新聞",
      sub: "N",
      onPick: () => setScreen({ name: "news", events: [] }),
    },
    {
      id: "menu-settings",
      label: "環境設定",
      sub: "音と演出",
      onPick: () => setScreen({ name: "settings" }),
    },
    {
      id: "menu-retire",
      label: "引退する",
      onPick: () => setScreen({ name: "retire" }),
    },
    {
      id: "menu-reset",
      label: "記録を消す",
      danger: true,
      onPick: () => setScreen({ name: "reset" }),
    },
  ];

  return (
    <div data-testid="menu" className="scene">
      {/* 左のコマンド窓（見本：left28 top132 w300）。項目は窓の内側に収めて縦にスクロールする */}
      <WorldFrame style={{ ...pos({ left: 28, top: 132, width: 320 }), padding: "14px 6px" }}>
        <div className="scroll" style={{ maxHeight: 492 }}>
          <CommandMenu testId="menu-commands" entries={entries} />
        </div>
      </WorldFrame>

      {/* あなたへの風：窓の右上に縦に並ぶ札（見本は right28 top112 右寄せ） */}
      {winds.length > 0 && (
        <div
          style={{
            ...pos({ right: 28, top: 112 }),
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {winds.map((w, i) => (
            <WindChip key={i} direction={w.direction} label={w.label} />
          ))}
        </div>
      )}

      {/* 右の人物カード（見本：right28 top196 w270） */}
      <WorldFrame
        style={{ ...pos({ right: 28, top: 196, width: 300 }), padding: "16px 18px" }}
        corners={["tl", "br"]}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {/* 人物の小影絵（装飾。名札の隣の面取り枠） */}
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              border: `2px solid ${W.frame}`,
              boxShadow: `inset 0 0 0 2px ${W.ink}`,
              background: "#2a2433",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <svg width="46" height="48" viewBox="0 0 46 48">
              <circle cx="23" cy="17" r="10" fill="#4a4258" />
              <path d="M3 48c2-12 10-18 20-18s18 6 20 18z" fill="#4a4258" />
            </svg>
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: theme.font.mincho,
                fontSize: 22,
                fontWeight: 700,
                color: W.hi,
              }}
            >
              {state.player.name}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: W.faint }}>
              {describe(state.time, cfg.time).age}歳 ・{" "}
              {originList.find((o) => o.id === state.player.origin)?.name ?? state.player.origin}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {top3.map(({ def, st }) => (
            <div key={def.id}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: theme.font.mincho, fontSize: 15 }}>{def.name}</span>
                <span style={{ fontSize: 11, color: W.faint }}>{skillBandOf(st.value).name}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: theme.font.en,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#f3dfa8",
                  }}
                >
                  {st.value.toFixed(1)}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <SkillBar value={st.value} pending={st.pending} />
              </div>
            </div>
          ))}
        </div>
      </WorldFrame>

      {/* 会話窓：住人の一言＋記録の末尾（見本：left360 right28 bottom58 h132） */}
      <DialogueBox
        speaker={`${voice.role} ${voice.name}`}
        style={pos({ left: 380, right: 28, bottom: 58, height: 132 })}
      >
        {log.length > 0 && (
          <div
            data-testid="log"
            style={{
              fontSize: 12,
              color: W.dim,
              lineHeight: 1.6,
              maxHeight: 40,
              overflow: "hidden",
            }}
          >
            {/* 見た目は末尾2行ぶん。DOMには記録の末尾を多めに残す（e2e・読み上げ用） */}
            {log.slice(-10).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        <div style={{ fontFamily: theme.font.mincho, fontSize: 20, color: "#f4ecd8" }}>
          {voice.text}
        </div>
      </DialogueBox>

      {/* 下帯：噂（見本の左端） */}
      <div
        style={{
          ...pos({ left: 28, bottom: 16 }),
          fontFamily: theme.font.mincho,
          fontSize: 13,
          color: W.dim,
          maxWidth: 620,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {rumor}
      </div>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["S", "ステータス"],
          ["N", "新聞"],
        ]}
      />
    </div>
  );
}
export {};
