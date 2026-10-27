/** 狩り（CT戦闘）と深層ダンジョン画面（UI-01：世界の窓＋コマンド列で統一） */
import { useEffect, useMemo, useState } from "react";
import {
  combatIntent,
  combatResult,
  type AbyssRun,
  type CombatAction,
  type GameState,
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
  spendLight,
  t,
  tpl,
  uniqueOf,
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
    if (e.type === "playerAttack") dealt += e.damage ?? 0;
    if (e.type === "enemyHit") taken += e.damage ?? 0;
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
  const foeHit = last?.type === "playerAttack";
  const youHurt = last?.type === "enemyHit" && last.guarded !== true;
  const beatCls =
    last === null
      ? "dim"
      : last.type === "playerAttack" && (last.crit === true || last.counter === true)
        ? "crit"
        : (last.type === "enemyHit" && (last.big === true || last.crit === true)) ||
            last.type === "lost"
          ? "big"
          : last.type === "won" || last.type === "counter"
            ? "crit"
            : "";
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
    ? [
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
  /** 現在戦っている層の敵（撃破で run.floor が進んでも表示が変わらないよう保持する） */
  const [enemy, setEnemy] = useState<EnemyJson | null>(null);
  /** その層の個体差の抽選鍵（R-01。層が進むたびに dive で立て直す） */
  const [encKey, setEncKey] = useState("");
  const [loss, setLoss] = useState<{ enemyId: string; difficulty: number } | null>(null);
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
    setCs(beginCombat(state, e, key));
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
            entries={(
              [
                ["attack", "攻撃"],
                ["defend", "防御"],
                ["observe", "見切り"],
                ["flee", "逃げる"],
              ] as const
            ).map(([a, label]) => ({
              id: `combat-${a}`,
              label,
              onPick: () => doAction(a),
            }))}
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
