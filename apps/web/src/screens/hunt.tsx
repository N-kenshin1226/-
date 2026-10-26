/** 狩り（CT戦闘）と深層ダンジョン画面（X-2 で App.tsx から分離） */
import { useEffect, useState } from "react";
import {
  combatResult,
  telegraphLines,
  type AbyssRun,
  type CombatAction,
  type GameState,
} from "@trace/core";
import type { EnemyJson } from "@trace/content";
import {
  abyssFloorEnemy,
  beginCombat,
  bioLines,
  cfg,
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
import { Btn, css, type Act, type Push, type Screen } from "../ui.js";

// ---- 狩り（CT戦闘） ----
export function HuntScreen({
  state,
  setScreen,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
}) {
  return (
    <section style={css.panel} data-testid="screen-hunt">
      <div>{t.text.huntPick}</div>
      {enemyAreas.map(([area, group]) => (
        <div key={area}>
          <div style={css.dim}>{t.display.huntAreas[area] ?? area}</div>
          {group.map((e) => {
            const ue = uniqueOf(state, e);
            return (
              <div key={e.id}>
                <Btn
                  testId={`enemy-${e.id}`}
                  onClick={() => setScreen({ name: "combat", enemy: e })}
                >
                  {e.name}
                  <span style={css.dim}>（挑戦差 {e.challenge}）</span>
                </Btn>
                {ue !== null && (
                  <Btn
                    testId={`enemy-${e.id}-unique`}
                    onClick={() => setScreen({ name: "combat", enemy: ue })}
                  >
                    {ue.name}
                    <span style={css.dim}>（挑戦差 {ue.challenge}）</span>
                  </Btn>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <Btn onClick={() => setScreen({ name: "menu" })}>戻る</Btn>
    </section>
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
      difficulty: enemy.challenge,
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

  return (
    <section style={css.panel} data-testid="screen-combat">
      <div>
        {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
          <div key={i} style={css.sys}>
            {l}
          </div>
        ))}
      </div>
      <div style={css.dim}>
        {tpl(t.text.combatStatus, {
          playerHp: Math.max(0, cs.playerHp),
          playerMax: cs.playerHpMax,
          enemy: enemy.name,
          enemyHp: Math.max(0, cs.enemyHp),
        })}
      </div>
      {!cs.done ? (
        <div>
          {(
            [
              ["attack", "攻撃"],
              ["defend", "防御"],
              ["observe", "観察"],
              ["flee", "逃げる"],
            ] as const
          ).map(([a, label]) => (
            <Btn key={a} testId={`combat-${a}`} onClick={() => doAction(a)}>
              {label}
            </Btn>
          ))}
        </div>
      ) : (
        <Btn primary testId="combat-finish" onClick={finish}>
          {cs.won ? "勝利を確定" : cs.fled ? "離脱した" : "結果を受け入れる"}
        </Btn>
      )}
      <Btn onClick={() => setScreen({ name: "menu" })}>あきらめる</Btn>
    </section>
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
    if (r.won) {
      // 最後の灯りで倒しても層は刻む（灯り切れはそのあとで閉じる）
      cur = killFloor(cur, { enemyId: enemy.id, difficulty: enemy.challenge });
    }
    cur = spendLight(cur);
    if (r.died) {
      cur = endRun(cur, "died");
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
    } else if (r.fled) {
      cur = endRun(cur, "fled");
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
    } else if (!r.won && cur.done) {
      // 灯り切れで未決着のまま中断した層
      setLoss({ enemyId: enemy.id, difficulty: enemy.challenge });
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

  return (
    <section style={css.panel} data-testid="screen-abyss">
      <div>
        {tpl(t.text.abyssFloor, { floor: run.floor })}
        <span style={css.dim}> {tpl(t.text.abyssLight, { light: run.light })}</span>
      </div>
      {run.done ? (
        <Btn primary testId="abyss-commit" onClick={commit}>
          深層を出る
        </Btn>
      ) : cs === null || enemy === null ? (
        <div>
          <Btn primary testId="abyss-dive" onClick={dive}>
            降りる
          </Btn>
          <Btn testId="abyss-retreat" onClick={retreat}>
            引き返す
          </Btn>
        </div>
      ) : (
        <div>
          {telegraphLines(cs, enemy, cfg.combat).map((l, i) => (
            <div key={i} style={css.sys}>
              {l}
            </div>
          ))}
          <div style={css.dim}>
            {tpl(t.text.combatStatus, {
              playerHp: Math.max(0, cs.playerHp),
              playerMax: cs.playerHpMax,
              enemy: enemy.name,
              enemyHp: Math.max(0, cs.enemyHp),
            })}
          </div>
          {!cs.done ? (
            <div>
              {(
                [
                  ["attack", "攻撃"],
                  ["defend", "防御"],
                  ["observe", "観察"],
                  ["flee", "逃げる"],
                ] as const
              ).map(([a, label]) => (
                <Btn key={a} testId={`combat-${a}`} onClick={() => doAction(a)}>
                  {label}
                </Btn>
              ))}
            </div>
          ) : cs.won ? (
            <div>
              <div style={css.sys}>{tpl(t.text.abyssCleared, { name: enemy.name })}</div>
              <Btn primary testId="abyss-dive" onClick={dive}>
                さらに降りる
              </Btn>
              <Btn testId="abyss-retreat" onClick={retreat}>
                引き返す
              </Btn>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
