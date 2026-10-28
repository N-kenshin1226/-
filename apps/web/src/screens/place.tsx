/**
 * 場所の画面（P-01、docs/03 §2）：選んだ場所の情景・住人・行動。
 *   左：その場所でできる行動のコマンド列・右：そこに居る人
 *   行動の中身は places.json の actions が持ち、ここでは画面へ写すだけ。
 *   街の外への移動（travel）は行動を消費し、街（門）へ戻るだけなら消費しない
 */
import { canAct, npcGoneReason, type GameState, type WorldPlaceAction } from "@trace/core";
import { voices } from "@trace/content";
import {
  cfg,
  cfgFor,
  crisisFinaleOffers,
  dungeonCampFree,
  dungeonDone,
  dungeonProgress,
  eventLines,
  incidentPendingChoice,
  LAKE_ORDER,
  mentorsAt,
  occasionOffers,
  placeOf,
  placeVoice,
  t,
  tpl,
  townName,
  travelOutCost,
} from "../game.js";
import { gatePlaceOf, isGenWorld, npcListOf, type PlaceLike } from "../world.js";
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

export function PlaceScreen({
  state,
  place,
  setScreen,
  act,
  log,
}: {
  state: GameState;
  /** places.json の場所 id */
  place: string;
  setScreen: (s: Screen) => void;
  act: Act;
  log: readonly string[];
}) {
  const def = placeOf(state, place);
  const canActNow = canAct(state.time, cfg.time);
  if (def === undefined) return null;
  const p = def;
  const voice = placeVoice(state, p);
  // そこに居る人（居た人も退場の印つきで示す —— 人の不在で伝える。X-12。
  // 生成地方では生成の住人の名簿、固定マップは voices.json）
  const genWorldNow = isGenWorld(state);
  const residents = genWorldNow
    ? npcListOf(state).filter((n) => p.npcs.includes(n.id))
    : voices.npcs.filter((n) => p.npcs.includes(n.id));
  // 帰る先：街の場所からは見取り図へ、街の外からはその町の門へ（行き来は行動を消費しない）
  const back: Screen =
    p.kind === "region"
      ? { name: "place", place: gatePlaceOf(state, p) ?? "gate" }
      : { name: "menu" };

  /** 外への移動（行動を消費する）または街への帰還（消費しない） */
  const travel = (to: string) => {
    const dest = placeOf(state, to);
    if (dest === undefined) return;
    if (dest.kind === "region") {
      act(
        { type: "travel", to },
        {
          format: (ev) => [tpl(t.text.travelLine, { name: dest.name }), ...eventLines(ev, state)],
        },
      );
    }
    setScreen({ name: "place", place: to });
  };

  const entries: MenuEntry[] = [
    ...p.actions.flatMap((a): MenuEntry[] =>
      actionEntries(a, p, state, canActNow, setScreen, act, travel),
    ),
    { kind: "divider" },
    {
      id: "place-back",
      label:
        p.kind === "region" ? `${t.text.travelReturn}（${t.text.placeBack}）` : t.text.placeBack,
      onPick: () => setScreen(back),
    },
  ];

  return (
    <div data-testid="place" data-place={p.id} className="scene">
      {/* 左のコマンド窓：場所の名・情景の一行・行動の列 */}
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 560, bottom: 200 }), padding: "14px 4px" }}
      >
        <div style={{ margin: "2px 14px 10px" }}>
          <Kicker text={p.kind === "region" ? "REGION" : "PLACE"} />
          <div
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 24,
              fontWeight: 800,
              color: W.hi,
              marginTop: 2,
            }}
          >
            {p.name}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: W.dim }}>{p.desc}</div>
        </div>
        <div className="scroll" style={{ maxHeight: "74%", overflowY: "auto" }}>
          <CommandMenu testId="place-commands" entries={entries} onBack={() => setScreen(back)} />
        </div>
      </WorldFrame>

      {/* 右の窓：ここに居る人 */}
      {residents.length > 0 && (
        <WorldFrame
          style={{ ...pos({ right: 28, top: 196, width: 300 }), padding: "14px 18px" }}
          corners={["tl", "br"]}
        >
          <Kicker text={t.text.placeHere} />
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {residents.map((n) => {
              const gone = npcGoneReason(state, n.id);
              return (
                <div key={n.id} data-testid={`place-npc-${n.id}`}>
                  <div
                    style={{
                      fontFamily: theme.font.mincho,
                      fontSize: 16,
                      color: gone !== null ? W.faint : W.hi,
                    }}
                  >
                    {n.name}
                    {gone !== null && (
                      <span style={{ fontSize: 11, color: W.faint }}>
                        {" "}
                        ―― {t.display.npcGoneNames[gone] ?? gone}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: W.faint }}>{n.role}</div>
                </div>
              );
            })}
          </div>
        </WorldFrame>
      )}

      {/* 会話窓：その場所に居る人の一言（居なければ情景の一行）＋記録の末尾 */}
      <DialogueBox
        speaker={voice !== null ? `${voice.role} ${voice.name}` : p.name}
        style={pos({ left: 620, right: 28, bottom: 58, height: 132 })}
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
            {log.slice(-10).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        <div style={{ fontFamily: theme.font.mincho, fontSize: 20, color: "#f4ecd8" }}>
          {voice !== null ? voice.text : p.desc}
        </div>
      </DialogueBox>

      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", p.kind === "region" ? "街へ戻る" : "見取り図へ"],
        ]}
      />
    </div>
  );
}

/** 場所の行動 → コマンド列の項目（P-01。中身は places.json / 生成場所の actions） */
function actionEntries(
  a: WorldPlaceAction,
  place: PlaceLike,
  state: GameState,
  canActNow: boolean,
  setScreen: (s: Screen) => void,
  act: Act,
  travel: (to: string) => void,
): MenuEntry[] {
  switch (a.type) {
    case "work":
      return [
        {
          id: "place-work",
          label: "仕事",
          sub: "届いている注文",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "work", place: place.id }),
        },
      ];
    case "train":
      return [
        {
          id: "place-train",
          label: "鍛錬",
          sub: "技を磨く",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "train" }),
        },
      ];
    case "hunt":
      return [
        {
          id: "place-hunt",
          label: "獲物を探す",
          sub: "狩り",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "hunt", place: place.id }),
        },
      ];
    case "fish":
      return [
        {
          id: "place-fish",
          label: "釣りをする",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "workMode", order: LAKE_ORDER, place: place.id }),
        },
      ];
    case "abyss":
      return [
        {
          id: "place-abyss",
          label: "深層に潜る",
          sub: "灯りが尽きるまで",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "abyss" }),
        },
      ];
    case "dungeon": {
      // 有限迷宮（G-03）：潜ると部屋を抜く探索の画面へ。1回の潜りは
      // diveCost 行動（step の dungeon コマンドと同じ判定）。野営明けは無償
      const free = dungeonCampFree(state, place.id);
      const cost = cfg.dungeons?.diveCost ?? 1;
      const afford = free || state.time.action + cost <= cfg.time.actionsPerDay;
      return [
        {
          id: "place-dungeon",
          label: "迷宮に潜る",
          sub: free
            ? "野営明け ―― 行動を使わず潜れる"
            : dungeonDone(state, place.id)
              ? t.text.recordsDungeonCleared
              : "灯りが尽きるまで",
          disabled: !afford,
          gold: !dungeonDone(state, place.id) && dungeonProgress(state, place.id).cleared > 0,
          onPick: () => setScreen({ name: "dungeon", place: place.id }),
        },
      ];
    }
    case "arms":
      // 武器屋（K-01）：武器の売り買いと持ち替え。立ち寄るだけなら行動は消費しない
      // 武技の構え（K-02）：ここで戦闘技・パッシブ・持ち替え武器を組み替える
      return [
        { id: "place-arms", label: "武器を見る", onPick: () => setScreen({ name: "arms" }) },
        {
          id: "place-build",
          label: "技の構えを整える",
          sub: "覚えた技を構えに仕込む",
          onPick: () => setScreen({ name: "build" }),
        },
      ];
    case "book":
      return [{ id: "place-book", label: "書店", onPick: () => setScreen({ name: "book" }) }];
    case "news":
      return [
        {
          id: "place-news",
          label: "今朝の新聞",
          sub: "届いた朝刊",
          onPick: () => setScreen({ name: "news", events: [] }),
        },
      ];
    case "lore":
      return [{ id: "place-lore", label: "見聞録", onPick: () => setScreen({ name: "lore" }) }];
    case "society":
      return [
        { id: "place-society", label: "目標と認定", onPick: () => setScreen({ name: "society" }) },
      ];
    case "records":
      return [
        { id: "place-records", label: "街の記録", onPick: () => setScreen({ name: "records" }) },
      ];
    case "mentor": {
      const here = mentorsAt(state, place);
      return [
        {
          id: "place-mentor",
          label: "師匠を訪ねる",
          ...(here.length > 0 ? { sub: here.map((m) => m.name).join("・") } : {}),
          onPick: () => setScreen({ name: "mentor", place: place.id }),
        },
      ];
    }
    case "sleep":
      return [
        {
          id: "place-sleep",
          label: "宿で眠る",
          sub: "一日を終える",
          primary: true,
          onPick: () => setScreen({ name: "sleep" }),
        },
      ];
    case "rest":
      return [
        {
          id: "place-rest",
          label: "家で休む",
          sub: "無料",
          onPick: () => act({ type: "rest" }, { atHome: true }),
        },
      ];
    case "status":
      return [
        {
          id: "place-status",
          label: "能力を見る",
          sub: "鏡の前で",
          onPick: () => setScreen({ name: "status" }),
        },
      ];
    case "settings":
      return [
        { id: "place-settings", label: "環境設定", onPick: () => setScreen({ name: "settings" }) },
      ];
    case "incident":
      // 届いた出来事（F-05）：応えを待つものがある日だけ項目が出る。
      // 話し手の名簿はその世界のもの（G-01）
      return cfg.incidents !== undefined &&
        incidentPendingChoice(state, cfgFor(state).incidents!).length > 0
        ? [
            {
              id: "place-incident",
              label: "届いた出来事",
              sub: "応えを待つ声",
              gold: true,
              onPick: () => setScreen({ name: "incident" }),
            },
          ]
        : [];
    case "crisis":
      // 決着の場面（W-03）：打診が届いている・請けている・率いられるときだけ出る
      return canActNow &&
        crisisFinaleOffers(state, cfg.crisis).some(
          (o) => o.joinable || (o.joined && !o.attempted) || o.leadable,
        )
        ? [
            {
              id: "place-crisis",
              label: "決着の場面",
              sub: "世界からの打診",
              gold: true,
              onPick: () => setScreen({ name: "crisis" }),
            },
          ]
        : [];
    case "occasion":
      // 勝負所の行事（X-10）：届いた打診がある日だけ出る
      return canActNow &&
        cfg.occasions !== undefined &&
        occasionOffers(state, cfgFor(state).occasions!).some((o) => !o.attempted)
        ? [
            {
              id: "place-occasion",
              label: "勝負所の行事",
              sub: "届いた打診",
              gold: true,
              onPick: () => setScreen({ name: "occasion" }),
            },
          ]
        : [];
    case "retire":
      return [
        { id: "place-retire", label: "引退する", onPick: () => setScreen({ name: "retire" }) },
      ];
    case "reset":
      return [
        {
          id: "place-reset",
          label: "記録を消す",
          danger: true,
          onPick: () => setScreen({ name: "reset" }),
        },
      ];
    // ---- 日々の営み（P-02「行動の種類を増やす」） ----
    case "stroll":
      // 散策：その場所の表から小さな出来事を1件引く（1行動）。
      // place を渡すのは型別の表を引くため（G-01。固定マップでは無視される）
      return [
        {
          id: "place-stroll",
          label: "散策する",
          sub: "歩いてみる",
          disabled: !canActNow,
          onPick: () =>
            act({
              type: "stroll",
              scope: place.kind === "region" ? "region" : "town",
              place: place.id,
            }),
        },
      ];
    case "spot":
      // 地点への立ち寄り（G-01）：地域の中の小さな場所の出来事を1件引く（1行動）
      return [
        {
          id: `place-spot-${a.spot}`,
          label: a.label ?? "立ち寄る",
          sub: "この先の地点",
          disabled: !canActNow || a.spot === undefined,
          onPick: () => {
            if (a.spot !== undefined) act({ type: "spot", spot: a.spot });
          },
        },
      ];
    case "gather":
      // 採集：その場所の採集表から品を引く（1行動）
      return [
        {
          id: "place-gather",
          label: "採集する",
          sub: "取れるものを探す",
          disabled: !canActNow,
          onPick: () => act({ type: "gather", place: place.id }),
        },
      ];
    case "market":
      // 市場：売り買いは行動を消費しない
      return [
        {
          id: "place-market",
          label: "市場で商う",
          sub: "品物の売り買い",
          onPick: () => setScreen({ name: "life", view: "market", place: place.id }),
        },
      ];
    case "cook":
      return [
        {
          id: "place-cook",
          label: "料理する",
          sub: "材料から作る",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "life", view: "cook", place: place.id }),
        },
      ];
    case "magic":
      // 魔法（M-01）：生活魔法の使用と武器への付与。
      // まだ何も覚えていない世界では窓を出さない（覚えてから意味がある）
      return Object.keys(state.player.arts).some((id) => cfg.arts?.defs[id]?.spell !== undefined)
        ? [
            {
              id: "place-magic",
              label: "魔法を整える",
              sub: "生活魔法と付与",
              disabled: !canActNow,
              onPick: () => setScreen({ name: "life", view: "spells", place: place.id }),
            },
          ]
        : [];
    case "gamble":
      return [
        {
          id: "place-gamble",
          label: "賭け事",
          sub: "サイコロの卓",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "life", view: "gamble", place: place.id }),
        },
      ];
    case "social":
      return [
        {
          id: "place-social",
          label: "人と過ごす",
          sub: "話す・飲む・贈る",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "life", view: "social", place: place.id }),
        },
      ];
    case "board":
      return [
        {
          id: "place-board",
          label: "依頼掲示板",
          sub: "日々の頼み",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "life", view: "board", place: place.id }),
        },
      ];
    case "pray":
      return [
        {
          id: "place-pray",
          label: "祈る",
          sub: "静けさの中で",
          disabled: !canActNow,
          onPick: () => setScreen({ name: "life", view: "pray", place: place.id }),
        },
      ];
    case "eat":
      // 食事：携えた食料を1つ（行動は消費しない）
      return [
        {
          id: "place-eat",
          label: "食事をとる",
          sub: "携えた食料",
          onPick: () => setScreen({ name: "life", view: "eat", place: place.id }),
        },
      ];
    case "shelf":
      return [
        {
          id: "place-shelf",
          label: "持ち物棚",
          sub: "家の棚",
          onPick: () => setScreen({ name: "life", view: "shelf", place: place.id }),
        },
      ];
    case "journey": {
      // 旅（隣町）：数日の野営を経て着く。出発は1行動
      const town = a.to !== undefined ? townName(state, a.to) : "";
      return [
        {
          id: `place-journey-${a.to}`,
          label: `${town}へ旅立つ`,
          sub: "数日の道のり",
          disabled: !canActNow,
          onPick: () => {
            if (a.to === undefined) return;
            act({ type: "journey", to: a.to });
            setScreen({ name: "journey" });
          },
        },
      ];
    }
    case "travel": {
      const dest = placeOf(state, a.to);
      // 街（門）へ戻るだけなら行動を消費しない —— 戻れなくなる日を作らない
      const out = dest !== undefined && dest.kind === "region";
      const cost = out ? travelOutCost() : 0;
      const afford = state.time.action + cost <= cfg.time.actionsPerDay;
      const toGate = a.to === "gate" || (a.to ?? "").endsWith(".gate");
      return [
        {
          id: `place-go-${a.to}`,
          label: toGate ? t.text.travelReturn : `${dest?.name ?? a.to}へ`,
          ...(cost > 0 ? { sub: `行動 ${cost}` } : {}),
          disabled: !afford,
          onPick: () => travel(a.to!),
        },
      ];
    }
    default:
      // 未知の行動（将来の追加や別地図の行動）は出さない
      return [];
  }
}

export {};
