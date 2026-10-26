import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  canAct,
  deserialize,
  newGame,
  serialize,
  sleepQuality,
  step,
  type ActionEvent,
  type GameState,
  type InnRank,
  type StepConfig,
} from "@trace/core";
import { balance, cliText, skills, titles } from "@trace/content";
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

  const applyTitles = (events: ActionEvent[]): string[] =>
    events
      .filter((e): e is Extract<ActionEvent, { type: "titleGained" }> => e.type === "titleGained")
      .map((e) => titleMessage(e.id, t));

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

    // 行動残が無いときのメニュー番号は別表（1=寝る, 2=休む）
    const pick = canAction ? c : c === "1" ? "sleep" : c === "2" ? "rest" : c;

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
    } else if (pick === "2" || pick === "rest") {
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
    } else if (pick === "3" || pick === "sleep") {
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
    } else {
      out(t.text.invalidInput);
    }
  }
}
