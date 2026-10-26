import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  canAct,
  combatResult,
  combatTurn,
  deserialize,
  miningGame,
  negotiationGame,
  newGame,
  serialize,
  simpleJudgmentQuality,
  sleepQuality,
  smithingGame,
  step,
  type ActionEvent,
  type BoardState,
  type DealCard,
  type GameState,
  type InnRank,
  type CombatAction,
  type StepConfig,
  type TimingInput,
} from "@trace/core";
import { startCombat, suggestGoals, telegraphLines } from "@trace/core";
import {
  atoms,
  balance,
  canon,
  cliText,
  enemies,
  orders,
  skills,
  society,
  titles,
  type Order,
} from "@trace/content";
import { stepConfig } from "../config.js";
import type { CliIo } from "./io.js";
import { innPickLines, skillPickLines, statusLines, tpl, wakeBlock } from "./render.js";

export interface PlayCliOptions {
  io: CliIo;
  /** 既定: ~/.trace/save.json（環境変数 TRACE_SAVE_PATH で上書き可） */
  savePath?: string;
  /** 新規開始時のシード。既定: 環境変数 TRACE_SEED か "TRACE-M0" */
  seed?: string;
  /** テスト用に依存を差し替える口（既定: balance/content/stepConfig） */
  cfg?: StepConfig;
  /** ミニゲームの拍の待機（既定: 実時間。テストでは即時を渡す） */
  delay?: (ms: number) => Promise<void>;
}

const INN_ORDER: readonly InnRank[] = ["cheap", "normal", "good"];

function defaultSavePath(): string {
  return process.env.TRACE_SAVE_PATH ?? join(homedir(), ".trace", "save.json");
}

function titleMessage(id: string, t: typeof cliText): string {
  const def = titles.titles.find((x) => x.id === id);
  if (def?.message) return def.message;
  return tpl(t.text.titleGainedFallback, { name: def?.name ?? id });
}

/**
 * play:cli のゲームループ。入出力は CliIo 越しなので
 * 自動テストでは scriptedIo で入力行を流し込める。
 * 終了時の GameState を返す（中断/EOF で終了）。
 */
export async function playCli(opts: PlayCliOptions): Promise<GameState | null> {
  const { io } = opts;
  const t = cliText;
  const cfg = opts.cfg ?? stepConfig();
  const savePath = opts.savePath ?? defaultSavePath();
  const seed = opts.seed ?? process.env.TRACE_SEED ?? "TRACE-M0";
  const skillList = skills.skills.map((s) => ({ id: s.id, name: s.name }));
  const skillNames = new Map(skillList.map((s) => [s.id, s.name]));

  const out = (s: string) => io.write(s);
  const outAll = (ss: string[]) => ss.forEach(out);

  /** 1行入力。プロンプトは改行なしで出す */
  const ask = async (prompt: string): Promise<string | null> => {
    if (prompt) io.write(prompt);
    const line = await io.read();
    if (line === null) out(t.text.eof);
    return line;
  };

  const save = (state: GameState) => {
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(savePath, serialize(state));
  };

  // ---- 開始：セーブがあれば続きから選べる ----
  out(t.text.banner);
  out(t.text.intro);
  let state: GameState | null = null;
  const hasSave = existsSync(savePath);
  if (hasSave) {
    out(t.text.saveFound);
    out(t.text.choiceResume);
    out(t.text.choiceNew);
    const a = await ask(t.text.promptChoice);
    if (a === null) return null;
    if (a.trim() === "1") {
      try {
        state = deserialize(readFileSync(savePath, "utf8"));
      } catch {
        out(t.text.saveBroken);
      }
    }
  }
  if (!state) {
    state = newGame(seed, t.text.playerName, {
      skillIds: skillList.map((s) => s.id),
      initialPotential: balance.player.initialPotential,
      initialStatValue: balance.player.initialStatValue,
    });
  }

  /** 称号獲得・気配の表示行（S予算超過の称号は折りたたみ表現） */
  const applyTitles = (events: ActionEvent[]): string[] =>
    events.flatMap((e) => {
      if (e.type === "titleGained") {
        if (e.suppressed) {
          const name = titles.titles.find((x) => x.id === e.id)?.name ?? e.id;
          return [tpl(t.text.titleSuppressed, { name })];
        }
        return [titleMessage(e.id, t)];
      }
      if (e.type === "kehai") return [t.text.kehai];
      if (e.type === "offerReceived") {
        const name =
          society.standings.find((s) => s.id === e.id)?.name ??
          society.professions.find((p) => p.id === e.id)?.name ??
          e.id;
        return [tpl(t.text.offerReceived, { name })];
      }
      if (e.type === "goalAchieved") {
        const name = society.lifeGoals.find((g) => g.id === e.id)?.name ?? e.id;
        return [tpl(t.text.goalAchieved, { name })];
      }
      if (e.type === "factLearned") {
        const text = canon.facts.find((f) => f.id === e.id)?.text ?? e.id;
        return [tpl(t.text.factLearned, { text })];
      }
      if (e.type === "loreConnection") {
        const name = canon.events.find((x) => x.id === e.id)?.name ?? e.id;
        return [tpl(t.text.loreConnection, { name })];
      }
      return [];
    });

  const delay = opts.delay ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  /** 鍛冶（タイミング）を手動で遊ぶ。結果は品質とフラグ */
  const playSmithing = async (
    order: Order,
    st: GameState,
  ): Promise<{ quality: number; flags: string[] } | null> => {
    const mg = smithingGame(balance.minigame.smithing);
    let s = mg.init({ skill: st.player.skills[order.kind]?.value ?? 0, seed: st.seed });
    out(tpl(t.text.workStart, { name: order.name, beats: balance.minigame.smithing.beats }));
    for (let i = 0; i < s.beats.length; i++) {
      await delay(balance.minigame.smithing.beatIntervalMs);
      out(tpl(t.text.workBeat, { n: i + 1 }));
      const pressedAt = Date.now();
      const line = await io.read();
      if (line === null) return null;
      const at = (i + 1) * balance.minigame.smithing.beatIntervalMs + (Date.now() - pressedAt);
      s = mg.tick(s, { at } satisfies TimingInput);
    }
    const r = mg.result(s);
    return { quality: r.quality, flags: r.flags };
  };

  /** 盤面の表示（未開=・ 空地=ヒント残り 鉱=◆ 岩=×） */
  const boardLines = (s: BoardState): string[] => {
    const head = "    " + Array.from({ length: s.width }, (_, x) => x + 1).join(" ");
    const rows = Array.from({ length: s.height }, (_, y) => {
      const row = Array.from({ length: s.width }, (_, x) => {
        const c = s.cells[y * s.width + x]!;
        if (!c.revealed) return "・";
        return c.kind === "ore" ? "◆" : c.kind === "rock" ? "×" : "□";
      }).join(" ");
      return `${String(y + 1).padStart(2)}  ${row}`;
    });
    return [head, ...rows];
  };

  /** 採掘（盤面推理）を手動で遊ぶ */
  const playMining = async (
    order: Order,
    st: GameState,
  ): Promise<{ quality: number; flags: string[] } | null> => {
    const mg = miningGame(balance.minigame.mining);
    let s = mg.init({ skill: st.player.skills[order.kind]?.value ?? 0, seed: st.seed });
    out(tpl(t.text.miningStart, { name: order.name }));
    while (!s.done) {
      outAll(boardLines(s));
      const line = await ask(t.text.miningPrompt);
      if (line === null || line.trim().toLowerCase() === "q") return null;
      const [xs, ys] = line.trim().split(",");
      const x = Number.parseInt(xs ?? "", 10);
      const y = Number.parseInt(ys ?? "", 10);
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 1 ||
        y < 1 ||
        x > s.width ||
        y > s.height
      ) {
        out(t.text.invalidInput);
        continue;
      }
      const before = s;
      s = mg.tick(s, { x: x - 1, y: y - 1 });
      const cell = s.cells[(y - 1) * s.width + (x - 1)]!;
      if (cell.kind === "ore" && s.ores > before.ores) {
        out(tpl(t.text.miningOre, { ores: s.ores, total: s.oresTotal }));
      } else if (cell.kind === "rock") {
        out(t.text.miningRock);
      } else if (s.lastHint !== null) {
        out(tpl(t.text.miningHint, { radius: s.hintRadius, n: s.lastHint }));
      }
    }
    if (s.ores >= s.oresTotal && s.rocksHit === 0) out(t.text.miningDone);
    const r = mg.result(s);
    return { quality: r.quality, flags: r.flags };
  };

  /** 交渉（駆け引き）を手動で遊ぶ */
  const playNegotiation = async (
    order: Order,
    st: GameState,
  ): Promise<{ quality: number; flags: string[] } | null> => {
    const cfg = balance.minigame.negotiation;
    const mg = negotiationGame(cfg);
    const topicName = (id: string) => cfg.topics.find((tp) => tp.id === id)?.name ?? id;
    const cardLabel = (c: DealCard) => `${topicName(c.topic)}(力${c.power})`;
    let s = mg.init({ skill: st.player.skills[order.kind]?.value ?? 0, seed: st.seed });
    out(tpl(t.text.negoStart, { name: order.name }));
    while (!s.done) {
      out(
        tpl(t.text.negoHand, {
          cards: s.hand.map((c, i) => `${i + 1})${cardLabel(c)}`).join("  "),
        }),
      );
      out(
        tpl(t.text.negoPreview, {
          preview: s.preview.length ? s.preview.map(cardLabel).join("、") : "―",
        }),
      );
      out(tpl(t.text.negoHp, { player: s.playerHp, opponent: s.opponentHp }));
      const line = await ask(t.text.negoPrompt);
      if (line === null || line.trim().toLowerCase() === "q") return null;
      const idx = Number.parseInt(line.trim(), 10) - 1;
      if (!Number.isFinite(idx) || idx < 0 || idx >= s.hand.length) {
        out(t.text.invalidInput);
        continue;
      }
      s = mg.tick(s, { hand: idx });
    }
    const r = mg.result(s);
    out(r.won ? t.text.negoWon : t.text.negoLost);
    return { quality: r.quality, flags: r.flags };
  };

  // ---- ループ ----
  for (;;) {
    outAll(statusLines(state, cfg, t));

    const canAction = canAct(state.time, cfg.time);
    if (!canAction) out(t.text.mustSleep);
    out(canAction ? t.text.menuActions : t.text.menuSleepOnly);
    const choice = await ask(t.text.promptChoice);
    if (choice === null) return state;
    const c = choice.trim().toLowerCase();
    if (c === "q") {
      out(t.text.quit);
      return state;
    }

    // 行動残が無いときのメニュー番号は別表（1=寝る, 2=休む, 3=目標と認定）
    const pick = canAction ? c : c === "1" ? "sleep" : c === "2" ? "rest" : c === "3" ? "6" : c;

    if (pick === "1") {
      // ---- 訓練 ----
      outAll(skillPickLines(state, t, skillList));
      const si = await ask(t.text.promptChoice);
      if (si === null) return state;
      const idx = Number.parseInt(si.trim(), 10) - 1;
      if (!(idx >= 0 && idx < skillList.length)) {
        out(t.text.invalidInput);
        continue;
      }
      const skill = skillList[idx]!;
      const recommended = Math.round(state.player.skills[skill.id]!.value) + 10;
      const di = await ask(tpl(t.text.difficultyPrompt, { recommended }));
      if (di === null) return state;
      const difficulty = di.trim() === "" ? recommended : Number.parseInt(di.trim(), 10);
      if (!Number.isFinite(difficulty) || difficulty < 0) {
        out(t.text.invalidInput);
        continue;
      }
      const res = step(state, { type: "train", skill: skill.id, difficulty }, cfg);
      state = res.state;
      const gain = res.events.find(
        (e): e is Extract<ActionEvent, { type: "gainApplied" }> => e.type === "gainApplied",
      );
      out(
        tpl(t.text.trainResult, {
          name: skill.name,
          difficulty,
          amount: (gain?.amount ?? 0).toFixed(1),
        }),
      );
      outAll(applyTitles(res.events));
    } else if (pick === "2") {
      // ---- 仕事（注文を選び、手動 or 簡易判定） ----
      out(t.text.orderPick);
      const orderList = orders.orders;
      orderList.forEach((o, i) =>
        out(
          tpl(t.text.orderLine, {
            index: i + 1,
            name: o.name,
            target: o.targetQuality,
            reward: o.rewardMoney,
            kind: skillNames.get(o.kind) ?? o.kind,
          }),
        ),
      );
      const oi = await ask(t.text.promptChoice);
      if (oi === null) return state;
      const order = orderList[Number.parseInt(oi.trim(), 10) - 1];
      if (!order) {
        out(t.text.invalidInput);
        continue;
      }
      const mq = await ask(t.text.workModePrompt);
      if (mq === null) return state;
      const playManual = mq.trim().toLowerCase() === "y";

      let quality: number;
      let flags: string[] | undefined;
      let expFactor: number | undefined;
      if (playManual && order.kind === "smithing") {
        const r = await playSmithing(order, state);
        if (r === null) return state;
        quality = r.quality;
        flags = r.flags;
      } else if (playManual && order.kind === "mining") {
        const r = await playMining(order, state);
        if (r === null) return state;
        quality = r.quality;
        flags = r.flags;
      } else if (playManual && order.kind === "eloquence") {
        const r = await playNegotiation(order, state);
        if (r === null) return state;
        quality = r.quality;
        flags = r.flags;
      } else {
        // 簡易判定（03 §2）：直近5回の同種作品の中央値 ×0.8 / 経験50%
        const hist = state.ledger
          .filter((w) => w.kind === order.kind)
          .slice(-balance.minigame.simpleHistorySize)
          .map((w) => w.quality);
        quality = simpleJudgmentQuality(hist, state.player.skills[order.kind]?.value ?? 0);
        expFactor = balance.minigame.simpleExpFactor;
        out(t.text.workSimple);
      }

      const res = step(
        state,
        {
          type: "work",
          kind: order.kind,
          quality,
          difficulty: order.targetQuality,
          order: order.id,
          flags,
          expFactor,
        },
        cfg,
      );
      state = res.state;
      const gain = res.events.find(
        (e): e is Extract<ActionEvent, { type: "gainApplied" }> => e.type === "gainApplied",
      );
      const tierUp = res.events.find(
        (e): e is Extract<ActionEvent, { type: "tierUp" }> => e.type === "tierUp",
      );
      out(
        tpl(t.text.workResult, {
          name: order.name,
          quality,
          flags: flags?.length ? flags.join("・") : "―",
          amount: (gain?.amount ?? 0).toFixed(1),
        }),
      );
      if (tierUp) out(tpl(t.text.workResultTier, { tier: tierUp.tier }));
      outAll(applyTitles(res.events));
    } else if (pick === "3") {
      // ---- 狩りに出る（周辺エリアで敵と戦う。03 §4） ----
      out(t.text.huntPick);
      enemies.enemies.forEach((e, i) =>
        out(tpl(t.text.huntLine, { index: i + 1, name: e.name, challenge: e.challenge })),
      );
      const ei = await ask(t.text.promptChoice);
      if (ei === null) return state;
      const enemy = enemies.enemies[Number.parseInt(ei.trim(), 10) - 1];
      if (!enemy) {
        out(t.text.invalidInput);
        continue;
      }
      const combatCtx = {
        skill: 0,
        seed: `${state.seed}-combat-${state.counters["action.combat"] ?? 0}`,
      };
      let cs = startCombat(enemy, balance.combat, state.player);
      out(tpl(t.text.combatStart, { name: enemy.name }));
      let printed = 0;
      while (!cs.done) {
        outAll(telegraphLines(cs, enemy, balance.combat));
        out(
          tpl(t.text.combatStatus, {
            playerHp: Math.max(0, cs.playerHp),
            playerMax: cs.playerHpMax,
            enemy: enemy.name,
            enemyHp: Math.max(0, cs.enemyHp),
          }),
        );
        const a = await ask(t.text.combatPrompt);
        if (a === null) return state;
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
        cs = combatTurn(cs, act, enemy, balance.combat, combatCtx);
        for (const e of cs.log.slice(printed)) out(`\u3000${e.text}`);
        printed = cs.log.length;
      }
      const r = combatResult(cs);
      const res = step(
        state,
        {
          type: "combat",
          enemyId: enemy.id,
          difficulty: enemy.challenge,
          won: r.won,
          fled: r.fled,
          died: r.died,
        },
        cfg,
      );
      state = res.state;
      if (r.won) out(tpl(t.text.combatWon, { name: enemy.name }));
      else if (r.fled) out(t.text.combatFled);
      else out(t.text.combatLost);
      for (const e of res.events) {
        if (e.type === "gainApplied" && e.amount > 0) {
          out(
            tpl(t.text.combatGain, {
              skill: skillNames.get(e.skill) ?? e.skill,
              amount: e.amount.toFixed(1),
            }),
          );
        }
      }
      outAll(applyTitles(res.events));
    } else if (pick === "4" || pick === "rest") {
      // ---- 休む（自宅。その日を終える） ----
      out(t.text.restDone);
      const res = step(state, { type: "rest" }, cfg);
      state = res.state;
      const report = res.events.find(
        (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
      );
      if (report) {
        outAll(wakeBlock(report.report, applyTitles(res.events), t, skillNames, { atHome: true }));
      }
      save(state);
      out(t.text.wake.saved);
    } else if (pick === "5" || pick === "sleep") {
      // ---- 寝る（宿・夕食を選ぶ） ----
      const withDinner = true;
      outAll(innPickLines(t, (inn) => sleepQuality(inn, withDinner, cfg.sleep)));
      const ii = await ask(t.text.promptChoice);
      if (ii === null) return state;
      const inn = INN_ORDER[Number.parseInt(ii.trim(), 10) - 1];
      if (!inn) {
        out(t.text.invalidInput);
        continue;
      }
      const dq = await ask(t.text.dinnerPrompt);
      if (dq === null) return state;
      const dinner = dq.trim().toLowerCase() === "y";
      const res = step(state, { type: "sleep", inn, dinner }, cfg);
      state = res.state;
      const report = res.events.find(
        (e): e is Extract<ActionEvent, { type: "wakeReport" }> => e.type === "wakeReport",
      );
      if (report?.report.overwork.became) out(t.text.overworkBecame);
      if (report) outAll(wakeBlock(report.report, applyTitles(res.events), t, skillNames));
      save(state);
      out(t.text.wake.saved);
    } else if (pick === "6") {
      // ---- 目標と認定（03 §1：立場×職業、人生目標の宣言） ----
      const soc = state.society;
      const standingName =
        society.standings.find((s) => s.id === soc.standing)?.name ?? soc.standing;
      const profName =
        soc.profession === null
          ? "なし"
          : (society.professions.find((p) => p.id === soc.profession)?.name ?? soc.profession);
      const goalName =
        soc.goal === null
          ? "なし"
          : (society.lifeGoals.find((g) => g.id === soc.goal)?.name ?? soc.goal);
      out(
        tpl(t.text.societyHeader, {
          standing: standingName,
          profession: profName,
          goal: goalName,
        }),
      );
      // 打診の受諾
      if (soc.pendingOffers.length === 0) {
        out(t.text.societyNoOffers);
      } else {
        for (let i = 0; i < soc.pendingOffers.length; i++) {
          const id = soc.pendingOffers[i]!;
          const name =
            society.standings.find((s) => s.id === id)?.name ??
            society.professions.find((p) => p.id === id)?.name ??
            id;
          const kind = society.standings.some((s) => s.id === id) ? "立場" : "職業";
          out(tpl(t.text.societyOfferLine, { i: i + 1, name, kind }));
        }
        const oi = await ask(t.text.promptChoice);
        if (oi === null) return state;
        const oiN = Number.parseInt(oi.trim(), 10) - 1;
        if (oiN >= 0 && oiN < soc.pendingOffers.length) {
          const id = soc.pendingOffers[oiN]!;
          const res = step(state, { type: "acceptOffer", id }, cfg);
          state = res.state;
          const name =
            society.standings.find((s) => s.id === id)?.name ??
            society.professions.find((p) => p.id === id)?.name ??
            id;
          out(tpl(t.text.societyAccepted, { name }));
          save(state);
          continue;
        }
      }
      // 人生目標の宣言（いま手が届きそうなもの3つを提示）
      const suggestions = suggestGoals(state, cfg.society, 3);
      out(t.text.societyGoalsHeader);
      if (suggestions.length === 0) {
        out(t.text.societyNoGoal);
      } else {
        for (let i = 0; i < suggestions.length; i++) {
          out(tpl(t.text.societyGoalLine, { i: i + 1, name: suggestions[i]!.name }));
        }
        const gi = await ask(t.text.promptChoice);
        if (gi === null) return state;
        const giN = Number.parseInt(gi.trim(), 10) - 1;
        if (giN >= 0 && giN < suggestions.length) {
          const goal = suggestions[giN]!;
          const res = step(state, { type: "declareGoal", id: goal.id }, cfg);
          state = res.state;
          out(tpl(t.text.societyDeclared, { name: goal.name }));
          save(state);
        }
      }
    } else if (pick === "7" && canAction) {
      // ---- 見聞録を読む（07 §3：アトムを読み、事実が繋がる） ----
      out(
        tpl(t.text.loreListHeader, {
          read: state.lore.read.length,
          total: atoms.length,
          facts: state.lore.facts.length,
        }),
      );
      if (atoms.length === 0) {
        out(t.text.loreNone);
      } else {
        for (let i = 0; i < atoms.length; i++) {
          const a = atoms[i]!;
          const mark = state.lore.read.includes(a.id) ? "読" : "未";
          out(tpl(t.text.loreLine, { i: i + 1, mark, title: a.title }));
        }
        const li = await ask(t.text.promptChoice);
        if (li === null) return state;
        const liN = Number.parseInt(li.trim(), 10) - 1;
        if (liN >= 0 && liN < atoms.length) {
          const a = atoms[liN]!;
          if (state.lore.read.includes(a.id)) {
            out(tpl(t.text.loreRead, { title: a.title, text: a.text }));
            continue;
          }
          const res = step(state, { type: "readAtom", id: a.id }, cfg);
          state = res.state;
          out(tpl(t.text.loreRead, { title: a.title, text: a.text }));
          outAll(applyTitles(res.events));
          save(state);
        }
      }
    } else {
      out(t.text.invalidInput);
    }
  }
}
