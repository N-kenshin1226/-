/**
 * 有限迷宮（G-03、docs/10_world_generation.md §6）：部屋を抜く探索。
 * 潜りの進行（部屋・灯り・撃破・宝・罠）はこの画面の一時状態が持ち、
 * 「出る／野営する」で step の dungeon コマンドにまとめて畳む（深層と同じ構造）。
 * 迷宮の中身は生成世界から引き直し、進行は counters（dg.rooms.<id>）を読む
 */
import { useEffect, useMemo, useState } from "react";
import {
  combatResult,
  type BodyPart,
  type CombatAction,
  type GameState,
  type LifeOutcome,
} from "@trace/core";
import type { EnemyJson } from "@trace/content";
import { balance } from "@trace/content";
import {
  beginCombat,
  bioLines,
  cfg,
  crisisEnemyChallengeBonus,
  dungeonBossEnemy,
  dungeonLight,
  dungeonOf,
  dungeonProgress,
  dungeonRoomEnemy,
  dungeonRoomEvent,
  dungeonTrapRoll,
  enemyDefOf,
  enemyDisplayName,
  eventLines,
  isBossRoom,
  itemName,
  playCombatTurn,
  roomAt,
  t,
  totalRooms,
  tpl,
  type CombatState,
} from "../game.js";
import { useCombatPlayback } from "../fx/combat.js";
import { setSceneryHint } from "../scenery-hint.js";
import { artEntries, CombatArena, IntentLine, switchEntries, weaponName } from "./hunt.js";
import {
  CellGauge,
  CommandMenu,
  HintBar,
  Kicker,
  WorldFrame,
  pos,
  type Act,
  type MenuEntry,
  type Push,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 潜りの終わり方（step の dungeon コマンドの end と同じ語彙） */
type DiveEnd = "fled" | "light" | "retreat" | "camp" | "cleared" | "died";

/** この潜りの中間状態（コミット時に dungeon コマンドへ畳む） */
interface Dive {
  light: number;
  /** この潜りで抜いた室数（主の間を抜いたら cleared 時に+1 する） */
  rooms: number;
  kills: { enemyId: string; difficulty: number }[];
  loss?: { enemyId: string; difficulty: number };
  boss?: { enemyId: string; difficulty: number; unique?: boolean };
  items: Record<string, number>;
  money: number;
  trapFatigue: number;
  /** この潜りで抜いた出来事の部屋の結末（X-30。dungeon コマンドの events へ） */
  events: LifeOutcome[];
  end: DiveEnd | null;
}

export function DungeonScreen({
  state,
  place,
  act,
  push,
  back,
}: {
  state: GameState;
  /** 迷宮の場所 id（生成世界の dg<連番>） */
  place: string;
  act: Act;
  push: Push;
  back: () => void;
}) {
  const dgn = dungeonOf(state, place);
  const progress = dungeonProgress(state, place);
  /** 潜り開始時の抜いた室数（この潜りの先頭部屋の通し番号） */
  const [start] = useState(() => progress.cleared);
  const [dive, setDive] = useState<Dive>(() => ({
    light: dungeonLight(),
    rooms: 0,
    kills: [],
    items: {},
    money: 0,
    trapFatigue: 0,
    events: [],
    end: null,
  }));
  const [cs, setCs] = useState<CombatState | null>(null);
  const [enemy, setEnemy] = useState<EnemyJson | null>(null);
  const [encKey, setEncKey] = useState("");
  const [bossFight, setBossFight] = useState(false);
  const [weaponPick, setWeaponPick] = useState(false);
  const [artPick, setArtPick] = useState(false);
  // K-02/M-01：潜りを通した使用記録と、部屋をまたいで持ち越す気力・魔力
  const [usesAcc, setUsesAcc] = useState<{ id?: string; skill: string; tags: string[] }[]>([]);
  const [kiLeft, setKiLeft] = useState<number | null>(null);
  const [manaLeft, setManaLeft] = useState<number | null>(null);
  const [seenSpellsAcc, setSeenSpellsAcc] = useState<string[]>([]);
  // X-32：潜り中に負った怪我の部位（部屋をまたいで性能に響き、潜りの後も残る）
  const [injuriesAcc, setInjuriesAcc] = useState<BodyPart[]>([]);
  const playback = useCombatPlayback((ev) => push(`\u3000${ev.text}`));

  // 情景への合図（X-24）：抜いた部屋の通し番号で構図を変え、灯りの減りで霞を深くする
  useEffect(() => {
    if (dive.end !== null) {
      setSceneryHint(undefined);
      return;
    }
    const room = start + dive.rooms;
    const dark = 1 - dive.light / dungeonLight();
    setSceneryHint({ variant: `:${room}`, haze: Math.max(0, dark * 0.45) });
  }, [start, dive.rooms, dive.light, dive.end]);
  // 画面を離れるときは合図を下ろす
  useEffect(() => () => setSceneryHint(undefined), []);

  /** この潜りの遭遇鍵（潜りの番号で分ける —— 同じ部屋の再潜は別の個体） */
  const diveKey = useMemo(
    () => `${state.seed}:${place}:v${(state.counters["dg.dives"] ?? 0) + 1}`,
    [state, place],
  );
  const def = useMemo(
    () => (enemy === null ? null : enemyDefOf(state, enemy, encKey)),
    [state, enemy, encKey],
  );

  // 迷宮が無い・制覇済みは潜らせない（生成世界でだけ出る場所）
  if (dgn === undefined || progress.done) {
    return (
      <div data-testid="screen-dungeon" className="scene">
        <WorldFrame
          style={{ ...pos({ left: 340, top: 200, width: 600 }), padding: "16px 4px 12px" }}
        >
          <div style={{ margin: "0 16px 10px" }}>
            <Kicker text="DUNGEON" />
            <p style={{ fontSize: 14, color: W.dim }}>{t.text.dungeonNoEntry}</p>
          </div>
          <CommandMenu entries={[{ id: "back", label: "戻る", onPick: back }]} onBack={back} />
        </WorldFrame>
      </div>
    );
  }

  const index = start + dive.rooms;
  const bossRoom = isBossRoom(dgn, index);
  const at = bossRoom ? null : roomAt(dgn, index);

  const endLine = (end: DiveEnd) =>
    end === "light"
      ? t.text.dungeonLightOut
      : end === "camp"
        ? t.text.dungeonCamp
        : end === "retreat"
          ? t.text.dungeonRetreat
          : end === "fled"
            ? t.text.combatFled
            : end === "cleared"
              ? tpl(t.text.dungeonConquered, { name: dgn.name })
              : t.text.combatLost;

  /** 部屋を抜いたあとの灯り決済（尽きたらその潜りは閉じる。extra は罠の追加ロス） */
  const spendLight = (cur: Dive, extra = 0): Dive => {
    const light = cur.light - balance.dungeons.roomLightCost - extra;
    if (cur.end === null && light <= 0) return { ...cur, light, end: "light" };
    return { ...cur, light };
  };

  const beginFight = (e: EnemyJson, key: string, boss: boolean) => {
    push(tpl(t.text.combatStart, { name: enemyDisplayName(state, e, key) }));
    setEnemy(e);
    setEncKey(key);
    setBossFight(boss);
    // 気力・魔力は部屋をまたいで持ち越す（深層と同じ扱い）
    setCs(
      beginCombat(
        state,
        e,
        key,
        kiLeft === null && manaLeft === null && injuriesAcc.length === 0
          ? undefined
          : {
              ...state.player,
              ...(kiLeft !== null ? { ki: kiLeft } : {}),
              ...(manaLeft !== null ? { mana: manaLeft } : {}),
              // X-32：潜り中に負った傷は次の部屋でも痛む（世界の傷＋この潜りの新傷）
              injuries: [...state.injuries.map((i) => i.part), ...injuriesAcc],
            },
      ),
    );
    playback.queue([]);
  };

  /** 「先へ進む」：次の部屋を開く（戦闘→戦闘画面へ、罠・宝は即座に解決） */
  const advance = () => {
    if (dive.end !== null || dive.light <= 0) return;
    const i = start + dive.rooms;
    if (isBossRoom(dgn, i)) {
      // 主の間：《称号》で出す。ユニークは「世界に1体」と断りを添える
      const b = dungeonBossEnemy(state, place);
      if (b === undefined) return;
      push(tpl(t.text.dungeonBoss, { name: dgn.name, boss: b.name }));
      if (dgn.boss.unique) push(t.text.dungeonUnique);
      beginFight(b.enemy, `${diveKey}:boss`, true);
      return;
    }
    const here = roomAt(dgn, i);
    if (here === null) return;
    push(tpl(t.text.dungeonFloor, { name: dgn.name, floor: here.floorIndex + 1 }));
    if (here.room.kind === "combat") {
      const r = dungeonRoomEnemy(state, place, i);
      if (r === undefined) return;
      push(tpl(t.text.dungeonRoomCombat, { name: r.enemy.name }));
      beginFight(r.enemy, `${diveKey}:r${i}`, false);
      return;
    }
    if (here.room.kind === "trap") {
      push(t.text.dungeonRoomTrap);
      const rolled = dungeonTrapRoll(state, place, i);
      if (rolled !== undefined) {
        push(`\u3000${rolled.text}`);
        setDive((cur) =>
          spendLight(
            { ...cur, rooms: cur.rooms + 1, trapFatigue: cur.trapFatigue + rolled.fatigue },
            rolled.light,
          ),
        );
      } else {
        setDive((cur) => spendLight({ ...cur, rooms: cur.rooms + 1 }));
      }
      return;
    }
    if (here.room.kind === "event") {
      // 出来事の部屋（X-30）：型の表の結末を潜りの積算へ（コミット時に世界へ畳む）
      push(t.text.dungeonRoomEvent);
      const ev = dungeonRoomEvent(state, place, i);
      if (ev !== undefined) {
        push(`\u3000${ev.outcome.text}`);
        setDive((cur) =>
          spendLight({ ...cur, rooms: cur.rooms + 1, events: [...cur.events, ev.outcome] }),
        );
      } else {
        setDive((cur) => spendLight({ ...cur, rooms: cur.rooms + 1 }));
      }
      return;
    }
    // 宝物の部屋：品と財貨をこの潜りの積算へ
    push(t.text.dungeonRoomTreasure);
    for (const l of here.room.loot) push(`\u3000${itemName(l.item)} ×${l.n}`);
    if (here.room.money > 0)
      push(`\u3000${tpl(t.text.dungeonTreasureMoney, { money: here.room.money })}`);
    setDive((cur) => {
      const items = { ...cur.items };
      for (const l of here.room.loot) items[l.item] = (items[l.item] ?? 0) + l.n;
      return spendLight({
        ...cur,
        rooms: cur.rooms + 1,
        items,
        money: cur.money + here.room.money,
      });
    });
  };

  const doAction = (a: CombatAction) => {
    if (cs === null || cs.done || dive.end !== null || enemy === null) return;
    if (playback.busy) {
      playback.skip();
      return;
    }
    const prevLen = cs.log.length;
    const next = playCombatTurn(cs, a, enemy, state, `${diveKey}:fight`, encKey);
    playback.queue(next.log.slice(prevLen));
    setCs(next);
    const r = combatResult(next);
    const difficulty =
      (def?.challenge ?? enemy.challenge) +
      crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id });
    setDive((cur) => {
      let d = { ...cur, kills: [...cur.kills] };
      if (r.won) {
        if (bossFight) {
          // 主を討った：主の間を抜き、主の宝物を畳んで制覇で閉じる
          const items = { ...d.items };
          for (const l of dgn.bossLoot) items[l.item] = (items[l.item] ?? 0) + l.n;
          d = {
            ...d,
            rooms: d.rooms + 1,
            items,
            money: d.money + dgn.bossMoney,
            boss: {
              enemyId: dgn.boss.enemyId,
              difficulty,
              ...(dgn.boss.unique ? { unique: true } : {}),
            },
            end: "cleared",
          };
        } else {
          d = { ...d, kills: [...d.kills, { enemyId: enemy.id, difficulty }] };
          d = spendLight({ ...d, rooms: d.rooms + 1 });
        }
      } else if (r.died) {
        d = { ...d, loss: { enemyId: enemy.id, difficulty }, end: "died" };
      } else if (r.fled) {
        d = { ...d, loss: { enemyId: enemy.id, difficulty }, end: "fled" };
      } else {
        d = spendLight(d);
      }
      return d;
    });
    // 戦闘が閉じたら（決着どちらでも）使用記録と残りの気力・魔力・見取りを畳む
    if (next.done) {
      setUsesAcc((acc) => [...acc, ...next.uses]);
      setKiLeft(next.playerKi);
      setManaLeft(next.playerMana);
      setSeenSpellsAcc((acc) => [...acc, ...next.seenSpells.filter((x) => !acc.includes(x))]);
      // X-32：この部屋で負った傷は次の部屋の戦闘にも響く
      setInjuriesAcc((acc) => [...acc, ...r.injuries]);
    }
  };

  /** 潜りの途中：引き上げ（戦闘中の離脱は「逃げる」） */
  const retreat = () => {
    push(endLine("retreat"));
    setDive((cur) => ({ ...cur, end: "retreat" }));
    setCs(null);
    setEnemy(null);
  };

  /** 潜りの途中：野営（この潜りを閉じ、迷宮の中で眠る → 翌日の潜りは無償） */
  const camp = () => {
    setDive((cur) => ({ ...cur, end: "camp" }));
  };

  /** 結果を世界に畳む（end ごとの締めを step に渡す） */
  const commit = () => {
    const end = dive.end ?? "retreat";
    act(
      {
        type: "dungeon",
        id: place,
        end,
        rooms: dive.rooms,
        total: totalRooms(dgn),
        ...(dive.kills.length > 0 ? { kills: dive.kills } : {}),
        ...(dive.loss !== undefined ? { loss: dive.loss } : {}),
        ...(dive.boss !== undefined ? { boss: dive.boss } : {}),
        ...(Object.keys(dive.items).length > 0 ? { items: dive.items } : {}),
        ...(dive.money > 0 ? { money: dive.money } : {}),
        ...(dive.trapFatigue > 0 ? { trapFatigue: dive.trapFatigue } : {}),
        ...(dive.events.length > 0 ? { events: dive.events } : {}),
        weapon: cs?.playerWeapon ?? state.player.weapon,
        ...(usesAcc.length > 0 ? { uses: usesAcc } : {}),
        ...(kiLeft !== null ? { kiLeft } : {}),
        ...(manaLeft !== null ? { manaLeft } : {}),
        ...(seenSpellsAcc.length > 0 ? { seenSpells: seenSpellsAcc } : {}),
        // X-32：潜り中に負った傷を世界へ渡す（数日残る怪我）
        ...(injuriesAcc.length > 0 ? { injuries: injuriesAcc } : {}),
      },
      {
        format: (ev) => [
          ...eventLines(ev, state),
          ...(end === "died" ? [...bioLines(state, "death", true), t.text.chronicleRecorded] : []),
        ],
      },
    );
    if (end === "camp") {
      // 迷宮内野営：このまま迷宮で眠る（宿代は取られず、眠りは街道より浅い。
      // 翌日この迷宮への潜りは行動を要さない —— dg.camp.<id> の刻印で判る）。
      // 眠りは必ず起床の窓へ遷移するので、この画面はここで畳まれる
      act({ type: "sleep", camp: true });
      return;
    }
    back();
  };

  const body: MenuEntry[] =
    dive.end !== null
      ? [
          {
            id: "dungeon-commit",
            label: dive.end === "camp" ? "野営して眠る" : "迷宮を出る",
            primary: true,
            onPick: commit,
          },
        ]
      : [
          {
            id: "dungeon-advance",
            label: bossRoom ? "主の間へ" : "先へ進む",
            primary: true,
            onPick: advance,
          },
          {
            id: "dungeon-camp",
            label: "野営する",
            sub: "迷宮の中で眠る ―― 明日の潜りは行動を要さない",
            onPick: camp,
          },
          {
            id: "dungeon-retreat",
            label: "引き上げる",
            onPick: retreat,
          },
        ];

  const floorLabel = bossRoom
    ? `${dgn.name} ―― 主の間`
    : at !== null
      ? tpl(t.text.dungeonFloor, { name: dgn.name, floor: at.floorIndex + 1 })
      : dgn.name;

  return (
    <div data-testid="screen-dungeon" className="scene">
      <WorldFrame style={{ ...pos({ left: 340, top: 140, width: 600 }), padding: "16px 4px 12px" }}>
        <div style={{ margin: "0 16px 10px", display: "flex", alignItems: "baseline", gap: 14 }}>
          <Kicker text="DUNGEON" />
          <span
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 18,
              fontWeight: 800,
              color: W.hi,
            }}
          >
            {floorLabel}
          </span>
          <span style={{ fontSize: 13, color: W.dim }}>
            {tpl(t.text.dungeonLight, { light: Math.max(0, dive.light) })}
          </span>
          <CellGauge
            value={Math.max(0, dive.light)}
            max={balance.dungeons.lightPerDive}
            cells={10}
          />
        </div>
        <div style={{ margin: "0 16px 8px", fontSize: 12, color: W.faint }}>
          {`${Math.min(index + 1, totalRooms(dgn))} / ${totalRooms(dgn)}室目 ―― 抜いた部屋 ${index}/${progress.total}`}
        </div>
        {cs !== null && enemy !== null && def !== null && (
          <>
            <IntentLine cs={cs} def={def} />
            <CombatArena
              cs={cs}
              enemy={enemy}
              def={def}
              playback={playback}
              foeName={enemyDisplayName(state, enemy, encKey)}
            />
          </>
        )}
        {dive.end !== null && (
          <p style={{ margin: "0 16px 8px", fontSize: 13, color: W.dim }}>{endLine(dive.end)}</p>
        )}
        {cs !== null && !cs.done && dive.end === null ? (
          <CommandMenu
            entries={
              weaponPick
                ? switchEntries(
                    cs,
                    (a) => {
                      setWeaponPick(false);
                      doAction(a);
                    },
                    () => setWeaponPick(false),
                  )
                : artPick
                  ? artEntries(
                      cs,
                      (a) => {
                        setArtPick(false);
                        doAction(a);
                      },
                      () => setArtPick(false),
                    )
                  : [
                      ...(
                        [
                          ["attack", "攻撃"],
                          ["defend", "防御"],
                          ["observe", "見切り"],
                          ["flee", "逃げる"],
                        ] as const
                      ).map(([a, label]): MenuEntry => ({
                        id: `combat-${a}`,
                        label,
                        onPick: () => doAction(a),
                      })),
                      ...(cs.artSlots.length > 0
                        ? [
                            {
                              id: "combat-arts",
                              label: t.text.combatArtsLabel,
                              sub:
                                tpl(t.text.combatKiLine, {
                                  ki: Math.round(cs.playerKi * 10) / 10,
                                  max: cs.playerKiMax,
                                }) +
                                (cs.playerManaMax > 0
                                  ? tpl(t.text.combatManaLine, {
                                      mana: Math.round(cs.playerMana * 10) / 10,
                                      max: cs.playerManaMax,
                                    })
                                  : ""),
                              onPick: () => setArtPick(true),
                            } satisfies Extract<MenuEntry, { id: string }>,
                          ]
                        : []),
                      ...(cs.ownedWeapons.length > 1
                        ? [
                            {
                              id: "combat-weapons",
                              label: t.text.combatSwitchLabel,
                              sub: tpl(t.text.combatWeaponLine, {
                                name: weaponName(cs.playerWeapon),
                              }),
                              onPick: () => setWeaponPick(true),
                            } satisfies Extract<MenuEntry, { id: string }>,
                          ]
                        : []),
                    ]
            }
          />
        ) : (
          <CommandMenu entries={body} onBack={back} />
        )}
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
