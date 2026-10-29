import {
  abyssRunSeed,
  activeBookEffects,
  activeEffects,
  combatResult,
  combatTurn,
  createRng,
  crisisEnemyChallengeBonus,
  crisisEnemyMods,
  damageFactor,
  endRun,
  floorEnemy,
  killFloor,
  rollIndividual,
  spendLight,
  startCombat,
  startRun,
  telegraphLines,
  withWorldMods,
  worldMods,
  type ActionEvent,
  type BodyPart,
  type CombatAction,
  type CombatState,
  type EnemyDef,
  type EnemyTrait,
  type GameState,
  type StepConfig,
  type StepResult,
} from "@trace/core";
import { balance, enemies, vows, type CliText, type EnemyJson } from "@trace/content";
import { step } from "@trace/core";
import { tpl } from "./render.js";

/**
 * 戦闘・深層の対話ループに必要な入出力と表示の差し込み口。
 * game.ts 内の閉包（out/ask/applyTitles など）をまとめて渡す
 */
export interface CombatIo {
  out: (line: string) => void;
  outAll: (lines: string[]) => void;
  /** null が返ったら中断（呼び出し側は即 return） */
  ask: (prompt: string) => Promise<string | null>;
  t: CliText;
  cfg: StepConfig;
  skillNames: Map<string, string>;
  /** イベント → 表示行（称号・気配・打診など） */
  applyTitles: (events: ActionEvent[]) => string[];
  /** 伝記の表示行（T-37） */
  bioLines: (st: GameState, cause?: "retire" | "death", worldEpilogue?: boolean) => string[];
  /** 戦闘死を年代記に刻む（刻んだなら true） */
  noteDeath: (res: StepResult) => boolean;
}

/**
 * 世界補正＋個体差込みの敵定義（R-01）。seed は遭遇の鍵
 * （狩りは日付×行動、深層はラン×層、勝負所は行事ごと）——
 * 同じ鍵なら必ず同じ個体になる（決定的）
 */
export function indivEnemyDef(
  st: GameState,
  enemy: EnemyJson,
  seed: string,
  cfg: StepConfig,
  individual = true,
): { def: EnemyDef; trait: EnemyTrait } {
  // 運命の傾向・誓約の世界補正（T-45/T-46）：戦乱の世や強敵の誓で敵の基礎値が上がる。
  // 攻撃側の傾向効果（workGainFactor など）は step 側のゲイン経路に乗る。
  // 世界の危機（W-01）の段階の影響も掛け合わせる（霧に覆われた森の敵が強くなる等）
  const fate = worldMods(st, balance.tendency, vows.vows);
  const cm = crisisEnemyMods(st, cfg.crisis, { id: enemy.id, area: enemy.area });
  const base = withWorldMods(enemy, {
    ...fate,
    enemyHpFactor: (fate.enemyHpFactor ?? 1) * cm.enemyHpFactor,
    enemyPowerFactor: (fate.enemyPowerFactor ?? 1) * cm.enemyPowerFactor,
  });
  const ind = balance.combat.individual;
  if (!individual || ind === undefined) return { def: base, trait: "normal" };
  return rollIndividual(base, createRng(`${st.seed}:ind:${seed}`), ind);
}

/** 個体差の気質込みの表示名（精悍な狼・臆病な狼。normal は素の名） */
export function indivName(t: CliText, enemy: EnemyJson, trait: EnemyTrait): string {
  if (trait === "normal") return enemy.name;
  const adj = t.display.enemyTraitNames[trait];
  return adj === undefined ? enemy.name : `${adj}${enemy.name}`;
}

/**
 * CT戦闘を対話的に回す（狩り・深層の共通部品）。
 * seed は逃走判定などの乱数源（狩りは日付×行動、深層はラン×層で別々に与える）。
 * opts.spend はプレイヤー行動ごとの消費（深層の灯り）。opts.aborted() が true なら
 * 未決着のまま打ち切る（灯り切れ）。戻り値は最終 CombatState。EOF なら null
 */
export async function fightEnemy(
  io: CombatIo,
  enemy: EnemyJson,
  seed: string,
  st: GameState,
  opts?: {
    spend?: () => void;
    aborted?: () => boolean;
    individual?: boolean;
    /** X-32：ランの中間で負った怪我（GameState.injuries に足される） */
    injuries?: readonly BodyPart[];
  },
): Promise<CombatState | null> {
  const { out, outAll, ask, t, cfg } = io;
  // 称号・認定職・師匠・読了書物の与ダメージ効果（T-35・T-27・T-26。例《百狼斬り》の damageVs.wolf）
  const atkFactor = damageFactor(
    [
      ...activeEffects(st, cfg.titles, cfg.society.professions, cfg.mentors?.mentors),
      ...activeBookEffects(st, cfg.books),
    ],
    enemy.id,
  );
  // R-01 個体差：この出会いの個体を決定的に抽選（indivEnemyDef と同じ鍵）
  const { def: worldEnemy, trait } = indivEnemyDef(
    st,
    enemy,
    seed,
    cfg,
    opts?.individual !== false,
  );
  const foeName = indivName(t, enemy, trait);
  // X-32：癒え途中の傷は係数として響く（web の beginCombat と同じ畳み方）
  const cp = {
    ...st.player,
    injuries: [...st.injuries.map((i) => i.part), ...(opts?.injuries ?? [])],
  };
  let cs = startCombat(worldEnemy, balance.combat, cp, atkFactor);
  out(tpl(t.text.combatStart, { name: foeName }));
  let printed = 0;
  while (!cs.done && !(opts?.aborted?.() ?? false)) {
    outAll(telegraphLines(cs, worldEnemy, balance.combat));
    out(
      tpl(t.text.combatStatus, {
        playerHp: Math.max(0, cs.playerHp),
        playerMax: cs.playerHpMax,
        enemy: foeName,
        enemyHp: Math.max(0, cs.enemyHp),
      }),
    );
    const a = await ask(t.text.combatPrompt);
    if (a === null) return null;
    const act: CombatAction | null =
      a.trim() === "1"
        ? "attack"
        : a.trim() === "2"
          ? "defend"
          : a.trim() === "3"
            ? "observe"
            : a.trim() === "4"
              ? "flee"
              : null;
    if (!act) {
      out(t.text.invalidInput);
      continue;
    }
    cs = combatTurn(cs, act, worldEnemy, balance.combat, { skill: 0, seed });
    opts?.spend?.();
    for (const e of cs.log.slice(printed)) out(`\u3000${e.text}`);

    printed = cs.log.length;
  }
  return cs;
}

/** 戦闘後の gainApplied を表示行にする（狩り・深層で共用） */
export function combatGainLines(io: CombatIo, events: ActionEvent[]): string[] {
  const { t, skillNames } = io;
  return events
    .filter((e) => e.type === "gainApplied" && e.amount > 0)
    .map((e) =>
      tpl(t.text.combatGain, {
        skill: skillNames.get((e as Extract<ActionEvent, { type: "gainApplied" }>).skill) ?? "",
        amount: (e as Extract<ActionEvent, { type: "gainApplied" }>).amount.toFixed(1),
      }),
    );
}

/**
 * 深層に潜る（T-43、06 §3B）：層を下る連戦。灯り（行動回数）が尽きるまで。
 * 戻り値は新しい state。EOF（入力切れ）なら null（呼び出し側は現在の state で終了）
 */
export async function runAbyss(io: CombatIo, state: GameState): Promise<GameState | null> {
  const { out, outAll, ask, t, cfg } = io;
  let run = startRun(abyssRunSeed(state.seed, state.counters["abyss.runs"] ?? 0), balance.abyss);
  out(tpl(t.text.abyssStart, { light: run.light }));
  let loss: { enemyId: string; difficulty: number } | undefined;
  // X-32：層の中間で負った怪我は次の層の戦闘にも響き、ランの終わりに畳まれる
  let injuriesAcc: BodyPart[] = [];
  while (!run.done) {
    const floor = run.floor;
    const enemy = floorEnemy(run.seed, floor, enemies.enemies, balance.abyss);
    out(tpl(t.text.abyssFloor, { floor }));
    const cs = await fightEnemy(io, enemy, `${run.seed}:f${floor}`, state, {
      injuries: injuriesAcc,
      spend: () => {
        run = spendLight(run);
      },
      aborted: () => run.done,
    });
    if (cs === null) return null;
    const r = combatResult(cs);
    injuriesAcc = [...injuriesAcc, ...r.injuries];
    // 個体差（R-01）込みの挑戦差 —— fightEnemy と同じ抽選鍵で引く
    const foeChallenge =
      indivEnemyDef(state, enemy, `${run.seed}:f${floor}`, cfg).def.challenge +
      crisisEnemyChallengeBonus(state, cfg.crisis, { id: enemy.id });
    if (r.won) {
      // 倒した層を刻む。最後の灯りで倒しても層は数える（灯り切れはそのあとで閉じる）
      run = killFloor(run, {
        enemyId: enemy.id,
        difficulty: foeChallenge,
      });
      if (!run.done) {
        // 層の合間だけ引き返せる。戦闘中の離脱は「逃げる」で
        out(tpl(t.text.abyssCleared, { name: enemy.name }));
        out(tpl(t.text.abyssLight, { light: run.light }));
        const d = await ask(t.text.abyssDescendPrompt);
        if (d === null) return null;
        if (d.trim() !== "1") run = endRun(run, "retreat");
      }
    } else {
      loss = {
        enemyId: enemy.id,
        difficulty: foeChallenge,
      };
      if (r.died) run = endRun(run, "died");
      else if (r.fled) run = endRun(run, "fled");
      else run = endRun(run, "light"); // 灯り切れで未決着のまま中断
    }
  }
  if (run.end === "light") out(t.text.abyssLightOut);
  else if (run.end === "retreat") out(t.text.abyssRetreat);
  else if (run.end === "fled") out(t.text.combatFled);
  else out(t.text.combatLost);
  const res = step(
    state,
    {
      type: "abyss",
      end: run.end ?? "light",
      kills: run.kills,
      ...(loss !== undefined ? { loss } : {}),
      ...(injuriesAcc.length > 0 ? { injuries: injuriesAcc } : {}),
    },
    cfg,
  );
  const next = res.state;
  const ended = res.events.find(
    (e): e is Extract<ActionEvent, { type: "abyssEnded" }> => e.type === "abyssEnded",
  );
  out(tpl(t.text.abyssResult, { depth: ended?.depth ?? 0, best: ended?.best ?? 0 }));
  if (ended?.newBest) out(tpl(t.text.abyssBest, { best: ended.best }));
  outAll(combatGainLines(io, res.events));
  outAll(io.applyTitles(res.events));
  // 深層での死も教会蘇生の扱いは同じ（03 §4）。伝記は生成して年代記に残す
  if (run.end === "died") {
    outAll(io.bioLines(next, "death", true));
    if (io.noteDeath(res)) out(t.text.chronicleRecorded);
  }
  return next;
}
