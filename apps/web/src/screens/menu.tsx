/**
 * メイン画面＝街の見取り図（P-01、docs/03 §2：場所と移動）
 *   左：見取り図の窓（街の場所を↑↓・マウスで選ぶ）・右：人物カードと技能上位
 *   下帯：噂と操作ガイド。行動できるかは canAct（core）だけを見る
 */
import { useMemo, useRef, useState } from "react";
import { canAct, describe, isSkillUnlocked, type GameState } from "@trace/core";
import {
  cfg,
  cfgFor,
  crisisFinaleOffers,
  incidentPendingChoice,
  occasionOffers,
  originList,
  skillList,
  t,
  townName,
  townOf,
  townPlacesIn,
  townRumor,
  townVoice,
  tpl,
  windChips,
} from "../game.js";
import type { PlaceLike } from "../world.js";
import { playSfx } from "../fx/sound.js";
import {
  DialogueBox,
  HintBar,
  Kicker,
  SkillBar,
  WindChip,
  WorldFrame,
  pos,
  skillBandOf,
  useHotkeys,
  type Act,
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 見取り図の印の並び（↑↓ の巡回順）：上から下へ、同じ高さなら左から右へ */
function mapOrder(state: GameState, town: string): PlaceLike[] {
  return [...townPlacesIn(state, town)].sort(
    (a, b) => (a.pos?.[1] ?? 0) - (b.pos?.[1] ?? 0) || (a.pos?.[0] ?? 0) - (b.pos?.[0] ?? 0),
  );
}

/** 場所に届き物の印（P-01）：出来事・打診はその届く場所の印で光らせる */
function placePip(state: GameState, place: PlaceLike): boolean {
  // 話し手の名簿はその世界のもの（G-01：生成地方は生成の住人が差し込まれる）
  const c = cfgFor(state);
  const types = new Set(place.actions.map((a) => a.type));
  if (
    types.has("incident") &&
    c.incidents !== undefined &&
    incidentPendingChoice(state, c.incidents).length > 0
  ) {
    return true;
  }
  if (
    types.has("crisis") &&
    canAct(state.time, c.time) &&
    crisisFinaleOffers(state, c.crisis).some(
      (o) => o.joinable || (o.joined && !o.attempted) || o.leadable,
    )
  ) {
    return true;
  }
  if (
    types.has("occasion") &&
    canAct(state.time, c.time) &&
    c.occasions !== undefined &&
    occasionOffers(state, c.occasions).some((o) => !o.attempted)
  ) {
    return true;
  }
  return false;
}

export function MenuScreen({
  state,
  setScreen,
  log,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
  log: readonly string[];
}) {
  // 見取り図は今いる町のものだけ（P-02：町ごとに別の街。G-01：生成地方も同じ仕組み）
  const town = townOf(state);
  const marks = useMemo(() => mapOrder(state, town), [state, town]);
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const enter = (id: string) => setScreen({ name: "place", place: id });
  useHotkeys({
    arrowup: () => {
      const n = marksRef.current.length;
      if (n > 0) {
        setFocus((((focusRef.current - 1) % n) + n) % n);
        playSfx("cursor");
      }
    },
    arrowdown: () => {
      const n = marksRef.current.length;
      if (n > 0) {
        setFocus((focusRef.current + 1) % n);
        playSfx("cursor");
      }
    },
    enter: () => {
      const m = marksRef.current[focusRef.current];
      // 向かう場所の音（扉・足音）は遷移側（go）が鳴らすのでここではカーソルだけ
      if (m !== undefined) enter(m.id);
    },
    s: () => {
      playSfx("confirm");
      setScreen({ name: "status" });
    },
    n: () => {
      playSfx("confirm");
      setScreen({ name: "news", events: [] });
    },
    // 地方の地図（G-02）：町・道・霧の見取り図を開く
    m: () => {
      playSfx("confirm");
      setScreen({ name: "map" });
    },
  });

  const voice = townVoice(state);
  const rumor = townRumor(state);
  const winds = windChips(state);
  const focused = marks[focus];

  // 人物カードに出す技能：値上位3件（見本はよく使う3技を並べている）
  const top3 = skillList
    .filter((s) => isSkillUnlocked(state, { id: s.id, condition: s.unlock }))
    .map((s) => ({ def: s, st: state.player.skills[s.id]! }))
    .sort((a, b) => b.st.value - a.st.value)
    .slice(0, 3);

  return (
    <div data-testid="menu" className="scene">
      {/* 見取り図の窓（P-01）：街の見取り図と場所の印。↑↓・マウスで選ぶ */}
      <WorldFrame
        style={{ ...pos({ left: 28, top: 104, width: 800, bottom: 210 }), padding: "12px 16px" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
          <div>
            <Kicker text="MAP" />
            <div
              style={{
                fontFamily: theme.font.mincho,
                fontSize: 22,
                fontWeight: 800,
                color: W.hi,
              }}
            >
              {tpl(t.text.mapTitle, { town: townName(state, town) })}
            </div>
          </div>
          <div data-testid="map-pick" style={{ fontSize: 13, color: W.dim }}>
            {focused !== undefined ? `${focused.name} ―― ${focused.desc}` : t.text.mapPick}
          </div>
        </div>
        {/* 街の見取り図：壁の輪郭・道・区画の上に場所の印が並ぶ */}
        <div style={{ position: "relative", height: "calc(100% - 62px)" }}>
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 800 380"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect x="0" y="0" width="800" height="380" fill="#0b0a14" />
            {/* 外の野（見取り図の外側の余白の気配） */}
            <rect x="0" y="0" width="800" height="380" fill="none" />
            {/* 城壁：右下に門口の開いた街の輪郭 */}
            <path
              d="M40 30 H700 Q750 30 750 80 V250 Q750 300 700 300 H620 M560 300 H90 Q40 300 40 250 V80 Q40 30 90 30 Z"
              fill="none"
              stroke="#3a3450"
              strokeWidth="3"
            />
            {/* 街路：中央の広場（市場）から放射に伸びる道 */}
            <g stroke="#2a2440" strokeWidth="4" fill="none">
              <path d="M448 152 C400 180 330 210 296 244" />
              <path d="M448 152 C480 210 510 250 546 297" />
              <path d="M448 152 C360 150 300 160 250 190" />
              <path d="M448 152 C520 140 590 120 658 92" />
              <path d="M448 152 C420 240 380 280 330 310" />
              <path d="M448 152 C540 200 620 260 700 330" />
              <path d="M448 152 C300 130 160 150 82 282" />
              <path d="M448 152 C430 110 390 90 292 106" />
            </g>
            {/* 区画：家の塊の気配 */}
            <g fill="#161226">
              <rect x="180" y="70" width="60" height="40" />
              <rect x="520" y="60" width="70" height="44" />
              <rect x="120" y="180" width="56" height="44" />
              <rect x="230" y="260" width="64" height="42" />
              <rect x="480" y="230" width="56" height="40" />
              <rect x="600" y="180" width="60" height="44" />
              <rect x="660" y="110" width="52" height="40" />
              <rect x="90" y="120" width="48" height="36" />
            </g>
            {/* 中央の広場 */}
            <ellipse
              cx="448"
              cy="152"
              rx="36"
              ry="20"
              fill="#1c1730"
              stroke="#3a3450"
              strokeWidth="2"
            />
            {/* 門口（右下）：壁の切れ目から外へ続く道 */}
            <path d="M575 300 L640 340" stroke="#2a2440" strokeWidth="5" />
            <path d="M640 340 L706 366" stroke="#3a3450" strokeWidth="3" />
          </svg>
          {marks.map((m, i) => (
            <button
              key={m.id}
              type="button"
              data-testid={`menu-place-${m.id}`}
              className={`map-mark${i === focus ? " on" : ""}`}
              style={{ left: `${m.pos?.[0] ?? 0}%`, top: `${m.pos?.[1] ?? 0}%` }}
              onMouseEnter={() => setFocus(i)}
              onClick={() => enter(m.id)}
            >
              {placePip(state, m) && <span className="pip" />}
              <span className="diamond" />
              <span className="tag">{m.name}</span>
            </button>
          ))}
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
          ["↑↓", "場所を選ぶ"],
          ["Enter", "向かう"],
          ["M", "地方の地図"],
          ["S", "ステータス"],
          ["N", "新聞"],
        ]}
      />
    </div>
  );
}
export {};
