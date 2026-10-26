/** 狩り（CT戦闘）と深層ダンジョン画面（UI-01：世界の窓＋コマンド列で統一） */
import { useEffect, useState } from "react";
import {
  combatResult,
  telegraphLines,
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
  endRun,
  enemyAreas,
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

/** 戦闘窓の頭：敵名と体力ゲージ */
function CombatStatus({ cs, enemyName }: { cs: CombatState; enemyName: string }) {
  return (
    <div style={{ margin: "0 16px 10px" }}>
      <p
        style={{
          margin: "0 0 6px",
          fontFamily: theme.font.mincho,
          fontSize: 20,
          fontWeight: 700,
          color: theme.colors.bad,
        }}
      >
        {enemyName}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: theme.font.mincho,
          fontSize: 17,
          fontWeight: 700,
          color: W.hi,
        }}
      >
        {tpl(t.text.combatStatus, {
          playerHp: Math.max(0, cs.playerHp),
          playerMax: cs.playerHpMax,
          enemy: enemyName,
          enemyHp: Math.max(0, cs.enemyHp),
        })}
      </p>
    </div>
  );
}

// ---- 狩り（CT戦闘） ----
export function HuntScreen({
  state,
  setScreen,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
}) {
  const entries: MenuEntry[] = enemyAreas.flatMap(([area, group]): MenuEntry[] => {
    const areaName = t.display.huntAreas[area] ?? area;
    // 危機の段階で閉じられたエリアは「立ち入れない」とだけ出す（W-01。段階が変われば解放）
    if (crisisAreaClosed(state, cfg.crisis, area)) {
      return [{ kind: "header", text: tpl(t.text.huntAreaClosed, { name: areaName }) }];
    }
    return [
      { kind: "header", text: areaName },
      ...group.flatMap((e): MenuEntry[] => {
        const ue = uniqueOf(state, e);
        return [
          {
            id: `enemy-${e.id}`,
            label: e.name,
            sub: `挑戦差 ${e.challenge}`,
            onPick: () => setScreen({ name: "combat", enemy: e }),
          },
          // 強個体は特別な相手（T-44）：金色の一行として別立て
          ...(ue !== null
            ? [
                {
                  id: `enemy-${e.id}-unique`,
                  label: `《${ue.name}》`,
                  sub: `強個体・挑戦差 ${ue.challenge}`,
                  gold: true,
                  onPick: () => setScreen({ name: "combat", enemy: ue }),
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
              { id: "back", label: "戻る", onPick: () => setScreen({ name: "menu" }) },
            ]}
            onBack={() => setScreen({ name: "menu" })}
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
  setScreen,
  act,
  push,
}: {
  state: GameState;
  enemy: EnemyJson;
  setScreen: (s: Screen) => void;
  act: Act;
  push: Push;
}) {
  const [cs, setCs] = useState<CombatState>(() => beginCombat(state, enemy));
  const [printed, setPrinted] = useState(0);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!announced) {
      push(tpl(t.text.combatStart, { name: enemy.name }));
      setAnnounced(true);
    }
    const fresh = cs.log.slice(printed);
    if (fresh.length > 0) {
      push(fresh.map((e) => `\u3000${e.text}`));
      setPrinted(cs.log.length);
    }
  }, [cs, printed, announced, enemy.name, push]);

  const doAction = (a: CombatAction) => {
    setCs(playCombatTurn(cs, a, enemy, state));
  };

  const finish = () => {
    const r = combatResult(cs);
    act({
      type: "combat",
      enemyId: enemy.id,
      // 危機由来の強化分も挑戦差に乗る（W-01。強い敵ほど経験になる）
      difficulty:
        enemy.challenge +
        crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id, area: enemy.area }),
      won: r.won,
      fled: r.fled,
      died: r.died,
      // 強化版ユニークを倒したか（T-44）。enemy.id は素の種のまま
      ...("uniqueVariant" in enemy && enemy.uniqueVariant ? { unique: true } : {}),
    });
    push(r.won ? t.text.combatWon : r.fled ? t.text.combatFled : t.text.combatLost);
    // 死亡時は伝記が生成される（06 §1。蘇生するが記録は残る）
    if (r.died) {
      push(bioLines(state, "death"));
      // 伝記 → 年代記への記録（T-38。実際の追記は act 内で died イベントを見て行う）
      push(t.text.chronicleRecorded);
    }
    setScreen({ name: "menu" });
  };

  // コマンド列は一本（キー入力が競合しないよう、戦闘中も確定後も同じ列を使う）
  const entries: MenuEntry[] = !cs.done
    ? [
        ...(
          [
            ["attack", "攻撃"],
            ["defend", "防御"],
            ["observe", "観察"],
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
          onPick: () => setScreen({ name: "menu" }),
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
          onPick: () => setScreen({ name: "menu" }),
        },
      ];

  return (
    <div data-testid="screen-combat" className="scene">
      <WorldFrame
        style={{ ...pos({ left: 340, top: 150, width: 600 }), padding: "16px 4px 12px" }}
        corners={["tl", "tr", "bl", "br"]}
      >
        <div style={{ margin: "0 16px 8px" }}>
          <Kicker text="COMBAT" />
        </div>
        {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
          <p key={i} style={{ margin: "0 16px 4px", fontSize: 13, color: theme.colors.special }}>
            {l}
          </p>
        ))}
        <CombatStatus cs={cs} enemyName={enemy.name} />
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
  const [loss, setLoss] = useState<{ enemyId: string; difficulty: number } | null>(null);
  const [printed, setPrinted] = useState(0);

  // 戦闘ログは出た分だけ追記する
  useEffect(() => {
    if (cs === null) return;
    const fresh = cs.log.slice(printed);
    if (fresh.length > 0) {
      push(fresh.map((e) => `\u3000${e.text}`));
      setPrinted(cs.log.length);
    }
  }, [cs, printed, push]);

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
    push(tpl(t.text.abyssFloor, { floor: run.floor }));
    push(tpl(t.text.combatStart, { name: e.name }));
    setEnemy(e);
    setCs(beginCombat(state, e));
    setPrinted(0);
  };

  const doAction = (a: CombatAction) => {
    if (cs === null || cs.done || run.done || enemy === null) return;
    // 逃走判定の乱数はラン×層で分ける（同じ行動時刻の連戦で同じ結果にしない）
    const next = playCombatTurn(cs, a, enemy, state, `${run.seed}:f${run.floor}`);
    setCs(next);
    const r = combatResult(next);
    let cur = { ...run, kills: [...run.kills] };
    // 危機由来の強化分を層の難易度に乗せる（深層の敵はエリアを持たないので id だけで見る）
    const difficulty =
      enemy.challenge + crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id });
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
          ...eventLines(ev),
          // 深層での死も教会蘇生の扱いは同じ（03 §4）。伝記を残す
          ...(end === "died" ? [...bioLines(state, "death"), t.text.chronicleRecorded] : []),
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
        {cs !== null && enemy !== null && (
          <>
            {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
              <p
                key={i}
                style={{ margin: "0 16px 4px", fontSize: 13, color: theme.colors.special }}
              >
                {l}
              </p>
            ))}
            <CombatStatus cs={cs} enemyName={enemy.name} />
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
                ["observe", "観察"],
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
