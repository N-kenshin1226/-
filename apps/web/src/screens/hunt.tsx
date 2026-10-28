/** 狩り（CT戦闘）と深層ダンジョン画面（UI-01：世界の窓＋コマンド列で統一） */
import { useEffect, useMemo, useState } from "react";
import {
  combatIntent,
  combatResult,
  usableArts,
  type AbyssRun,
  type CombatAction,
  type GameState,
  type StatusId,
} from "@trace/core";
import type { EnemyJson } from "@trace/content";
import { balance } from "@trace/content";
import {
  abyssFloorEnemy,
  beginCombat,
  bioLines,
  cfg,
  crisisAreaClosed,
  crisisEnemyChallengeBonus,
  crisisEnemyTouchpoints,
  endRun,
  enemyAreas,
  enemyDefOf,
  enemyDisplayName,
  eventLines,
  killFloor,
  newAbyssRun,
  playCombatTurn,
  skillList,
  spendLight,
  t,
  tpl,
  uniqueOf,
  weaponDefs,
  type CombatState,
} from "../game.js";
import {
  CbtHpGauge,
  EnemyFigure,
  FloaterLayer,
  useCombatPlayback,
  type Playback,
} from "../fx/combat.js";
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
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/* ── F-04：戦闘の舞台 ── */

/** 再生中に隠れている被弾・傷を差し戻して、拍に合わせて体力が動くようにする */
function displayedHp(cs: CombatState, playback: Playback): { you: number; foe: number } {
  let dealt = 0;
  let taken = 0;
  for (const e of playback.pending) {
    // K-02：武技の一撃と状態の継続ダメージも敵の体力を削る
    // M-01：呪文の一撃（playerSpell）も同じ枠に数える
    if (
      e.type === "playerAttack" ||
      e.type === "playerArt" ||
      e.type === "playerSpell" ||
      e.type === "statusTick"
    )
      dealt += e.damage ?? 0;
    if (e.type === "enemyHit" || e.type === "parried") taken += e.damage ?? 0;
  }
  return { you: cs.playerHp + taken, foe: cs.enemyHp + dealt };
}

/** 敵の意図・こちらの構えの帯（予兆は発動の前に必ず見える） */
function IntentLine({ cs, def }: { cs: CombatState; def: ReturnType<typeof enemyDefOf> }) {
  const intent = combatIntent(cs, def, cfg.combat);
  return (
    <div className="cbt-intent" data-testid="combat-intent">
      {intent.telegraph !== null ? (
        <>
          <span className="tag">予兆</span>
          <span>
            {intent.telegraph.precise
              ? `《${intent.telegraph.name}》――あと ${intent.telegraph.dueIn} tick`
              : "何かを仕掛けてくる気配がする"}
          </span>
        </>
      ) : (
        <span style={{ color: W.dim }}>
          {cs.done
            ? "――"
            : intent.next?.kind === "telegraph"
              ? "敵の間が空く"
              : "――間合いを計っている"}
        </span>
      )}
      {intent.guarding && <span className="chip">防御</span>}
      {intent.reading && <span className="chip">見切り</span>}
      {intent.openingIn > 0 && <span className="chip">隙 あと{intent.openingIn}tick</span>}
    </div>
  );
}

/**
 * 戦闘の舞台（F-04）：敵の影・双方の体力・浮き文字・直近の一拍。
 * 狩りの CombatScreen と深層の AbyssScreen で共用する
 */
function CombatArena({
  cs,
  enemy,
  def,
  playback,
  foeName,
}: {
  cs: CombatState;
  enemy: EnemyJson;
  /** 世界補正済みの敵定義（enemyDefOf。意図の表示に使う） */
  def: ReturnType<typeof enemyDefOf>;
  playback: Playback;
  /** 個体差込みの表示名（精悍な狼・臆病な狼。R-01） */
  foeName?: string;
}) {
  const hp = displayedHp(cs, playback);
  const last = playback.last;
  const omen = cs.telegraph !== null || playback.pending.some((e) => e.type === "telegraph");
  const intent = combatIntent(cs, def, cfg.combat);
  const foeHit = last?.type === "playerAttack" || last?.type === "playerArt";
  const youHurt = (last?.type === "enemyHit" && last.guarded !== true) || last?.type === "parried";
  const beatCls =
    last === null
      ? "dim"
      : (last.type === "playerAttack" || last.type === "playerArt") &&
          (last.crit === true || last.counter === true)
        ? "crit"
        : (last.type === "enemyHit" && (last.big === true || last.crit === true)) ||
            last.type === "lost"
          ? "big"
          : last.type === "won" ||
              last.type === "counter" ||
              last.type === "interrupted" ||
              last.type === "partBroken"
            ? "crit"
            : "";
  // K-02：敵に掛かっている状態と壊れた部位（状態は残り tick を出す）
  const statuses = Object.entries(cs.enemyStatus).filter(
    (e): e is [StatusId, { until: number; power: number }] => e[1] !== undefined,
  );
  return (
    <div>
      <div className="cbt-names">
        <span className="cbt-name">{t.text.combatYou}</span>
        <span className="cbt-name foe">
          {foeName ?? enemy.name}
          {"uniqueVariant" in enemy && enemy.uniqueVariant ? "（強個体）" : ""}
        </span>
      </div>
      <div className="cbt-names" style={{ margin: "0 16px 6px" }}>
        <CbtHpGauge value={hp.you} max={cs.playerHpMax} side="player" testId="combat-hp-you" />
        <CbtHpGauge value={hp.foe} max={cs.enemyHpMax} side="enemy" testId="combat-hp-foe" />
      </div>
      {/* K-02：気力・M-01：魔力の帯と敵の状態・部位（武技・呪文のある世界だけ出す） */}
      {(cs.playerKiMax > 0 ||
        cs.playerManaMax > 0 ||
        statuses.length > 0 ||
        cs.brokenParts.length > 0) && (
        <div className="cbt-names" style={{ margin: "0 16px 4px", fontSize: 12 }}>
          <span data-testid="combat-ki" style={{ color: W.dim }}>
            {tpl(t.text.combatKiLine, {
              ki: Math.round(cs.playerKi * 10) / 10,
              max: cs.playerKiMax,
            })}
          </span>
          {/* M-01：魔力の帯（呪文のある世界だけ出す） */}
          {cs.playerManaMax > 0 && (
            <span data-testid="combat-mana" style={{ color: W.dim }}>
              {tpl(t.text.combatManaLine, {
                mana: Math.round(cs.playerMana * 10) / 10,
                max: cs.playerManaMax,
              })}
            </span>
          )}
          <span data-testid="combat-foe-state">
            {statuses.map(([id, st]) => (
              <span key={id} className="chip" data-status={id}>
                {t.display.statusNames[id] ?? id}
                {st.until > cs.tick ? ` ${st.until - cs.tick}` : ""}
              </span>
            ))}
            {cs.brokenParts.map((p) => (
              <span key={p} className="chip" data-part={p}>
                {t.display.partNames[p] ?? p}破壊
              </span>
            ))}
          </span>
        </div>
      )}
      <div className="cbt-stage" data-testid="combat-stage">
        <div
          className={[
            "cbt-you",
            youHurt ? "hurt" : "",
            intent.guarding ? "guard" : "",
            intent.reading ? "read" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="cbt-you-fig" />
        </div>
        <div className="cbt-foe">
          <EnemyFigure
            id={enemy.id}
            unique={"uniqueVariant" in enemy && enemy.uniqueVariant === true}
            omen={omen && !cs.done}
            dead={cs.done && cs.won}
            hit={foeHit}
          />
        </div>
        <FloaterLayer items={playback.floaters} />
      </div>
      <p className={`cbt-beat ${beatCls}`} data-testid="combat-beat">
        {last !== null ? last.text : "　"}
      </p>
    </div>
  );
}

/* ── K-01：武器の持ち替え ── */

/** 武器の表示名（定義が無い id はそのまま出す） */
const weaponName = (id: string) => weaponDefs[id]?.name ?? id;
/** 武器が使う技能の表示名 */
const weaponSkillName = (id: string) => {
  const w = weaponDefs[id];
  return w === undefined ? undefined : (skillList.find((s) => s.id === w.skill)?.name ?? w.skill);
};

/**
 * 持ち替えのコマンド列（K-01）：所持武器を並べ、選ぶと1行動を消費して
 * その武器に持ち替える（次の行動から武器技能・間隔・補正が変わる）
 */
function switchEntries(
  cs: CombatState,
  doAction: (a: CombatAction) => void,
  cancel: () => void,
): MenuEntry[] {
  return [
    ...cs.ownedWeapons.map((id): MenuEntry => {
      const cur = id === cs.playerWeapon;
      const skill = weaponSkillName(id);
      return {
        id: `combat-switch-${id}`,
        label: `${weaponName(id)}${cur ? `（${t.text.armsEquippedTag}）` : ""}`,
        ...(skill !== undefined ? { sub: `技能 ${skill}` } : {}),
        disabled: cur,
        onPick: () => doAction({ type: "switch", weapon: id }),
      };
    }),
    { kind: "divider" },
    { id: "combat-switch-back", label: "戻る", onPick: cancel },
  ];
}

/* ── K-02：武技の選択 ── */

/**
 * 武技のコマンド列（K-02）：構成スロットの技を並べる。
 * 使えるのは装備中の武器技能のもの＋気力が足りるものだけ
 * （使えない技は理由を出して選べない —— 行動の空費を防ぐ）
 */
function artEntries(
  cs: CombatState,
  doAction: (a: CombatAction) => void,
  cancel: () => void,
): MenuEntry[] {
  const usable = new Set(usableArts(cs, cfg.combat).map((a) => a.def.id));
  return [
    ...cs.artSlots.map((a): MenuEntry => {
      const match = usable.has(a.def.id);
      // M-01：呪文は気力ではなく魔力を消費し、構え（武器技能）を問わない
      const sp = a.def.spell;
      const afford = sp !== undefined ? cs.playerMana >= sp.mana : cs.playerKi >= a.def.ki;
      const ok = match && afford;
      const sub =
        sp !== undefined
          ? !afford
            ? `魔力が足りない（${sp.mana}）`
            : `${t.display.elementNames[sp.element] ?? sp.element}・魔力 ${sp.mana}・詠唱 ${sp.cast}tick`
          : !match
            ? "構えが合わない"
            : !afford
              ? `気力が足りない（${a.def.ki}）`
              : `気力 ${a.def.ki}・CT×${a.def.ct}`;
      return {
        id: `combat-art-${a.def.id}`,
        label: `《${a.def.name}》 Lv${a.lv}`,
        sub,
        disabled: !ok,
        onPick: () => doAction({ type: "art", id: a.def.id }),
      };
    }),
    { kind: "divider" },
    { id: "combat-art-back", label: "戻る", onPick: cancel },
  ];
}

// ---- 狩り（CT戦闘） ----
export function HuntScreen({
  state,
  place,
  setScreen,
}: {
  state: GameState;
  /** 狩りの場＝地域 id（P-01。places.json の region は enemies.json の area と揃える） */
  place?: string;
  setScreen: (s: Screen) => void;
}) {
  const backTo: Screen = place !== undefined ? { name: "place", place } : { name: "menu" };
  // 危機の接点（W-02）：今日の接点の相手には「異変：」の印を付ける。印は示すだけ、倒しても逃げてもよい
  const tpEnemies = crisisEnemyTouchpoints(state);
  // 場所が指定されればその地域の獲物だけ（P-01）：森の獣は森、追い剥ぎは旧街道
  const areas = place !== undefined ? enemyAreas.filter(([a]) => a === place) : enemyAreas;
  const entries: MenuEntry[] = areas.flatMap(([area, group]): MenuEntry[] => {
    const areaName = t.display.huntAreas[area] ?? area;
    // 危機の段階で閉じられたエリアは「立ち入れない」とだけ出す（W-01。段階が変われば解放）
    if (crisisAreaClosed(state, cfg.crisis, area)) {
      return [{ kind: "header", text: tpl(t.text.huntAreaClosed, { name: areaName }) }];
    }
    return [
      { kind: "header", text: areaName },
      ...group.flatMap((e): MenuEntry[] => {
        const ue = uniqueOf(state, e);
        const tp = tpEnemies.get(e.id);
        return [
          {
            id: `enemy-${e.id}`,
            // R-01：今日のこの出会いの個体（精悍な・臆病な）と個体差込みの挑戦差を示す
            label:
              tp !== undefined
                ? `${t.text.touchpointTag}${enemyDisplayName(state, e)}`
                : enemyDisplayName(state, e),
            sub: `挑戦差 ${Math.round(enemyDefOf(state, e).challenge)}`,
            onPick: () =>
              setScreen({
                name: "combat",
                enemy: e,
                ...(tp !== undefined ? { touchpoint: tp } : {}),
                place,
              }),
          },
          // 強個体は特別な相手（T-44）：金色の一行として別立て
          ...(ue !== null
            ? [
                {
                  id: `enemy-${e.id}-unique`,
                  label: `《${ue.name}》`,
                  sub: `強個体・挑戦差 ${ue.challenge}`,
                  gold: true,
                  onPick: () => setScreen({ name: "combat", enemy: ue, place }),
                } satisfies Extract<MenuEntry, { id: string }>,
              ]
            : []),
        ];
      }),
    ];
  });
  return (
    <div data-testid="screen-hunt" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 28, top: 120, width: 560, bottom: 200 }), padding: "14px 4px" }}
      >
        <div style={{ margin: "2px 14px 10px" }}>
          <Kicker text="HUNT" />
          <div
            style={{ fontFamily: theme.font.mincho, fontSize: 24, fontWeight: 800, color: W.hi }}
          >
            {t.text.huntPick}
          </div>
        </div>
        <div className="scroll" style={{ maxHeight: "76%", overflowY: "auto" }}>
          <CommandMenu
            entries={[
              ...entries,
              { kind: "divider" },
              { id: "back", label: "戻る", onPick: () => setScreen(backTo) },
            ]}
            onBack={() => setScreen(backTo)}
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

export function CombatScreen({
  state,
  enemy,
  touchpoint,
  finale,
  occasion,
  place,
  setScreen,
  act,
  push,
}: {
  state: GameState;
  enemy: EnemyJson;
  /** 危機の接点の相手なら接点の id（W-02。勝ったときだけ世界の備えに寄与する） */
  touchpoint?: string;
  /** 決着の場面の勝負所なら場面の id（W-03。結果は危機の備えへ寄与する） */
  finale?: string;
  /** 勝負所の行事（決闘）なら行事の id（X-10。結果は行事の勝敗へ） */
  occasion?: string;
  /** 戦いの起きた場所（P-01。決着後に戻る先） */
  place?: string;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
}) {
  const [cs, setCs] = useState<CombatState>(() => beginCombat(state, enemy));
  // 持ち替えの一覧を開いているか（K-01。武器を2つ以上持っていると選べる）
  const [weaponPick, setWeaponPick] = useState(false);
  // 武技の一覧を開いているか（K-02。構成に技が入っていると選べる）
  const [artPick, setArtPick] = useState(false);
  // 決着後に戻る先（P-01）：戦いの起きた場所 —— 場所を経由しない導線は見取り図へ
  const backTo: Screen = place !== undefined ? { name: "place", place } : { name: "menu" };
  /** 世界補正込みの敵定義（意図の表示が解決側と一致するよう同じものを使う） */
  const def = useMemo(() => enemyDefOf(state, enemy), [state, enemy]);
  // R-01 個体差：今日の出会いの個体の表示名（精悍な狼・臆病な狼）
  const foeName = useMemo(() => enemyDisplayName(state, enemy), [state, enemy]);
  const [announced, setAnnounced] = useState(false);
  // F-04：1手ぶんの出来事を拍に分けて見せる。現れた行は世界ログにも流す
  const playback = useCombatPlayback((ev) => push(`\u3000${ev.text}`));

  useEffect(() => {
    if (!announced) {
      push(tpl(t.text.combatStart, { name: foeName }));
      setAnnounced(true);
    }
  }, [announced, foeName, push]);

  const doAction = (a: CombatAction) => {
    // 再生中の入力は「早送り」（残りを一気に出す。連打でも演出を待たされない）
    if (playback.busy) {
      playback.skip();
      return;
    }
    if (cs.done) return;
    const next = playCombatTurn(cs, a, enemy, state);
    playback.queue(next.log.slice(cs.log.length));
    setCs(next);
  };

  const finish = () => {
    const r = combatResult(cs);
    if (occasion !== undefined) {
      // 勝負所の行事の決闘（X-10）：戦闘の結果を出来（0〜1）に換算して行事の勝敗へ。
      // 勝=1・逃=combatFledScore・敗=0。経験や討伐記録は付かない —— これは狩りではなく勝負所
      act(
        {
          type: "occasionAttempt",
          id: occasion,
          score: r.won ? 1 : r.fled ? (cfg.occasions?.combatFledScore ?? 0) : 0,
          ...(r.died ? { died: true } : {}),
        },
        {
          format: (ev) => [
            ...eventLines(ev, state),
            ...(r.died ? [...bioLines(state, "death", true), t.text.chronicleRecorded] : []),
          ],
        },
      );
      push(
        r.won
          ? tpl(t.text.combatWon, { name: enemy.name })
          : r.fled
            ? t.text.combatFled
            : t.text.combatLost,
      );
      setScreen({ name: "menu" });
      return;
    }
    if (finale !== undefined) {
      // 決着の場面の勝負所（W-03）：戦闘の結果を出来（0〜1）に換算して世界の備えへ。
      // 勝=1・逃=0.35・敗=0。経験や討伐記録は付かない —— これは仕事ではなく勝負所
      act(
        {
          type: "crisisFinaleAttempt",
          id: finale,
          score: r.won ? 1 : r.fled ? 0.35 : 0,
          ...(r.died ? { died: true } : {}),
        },
        {
          format: (ev) => [
            ...eventLines(ev, state),
            ...(r.died ? [...bioLines(state, "death", true), t.text.chronicleRecorded] : []),
          ],
        },
      );
      push(
        r.won
          ? tpl(t.text.combatWon, { name: enemy.name })
          : r.fled
            ? t.text.combatFled
            : t.text.combatLost,
      );
      setScreen({ name: "menu" });
      return;
    }
    act({
      type: "combat",
      enemyId: enemy.id,
      // 個体差（R-01）と危機由来の強化分も挑戦差に乗る（強い敵ほど経験になる。
      // def は beginCombat と同じ世界補正・個体差込みの定義）
      difficulty:
        def.challenge +
        crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id, area: enemy.area }),
      won: r.won,
      fled: r.fled,
      died: r.died,
      // 強化版ユニークを倒したか（T-44）。enemy.id は素の種のまま
      ...("uniqueVariant" in enemy && enemy.uniqueVariant ? { unique: true } : {}),
      // 接点の相手なら接点の id を渡す（W-02。勝利時に備えへ寄与。逃げ・敗北では何も起きない）
      ...(touchpoint !== undefined ? { touchpoint } : {}),
      // 使った武器（K-01）：持ち替えて戦い抜いたなら最後に構えていた武器。
      // 経験はこの武器の技能（槍術・弓術・格闘…）に入る
      weapon: cs.playerWeapon,
      // 獣との戦いなら beast.exp の技能リンク（狩猟・動物知識）に経験が入る
      ...(enemy.beast === true ? { beast: true } : {}),
      // 武技まわり（K-02）：使用記録（技・技能の傾きと技の経験に畳む）と
      // 残った気力（戦闘をまたいで一日続く）を世界へ渡す
      uses: r.uses,
      kiLeft: r.kiLeft,
      // 魔法（M-01）：残った魔力と、見取り稽古で見届けた敵の呪文
      manaLeft: r.manaLeft,
      seenSpells: r.seenSpells,
    });
    push(
      r.won
        ? tpl(t.text.combatWon, { name: enemy.name })
        : r.fled
          ? t.text.combatFled
          : t.text.combatLost,
    );
    // 死亡時は伝記が生成される（06 §1。蘇生するが記録は残る）
    if (r.died) {
      push(bioLines(state, "death", true));
      // 伝記 → 年代記への記録（T-38。実際の追記は act 内で died イベントを見て行う）
      push(t.text.chronicleRecorded);
    }
    setScreen(backTo);
  };

  // コマンド列は一本（キー入力が競合しないよう、戦闘中も確定後も同じ列を使う）
  // 再生中はボタンが「早送り」になる（表示は同じ：行動そのものは積まない）
  const entries: MenuEntry[] = !cs.done
    ? weaponPick
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
            // 武技・呪文（K-02/M-01）：構成スロットに技が入っていると選べる。1行動を消費する
            ...(cs.artSlots.length > 0
              ? [
                  {
                    id: "combat-arts",
                    label:
                      cs.artSlots.some((a) => a.def.spell !== undefined) &&
                      cs.artSlots.some((a) => a.def.spell === undefined)
                        ? `${t.text.combatArtsLabel}・${t.text.combatSpellsLabel}`
                        : cs.artSlots.every((a) => a.def.spell !== undefined)
                          ? t.text.combatSpellsLabel
                          : t.text.combatArtsLabel,
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
            // 武器の持ち替え（K-01）：2つ以上持っていると選べる。1行動を消費する
            ...(cs.ownedWeapons.length > 1
              ? [
                  {
                    id: "combat-weapons",
                    label: t.text.combatSwitchLabel,
                    sub: tpl(t.text.combatWeaponLine, { name: weaponName(cs.playerWeapon) }),
                    onPick: () => setWeaponPick(true),
                  } satisfies Extract<MenuEntry, { id: string }>,
                ]
              : []),
            { kind: "divider" },
            {
              id: "combat-giveup",
              label: "あきらめる",
              danger: true,
              onPick: () => setScreen(backTo),
            },
          ]
    : [
        {
          id: "combat-finish",
          label: cs.won ? "勝利を確定" : cs.fled ? "離脱した" : "結果を受け入れる",
          primary: true,
          onPick: finish,
        },
        { kind: "divider" },
        {
          id: "combat-giveup",
          label: "あきらめる",
          danger: true,
          onPick: () => setScreen(backTo),
        },
      ];

  return (
    <div data-testid="screen-combat" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 320, top: 110, width: 640 }), padding: "16px 4px 12px" }}
        corners={["tl", "tr", "bl", "br"]}
      >
        <div style={{ margin: "0 16px 8px" }}>
          <Kicker text="COMBAT" />
        </div>
        <IntentLine cs={cs} def={def} />
        <CombatArena cs={cs} enemy={enemy} def={def} playback={playback} foeName={foeName} />
        <CommandMenu entries={entries} onBack={() => setScreen(backTo)} />
      </WorldFrame>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", playback.busy ? "早送り" : "決定"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}

/**
 * 深層ダンジョン（T-43、06 §3B）：層を下る連戦。
 * ランの進行（層・灯り・撃破）は core/abyss の AbyssRun、戦闘UIは狩りと同じ枠組み。
 * 終了時に step の abyss コマンドでまとめて世界に反映する
 */
export function AbyssScreen({
  state,
  act,
  push,
  back,
}: {
  state: GameState;
  act: Act;
  push: Push;
  back: () => void;
}) {
  const [run, setRun] = useState<AbyssRun>(() => newAbyssRun(state));
  const [cs, setCs] = useState<CombatState | null>(null);
  // 持ち替えの一覧を開いているか（K-01）
  const [weaponPick, setWeaponPick] = useState(false);
  // 武技の一覧を開いているか（K-02）
  const [artPick, setArtPick] = useState(false);
  /** 現在戦っている層の敵（撃破で run.floor が進んでも表示が変わらないよう保持する） */
  const [enemy, setEnemy] = useState<EnemyJson | null>(null);
  /** その層の個体差の抽選鍵（R-01。層が進むたびに dive で立て直す） */
  const [encKey, setEncKey] = useState("");
  const [loss, setLoss] = useState<{ enemyId: string; difficulty: number } | null>(null);
  // K-02：ランを通した使用記録と、層をまたいで持ち越す気力
  const [usesAcc, setUsesAcc] = useState<{ id?: string; skill: string; tags: string[] }[]>([]);
  const [kiLeft, setKiLeft] = useState<number | null>(null);
  // M-01：層をまたいで持ち越す魔力と、ラン中に見届けた敵の呪文（見取り稽古）
  const [manaLeft, setManaLeft] = useState<number | null>(null);
  const [seenSpellsAcc, setSeenSpellsAcc] = useState<string[]>([]);
  // F-04：1手ぶんの出来事を拍に分けて見せる。現れた行は世界ログにも流す
  const playback = useCombatPlayback((ev) => push(`\u3000${ev.text}`));
  /** 戦闘中の敵の世界補正済み定義（意図の表示用。解決側と同じものを使う） */
  const abyssDef = useMemo(
    () => (enemy === null ? null : enemyDefOf(state, enemy, encKey)),
    [state, enemy, encKey],
  );

  const endLine = (end: NonNullable<AbyssRun["end"]>) =>
    end === "light"
      ? t.text.abyssLightOut
      : end === "retreat"
        ? t.text.abyssRetreat
        : end === "fled"
          ? t.text.combatFled
          : t.text.combatLost;

  const dive = () => {
    const e = abyssFloorEnemy(run);
    const key = `${run.seed}:f${run.floor}`;
    push(tpl(t.text.abyssFloor, { floor: run.floor }));
    push(tpl(t.text.combatStart, { name: enemyDisplayName(state, e, key) }));
    setEnemy(e);
    setEncKey(key);
    // K-02/M-01：気力・魔力は層をまたいで持ち越す（前の層で使った分は戻らない）
    setCs(
      beginCombat(
        state,
        e,
        key,
        kiLeft === null && manaLeft === null
          ? undefined
          : {
              ...state.player,
              ...(kiLeft !== null ? { ki: kiLeft } : {}),
              ...(manaLeft !== null ? { mana: manaLeft } : {}),
            },
      ),
    );
    playback.queue([]);
  };

  const doAction = (a: CombatAction) => {
    if (cs === null || cs.done || run.done || enemy === null) return;
    // 再生中の入力は「早送り」
    if (playback.busy) {
      playback.skip();
      return;
    }
    // 逃走判定の乱数はラン×層で分ける（同じ行動時刻の連戦で同じ結果にしない）
    const prevLen = cs.log.length;
    const next = playCombatTurn(cs, a, enemy, state, `${run.seed}:f${run.floor}`, encKey);
    playback.queue(next.log.slice(prevLen));
    setCs(next);
    const r = combatResult(next);
    let cur = { ...run, kills: [...run.kills] };
    // 個体差・危機由来の強化分を層の難易度に乗せる（深層の敵はエリアを持たないので id だけで見る）
    const difficulty =
      (abyssDef?.challenge ?? enemy.challenge) +
      crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id });
    if (r.won) {
      // 最後の灯りで倒しても層は刻む（灯り切れはそのあとで閉じる）
      cur = killFloor(cur, { enemyId: enemy.id, difficulty });
    }
    cur = spendLight(cur);
    if (r.died) {
      cur = endRun(cur, "died");
      setLoss({ enemyId: enemy.id, difficulty });
    } else if (r.fled) {
      cur = endRun(cur, "fled");
      setLoss({ enemyId: enemy.id, difficulty });
    } else if (!r.won && cur.done) {
      // 灯り切れで未決着のまま中断した層
      setLoss({ enemyId: enemy.id, difficulty });
    }
    // K-02/M-01：この層の戦闘が閉じたら（決着・灯り切れどちらでも）
    // 使用記録と残りの気力・魔力・見取りの呪文を畳む
    if (next.done || cur.done) {
      setUsesAcc((acc) => [...acc, ...next.uses]);
      setKiLeft(next.playerKi);
      setManaLeft(next.playerMana);
      setSeenSpellsAcc((acc) => [...acc, ...next.seenSpells.filter((x) => !acc.includes(x))]);
    }
    if (cur.done && cur.end !== null) push(endLine(cur.end));
    setRun(cur);
  };

  /** 層の合間の引き返し（戦闘中の離脱は「逃げる」） */
  const retreat = () => {
    const cur = endRun(run, "retreat");
    push(endLine("retreat"));
    setRun(cur);
  };

  const commit = () => {
    const end = run.end ?? "retreat";
    act(
      {
        type: "abyss",
        end,
        kills: run.kills,
        ...(loss !== null ? { loss } : {}),
        // ラン中に最後に使った武器（K-01。持ち替えたまま終わればその武器の技能に経験）
        weapon: cs?.playerWeapon ?? state.player.weapon,
        // K-02：ランを通した使用記録と残りの気力
        uses: usesAcc,
        ...(kiLeft !== null ? { kiLeft } : {}),
        // M-01：残りの魔力と、ラン中に見届けた敵の呪文（見取り稽古）
        ...(manaLeft !== null ? { manaLeft } : {}),
        ...(seenSpellsAcc.length > 0 ? { seenSpells: seenSpellsAcc } : {}),
      },
      {
        format: (ev) => [
          ...eventLines(ev, state),
          // 深層での死も教会蘇生の扱いは同じ（03 §4）。伝記を残す
          ...(end === "died" ? [...bioLines(state, "death", true), t.text.chronicleRecorded] : []),
        ],
      },
    );
    back();
  };

  const body: MenuEntry[] = run.done
    ? [
        {
          id: "abyss-commit",
          label: "深層を出る",
          primary: true,
          onPick: commit,
        },
      ]
    : cs === null || enemy === null
      ? [
          { id: "abyss-dive", label: "降りる", primary: true, onPick: dive },
          { id: "abyss-retreat", label: "引き返す", onPick: retreat },
        ]
      : cs.done && cs.won
        ? [
            { id: "abyss-dive", label: "さらに降りる", primary: true, onPick: dive },
            { id: "abyss-retreat", label: "引き返す", onPick: retreat },
          ]
        : [];

  return (
    <div data-testid="screen-abyss" className="scene">
      <WorldFrame style={{ ...pos({ left: 340, top: 140, width: 600 }), padding: "16px 4px 12px" }}>
        <div style={{ margin: "0 16px 10px", display: "flex", alignItems: "baseline", gap: 14 }}>
          <span
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 22,
              fontWeight: 800,
              color: W.hi,
            }}
          >
            {tpl(t.text.abyssFloor, { floor: run.floor })}
          </span>
          <span style={{ fontSize: 13, color: W.dim }}>
            {tpl(t.text.abyssLight, { light: run.light })}
          </span>
          {/* 灯りの残量：セルゲージで（上限＝ランの初期灯り＝maxTurns） */}
          <CellGauge value={Math.max(0, run.light)} max={balance.abyss.maxTurns} cells={10} />
        </div>
        {cs !== null && enemy !== null && abyssDef !== null && (
          <>
            <IntentLine cs={cs} def={abyssDef} />
            <CombatArena
              cs={cs}
              enemy={enemy}
              def={abyssDef}
              playback={playback}
              foeName={enemyDisplayName(state, enemy, encKey)}
            />
            {cs.done && cs.won && (
              <p style={{ margin: "0 16px 8px", fontSize: 13, color: theme.colors.special }}>
                {tpl(t.text.abyssCleared, { name: enemy.name })}
              </p>
            )}
          </>
        )}
        {!cs?.done && cs !== null ? (
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
                      // 武技・呪文（K-02/M-01。層の中でも技は使える —— 気力・魔力だけが限り）
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
                      // 武器の持ち替え（K-01。層の中でも構えを変えられる）
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
