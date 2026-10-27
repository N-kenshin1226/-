/**
 * 日々の営みの窓（P-02「行動の種類を増やす」、docs/03 §2）
 *   市場の売り買い・料理・賭け事・人との時間・依頼掲示板・祈り・食事・持ち物棚
 *   と、町と町の間の旅の途中の窓。
 *   値段・抽選・効果はすべて core（step）が持ち、ここでは一覧を並べて
 *   コマンドを送るだけ —— 品揃え・材料・残り日数は content/state から引く
 */
import { useState } from "react";
import { canAct, npcAway, npcGoneReason, type GameState } from "@trace/core";
import { life, voices } from "@trace/content";
import {
  bondOfNow,
  cfg,
  canErrand,
  errandsNow,
  itemCount,
  itemDefs,
  itemName,
  itemPriceNow,
  marketStockNow,
  npcName,
  placeOf,
  t,
  townName,
  townOf,
} from "../game.js";
import {
  CommandMenu,
  HintBar,
  Kicker,
  WorldFrame,
  pos,
  type Act,
  type LifeView,
  type MenuEntry,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 窓の左上の欧文見出し＋和名の行（town.tsx の WinHead と同じ形） */
function WinHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ margin: "2px 14px 10px" }}>
      <Kicker text={kicker} />
      <div
        style={{
          fontFamily: theme.font.mincho,
          fontSize: 24,
          fontWeight: 800,
          color: W.hi,
          letterSpacing: "0.1em",
          marginTop: 2,
        }}
      >
        {title}
      </div>
    </div>
  );
}

/** 営みの窓の骨格：左に世界の窓＋コマンド列（town.tsx の TownWindow と同じ形） */
function LifeWindow({
  kicker,
  title,
  head,
  testId,
  entries,
  onBack,
  width = 640,
}: {
  kicker: string;
  title: string;
  /** 見出しの下に滲ませる一行（店の様子・相場の気配など） */
  head?: string;
  testId: string;
  entries: MenuEntry[];
  onBack: () => void;
  width?: number;
}) {
  return (
    <div data-testid={testId} className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width, bottom: 200 }), padding: "14px 4px" }}
      >
        <WinHead kicker={kicker} title={title} />
        {head !== undefined && (
          <div style={{ margin: "0 16px 8px", fontSize: 13, color: W.dim }}>{head}</div>
        )}
        <div className="scroll" style={{ maxHeight: "74%", overflowY: "auto" }}>
          <CommandMenu
            testId={`${testId}-commands`}
            entries={[
              ...entries,
              { kind: "divider" },
              { id: "back", label: "戻る", onPick: onBack },
            ]}
            onBack={onBack}
          />
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

/** 営みの窓：view で中身を振り分ける（Screen "life" の実体） */
export function LifeScreen({
  state,
  view,
  place,
  act,
  back,
}: {
  state: GameState;
  view: LifeView;
  /** 開いた場所（social の住人の根拠。undefined なら町の人扱い） */
  place?: string;
  act: Act;
  back: () => void;
}) {
  switch (view) {
    case "market":
      return <MarketView state={state} act={act} back={back} />;
    case "cook":
      return <CookView state={state} act={act} back={back} />;
    case "gamble":
      return <GambleView state={state} act={act} back={back} />;
    case "social":
      return <SocialView state={state} place={place} act={act} back={back} />;
    case "board":
      return <BoardView state={state} act={act} back={back} />;
    case "pray":
      return <PrayView state={state} act={act} back={back} />;
    case "eat":
      return <EatView state={state} act={act} back={back} />;
    case "shelf":
      return <ShelfView state={state} back={back} />;
  }
}

// ── 市場売買 ──
// 店に並ぶ品をその町の相場で。売り買いとも行動は消費しない
function MarketView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const town = townOf(state);
  const stock = marketStockNow(state);
  // 売り側：値段の付く持ち物（売値が付かない品は並ばない）
  const selling = Object.entries(state.life.items)
    .filter(([id, n]) => n > 0 && (itemDefs[id]?.price ?? 0) > 0)
    .map(([id]) => id);
  const entries: MenuEntry[] = [
    { kind: "header", text: "買う" },
    ...stock.map((id): MenuEntry => {
      const price = itemPriceNow(state, id, "buy");
      const def = itemDefs[id];
      return {
        id: `market-buy-${id}`,
        label: itemName(id),
        sub: `${price}G${def?.food !== undefined ? "・食べられる" : ""}`,
        disabled: state.player.money < price,
        onPick: () => act({ type: "buyItem", id }),
      };
    }),
    { kind: "header", text: "売る" },
    ...(selling.length === 0
      ? [{ kind: "header" as const, text: "  ――売れる品はない。" }]
      : selling.map((id): MenuEntry => {
          const price = itemPriceNow(state, id, "sell");
          return {
            id: `market-sell-${id}`,
            label: `${itemName(id)} ×${itemCount(state, id)}`,
            sub: `${price}G`,
            onPick: () => act({ type: "sellItem", id }),
          };
        })),
  ];
  return (
    <LifeWindow
      kicker="MARKET"
      title="市場"
      head={`――${townName(town)}の市場。今日の値段で商う。所持金 ${state.player.money}G`}
      testId="screen-market"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 料理 ──
// レシピと材料が揃えば作れる（1行動）。出来は core のまかせ判定
function CookView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canActNow = canAct(state.time, cfg.time);
  const entries: MenuEntry[] = (cfg.life?.recipes ?? []).map((r): MenuEntry => {
    const inputs = Object.entries(r.inputs)
      .map(([id, n]) => `${itemName(id)}${n}（持${itemCount(state, id)}）`)
      .join("・");
    const enough = Object.entries(r.inputs).every(([id, n]) => itemCount(state, id) >= n);
    return {
      id: `cook-${r.id}`,
      label: r.name,
      sub: inputs,
      disabled: !canActNow || !enough,
      onPick: () => act({ type: "cook", recipe: r.id }),
    };
  });
  return (
    <LifeWindow
      kicker="KITCHEN"
      title="料理"
      head="――材料さえ揃えば、竈に火を入れられる。"
      testId="screen-cook"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 賭け事 ──
// 酒場のサイコロ。掛け金の段に限り張れる（1行動）
function GambleView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canActNow = canAct(state.time, cfg.time);
  const entries: MenuEntry[] = (life.gamble.stakes ?? []).map((stake): MenuEntry => {
    return {
      id: `gamble-${stake}`,
      label: `${stake}Gを賭ける`,
      sub: `勝てば${Math.round(stake * life.gamble.winFactor)}G`,
      disabled: !canActNow || state.player.money < stake,
      onPick: () => act({ type: "gamble", stake }),
    };
  });
  return (
    <LifeWindow
      kicker="DICE"
      title="賭け事"
      head={`――卓の骰子が待っている。所持金 ${state.player.money}G`}
      testId="screen-gamble"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 人と過ごす ──
// 話す・飲む・贈る（いずれも1行動）。相手はその場所の住人から選ぶ
function SocialView({
  state,
  place,
  act,
  back,
}: {
  state: GameState;
  place?: string;
  act: Act;
  back: () => void;
}) {
  // 相手 → 過ごし方 →（贈るなら品）の順に潜る（鍛錬画面と同じ段選び）
  const [npc, setNpc] = useState<string | null>(null);
  const [gifting, setGifting] = useState(false);
  const canActNow = canAct(state.time, cfg.time);
  const here = placeOf(place)?.npcs ?? [];
  const residents = voices.npcs.filter((n) => here.includes(n.id));
  // 贈れる品：値段の付く持ち物（贈り物の効きは品の値段から決まる）
  const gifts = Object.entries(state.life.items)
    .filter(([id, n]) => n > 0 && (itemDefs[id]?.price ?? 0) > 0)
    .map(([id]) => id);
  const drink = cfg.life?.social.drink;

  const entries: MenuEntry[] =
    npc === null
      ? residents.map((n): MenuEntry => {
          const gone = npcGoneReason(state, n.id);
          const away =
            cfg.variance !== undefined &&
            npcAway(state.seed, state.time.day, n.id, cfg.variance.npc);
          const bond = bondOfNow(state, n.id);
          return {
            id: `social-${n.id}`,
            label: n.name,
            sub:
              gone !== null
                ? (t.display.npcGoneNames[gone] ?? gone)
                : away
                  ? "今日はいないようだ"
                  : `仲 ${Math.round(bond)}`,
            disabled: gone !== null || !canActNow,
            onPick: () => setNpc(n.id),
          };
        })
      : gifting
        ? [
            { kind: "header" as const, text: `――${npcName(npc)}に何を贈る` },
            ...(gifts.length === 0
              ? [{ kind: "header" as const, text: "  ――贈れる品はない。" }]
              : gifts.map((id): MenuEntry => {
                  return {
                    id: `gift-${id}`,
                    label: `${itemName(id)} ×${itemCount(state, id)}`,
                    sub: `${itemDefs[id]?.price ?? 0}Gの品`,
                    onPick: () => act({ type: "social", npc, way: "gift", item: id }),
                  };
                })),
          ]
        : [
            { kind: "header" as const, text: `――${npcName(npc)}と過ごす` },
            {
              id: "way-talk",
              label: "話す",
              sub: "他愛のない話",
              onPick: () => act({ type: "social", npc, way: "talk" }),
            },
            {
              id: "way-drink",
              label: "酒をおごる",
              sub: `${drink?.cost ?? 0}G`,
              disabled: state.player.money < (drink?.cost ?? 0),
              onPick: () => act({ type: "social", npc, way: "drink" }),
            },
            {
              id: "way-gift",
              label: "贈り物をする",
              sub: "持ち物から1つ",
              onPick: () => setGifting(true),
            },
          ];
  return (
    <LifeWindow
      kicker="COMPANY"
      title="人と過ごす"
      testId="screen-social"
      entries={entries}
      onBack={() => (gifting ? setGifting(false) : npc !== null ? setNpc(null) : back())}
    />
  );
}

// ── 依頼掲示板 ──
// 納品系の日々の頼み。品が揃い、今日の枚数の内なら引き受けられる（1行動）
function BoardView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canActNow = canAct(state.time, cfg.time);
  const list = errandsNow(state);
  const entries: MenuEntry[] =
    list.length === 0
      ? [{ kind: "header", text: "  ――今日の掲示はない。" }]
      : list.map((e): MenuEntry => {
          const need = Object.entries(e.need)
            .map(([id, n]) => `${itemName(id)}${n}（持${itemCount(state, id)}）`)
            .join("・");
          const reward = [
            e.reward.money !== undefined && e.reward.money > 0 ? `${e.reward.money}G` : "",
            e.reward.bond !== undefined ? `${npcName(e.reward.bond.npc)}との仲` : "",
            e.reward.items !== undefined
              ? Object.entries(e.reward.items)
                  .map(([id, n]) => `${itemName(id)}${n}`)
                  .join("・")
              : "",
            e.reward.gain !== undefined ? "経験" : "",
          ]
            .filter((x) => x !== "")
            .join("・");
          return {
            id: `board-${e.id}`,
            label: e.name,
            sub: `${need} → ${reward}`,
            disabled: !canActNow || !canErrand(state, e, cfg.life!),
            onPick: () => act({ type: "errand", id: e.id }),
          };
        });
  return (
    <LifeWindow
      kicker="BOARD"
      title="依頼掲示板"
      head="――日々の頼みが貼られている。"
      testId="screen-board"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 祈る／寄付 ──
// 祈りは1行動。施しを併せて納めると世界の備えにも足せる
function PrayView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const canActNow = canAct(state.time, cfg.time);
  const prayed = state.life.prayedDay === state.time.day;
  const entries: MenuEntry[] = [
    {
      id: "pray",
      label: "祈る",
      sub: prayed ? "今日はもう祈った" : "今夜の眠りが少し深くなる",
      disabled: !canActNow,
      primary: true,
      onPick: () => act({ type: "pray" }),
    },
    ...(life.pray?.alms ?? []).map((n): MenuEntry => ({
      id: `pray-alms-${n}`,
      label: `祈りと施し（${n}G）`,
      disabled: !canActNow || state.player.money < n,
      onPick: () => act({ type: "pray", alms: n }),
    })),
  ];
  return (
    <LifeWindow
      kicker="PRAY"
      title="祈る"
      head="――静けさの中、目を閉じる。"
      testId="screen-pray"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 食事 ──
// 持ち物の食べられる品を1つ食べる（行動は消費しない）。その日の眠りに効く
function EatView({ state, act, back }: { state: GameState; act: Act; back: () => void }) {
  const foods = Object.entries(state.life.items)
    .filter(([id, n]) => n > 0 && itemDefs[id]?.food !== undefined)
    .map(([id]) => id);
  const eaten = state.life.mealDay === state.time.day;
  const entries: MenuEntry[] =
    foods.length === 0
      ? [{ kind: "header", text: "  ――食べられる品はない。" }]
      : foods.map((id): MenuEntry => {
          return {
            id: `eat-${id}`,
            label: `${itemName(id)} ×${itemCount(state, id)}`,
            sub: `食事の質 ${itemDefs[id]?.food ?? 0}`,
            onPick: () => act({ type: "eat", id }),
          };
        });
  return (
    <LifeWindow
      kicker="MEAL"
      title="食事"
      head={eaten ? "――今日はもう食べた。今夜の眠りに効いている" : "――腹を満たしておく。"}
      testId="screen-eat"
      entries={entries}
      onBack={back}
    />
  );
}

// ── 持ち物棚 ──
// 持ち物の一覧（行動は消費しない・一覧は読むだけ）
function ShelfView({ state, back }: { state: GameState; back: () => void }) {
  const owned = Object.entries(state.life.items).filter(([, n]) => n > 0);
  const entries: MenuEntry[] =
    owned.length === 0
      ? [{ kind: "header", text: "  ――棚は空だ。" }]
      : owned.map(([id, n]): MenuEntry => {
          const def = itemDefs[id];
          const kind = def?.kind === "meal" ? "料理" : def?.kind === "material" ? "素材" : "採集物";
          return {
            id: `shelf-${id}`,
            label: `${itemName(id)} ×${n}`,
            sub: `${kind}・値段${def?.price ?? 0}G${def?.food !== undefined ? "・食べられる" : ""}`,
            // 棚は読むだけ —— 食べる・贈る・売るはそれぞれの窓から
            disabled: true,
            onPick: () => {},
          };
        });
  return (
    <LifeWindow
      kicker="SHELF"
      title="持ち物棚"
      head="――家の棚に並ぶ品々。"
      testId="screen-shelf"
      entries={entries}
      onBack={back}
    />
  );
}

/* ── 旅の途中（P-02。町と町の間の街道） ──
 * state.life.journey が立つ間だけ開かれる窓。野営（rest）で日が進み、
 * 残り日数が尽きた朝に隣町へ着く。道中は街道の散策と食事・持ち物だけ */
export function JourneyScreen({
  state,
  act,
  back,
}: {
  state: GameState;
  act: Act;
  /** 旅でないときの戻り先（見取り図） */
  back: () => void;
}) {
  const [sub, setSub] = useState<"eat" | "shelf" | null>(null);
  const j = state.life.journey;
  const canActNow = canAct(state.time, cfg.time);

  // 食べる・持ち物は棚の窓を旅の姿で再利用する（戻るは街道へ）
  if (sub === "eat") {
    return <EatView state={state} act={act} back={() => setSub(null)} />;
  }
  if (sub === "shelf") {
    return <ShelfView state={state} back={() => setSub(null)} />;
  }

  // 旅の途中でない（到着済み・未出発）：戻るだけの窓
  if (j === null) {
    return (
      <LifeWindow
        kicker="ROAD"
        title="旅は終わった"
        testId="screen-journey"
        entries={[]}
        onBack={back}
      />
    );
  }

  const dest = townName(j.to);
  const entries: MenuEntry[] = [
    {
      id: "journey-stroll",
      label: "あたりを歩く",
      sub: "街道の散策",
      disabled: !canActNow,
      onPick: () => act({ type: "stroll" }),
    },
    { id: "journey-eat", label: "食べる", sub: "携えた食料", onPick: () => setSub("eat") },
    { id: "journey-shelf", label: "持ち物を見る", onPick: () => setSub("shelf") },
    { kind: "divider" },
    {
      id: "journey-camp",
      label: "野営する",
      sub: "一日を終える",
      primary: true,
      onPick: () => act({ type: "rest" }),
    },
  ];
  return (
    <div data-testid="screen-journey" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 560, bottom: 200 }), padding: "14px 4px" }}
      >
        <WinHead kicker="ROAD" title={`${dest}への道`} />
        <div style={{ margin: "0 16px 10px", fontSize: 13, color: W.dim }}>
          ――街道を行く。野営はあと{j.daysLeft}日で着く。
        </div>
        <div className="scroll" style={{ maxHeight: "74%", overflowY: "auto" }}>
          <CommandMenu testId="screen-journey-commands" entries={entries} />
        </div>
      </WorldFrame>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
        ]}
      />
    </div>
  );
}
