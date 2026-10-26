import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  abyssRunSeed,
  appraisalGame,
  canAct,
  canFightUnique,
  combatResult,
  combatTurn,
  deserialize,
  endRun,
  floorEnemy,
  killFloor,
  spendLight,
  startRun,
  enhancedEnemy,
  deserializeChronicle,
  emptyChronicle,
  fishingGame,
  hasLifeRecord,
  heirGenerationOf,
  legacyOf,
  miningGame,
  negotiationGame,
  newGame,
  nextWorldSeed,
  performanceGame,
  recordLife,
  succeedLife,
  rivalsOf,
  serialize,
  serializeChronicle,
  simpleJudgmentQuality,
  sleepQuality,
  smithingGame,
  step,
  type ActionEvent,
  type BoardInput,
  type BoardState,
  type Chronicle,
  type DealCard,
  type GameState,
  type CombatAction,
  type CombatState,
  type Legacy,
  type LifeCause,
  type MiniGame,
  type StepConfig,
  type StepResult,
  type TimingInput,
  type TimingState,
} from "@trace/core";
import {
  activeBookEffects,
  activeEffects,
  biographyMaterial,
  createRng,
  damageFactor,
  isSkillUnlocked,
  reachedPinnacles,
  startCombat,
  TENDENCY_IDS,
  telegraphLines,
  TemplateProvider,
  withWorldMods,
  worldFactor,
  worldMods,
  type NarrationProvider,
  type TendencyId,
  type Work,
} from "@trace/core";
import {
  balance,
  canon,
  cliText,
  narration,
  enemies,
  enemiesByArea,
  orders,
  origins,
  pinnacles,
  rivals,
  skills,
  society,
  titles,
  vows,
  type EnemyJson,
  type Order,
  type Origin,
} from "@trace/content";
import { stepConfig } from "../config.js";
import type { CliIo } from "./io.js";
import { innPickLines, skillPickLines, statusLines, tpl, wakeBlock } from "./render.js";
import { booksMenu, loreMenu, mentorMenu, recordsMenu, societyMenu } from "./menus.js";
import { specialOrderOf, type SpecialOrder } from "./town.js";

export interface PlayCliOptions {
  io: CliIo;
  /** 既定: ~/.trace/save.json（環境変数 TRACE_SAVE_PATH で上書き可） */
  savePath?: string;
  /** 既定: ~/.trace/chronicle.json（環境変数 TRACE_CHRONICLE_PATH で上書き可）。年代記はセーブと別領域（T-38） */
  chroniclePath?: string;
  /** 新規開始時のシード。既定: 環境変数 TRACE_SEED か "TRACE-M0" */
  seed?: string;
  /** テスト用に依存を差し替える口（既定: balance/content/stepConfig） */
  cfg?: StepConfig;
  /** ミニゲームの拍の待機（既定: 実時間。テストでは即時を渡す） */
  delay?: (ms: number) => Promise<void>;
  /** 語り層（07 §6。既定: TemplateProvider。LLM実装への差し替え口） */
  narrator?: NarrationProvider;
}

function defaultSavePath(): string {
  return process.env.TRACE_SAVE_PATH ?? join(homedir(), ".trace", "save.json");
}

function defaultChroniclePath(): string {
  return process.env.TRACE_CHRONICLE_PATH ?? join(homedir(), ".trace", "chronicle.json");
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
  const skillList = skills.skills.map((s) => ({ id: s.id, name: s.name, unlock: s.unlock }));
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

  // ---- 年代記（T-38。周回をまたぐのでセーブとは別領域・別バージョンのファイル） ----
  const chroniclePath = opts.chroniclePath ?? defaultChroniclePath();
  const loadChronicleFile = (): Chronicle => {
    if (!existsSync(chroniclePath)) return emptyChronicle();
    try {
      return deserializeChronicle(readFileSync(chroniclePath, "utf8"));
    } catch {
      return emptyChronicle();
    }
  };
  let chronicle = loadChronicleFile();
  const saveChronicle = (c: Chronicle) => {
    mkdirSync(dirname(chroniclePath), { recursive: true });
    writeFileSync(chroniclePath, serializeChronicle(c));
  };

  // ---- 開始：セーブがあれば続きから選べる ----
  out(t.text.banner);
  out(t.text.intro);
  if (chronicle.lives.length > 0) {
    out(tpl(t.text.chronicleLives, { count: chronicle.lives.length }));
  }
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
  /** 出自を選ぶ（新規・転生の両方で使う）。EOF は先頭の出自に倒す */
  const pickOrigin = async (): Promise<Origin> => {
    out(t.text.originPick);
    origins.origins.forEach((o, i) =>
      out(tpl(t.text.originLine, { index: i + 1, name: o.name, desc: o.desc })),
    );
    const oa = await ask(t.text.promptChoice);
    const oi = Math.max(
      0,
      Math.min(origins.origins.length - 1, (parseInt(oa ?? "1", 10) || 1) - 1),
    );
    const origin = origins.origins[oi]!;
    out(tpl(t.text.originChosen, { name: origin.name }));
    return origin;
  };

  /** 運命の傾向を選ぶ（T-45、06 §3C。新規・転生の両方で使う）。空/EOF は calm（既定）に倒す */
  const pickTendency = async (): Promise<TendencyId> => {
    out(t.text.tendencyPick);
    TENDENCY_IDS.forEach((id, i) =>
      out(
        tpl(t.text.tendencyLine, {
          index: i + 1,
          name: t.display.tendencyNames[id] ?? id,
          desc: t.display.tendencyDescs[id] ?? "",
        }),
      ),
    );
    const ta = await ask(t.text.promptChoice);
    const ti = Math.max(0, Math.min(TENDENCY_IDS.length - 1, (parseInt(ta ?? "1", 10) || 1) - 1));
    const tendency = TENDENCY_IDS[ti]!;
    out(tpl(t.text.tendencyChosen, { name: t.display.tendencyNames[tendency] ?? tendency }));
    return tendency;
  };

  /** 誓約を選ぶ（T-46、06 §3C。番号をカンマ区切りで任意個。空/EOF は誓約なし） */
  const pickVows = async (): Promise<string[]> => {
    out(t.text.vowPick);
    vows.vows.forEach((v, i) =>
      out(tpl(t.text.vowLine, { index: i + 1, name: v.name, desc: v.desc })),
    );
    const va = await ask(t.text.promptChoice);
    if (va === null || va.trim() === "") return [];
    const picked = [
      ...new Set(
        va
          .split(/[、,\s]+/)
          .map((s) => Number.parseInt(s, 10) - 1)
          .filter((i) => i >= 0 && i < vows.vows.length)
          .map((i) => vows.vows[i]!.id),
      ),
    ];
    if (picked.length > 0) {
      const names = picked.map((id) => vows.vows.find((v) => v.id === id)?.name ?? id).join("、");
      out(tpl(t.text.vowChosen, { names }));
    }
    return picked;
  };

  /** 新しい周の GameState を作る（新規・転生で共通の初期値） */
  const startLife = (
    seed2: string,
    origin: Origin,
    legacy?: Legacy,
    fate?: { tendency: TendencyId; vows: string[] },
  ): GameState =>
    newGame(seed2, t.text.playerName, {
      skillIds: skillList.map((s) => s.id),
      initialPotential: balance.player.initialPotential,
      origin,
      potentialInitMin: balance.player.potentialInitMin,
      potentialInitMax: balance.player.potentialInitMax,
      initialStatValue: balance.player.initialStatValue,
      initialMoney: balance.player.initialMoney,
      ...(legacy !== undefined ? { legacy } : {}),
      ...(fate !== undefined ? { tendency: fate.tendency, vows: fate.vows } : {}),
    });

  /** 称号ID → 表示名 */
  const titleName = (id: string): string => titles.titles.find((x) => x.id === id)?.name ?? id;

  if (!state) {
    // 出自を選ぶ（素質の初期値 80〜130 に幅が出る。02：出自）
    // その世の運命の傾向（T-45）と自ら課す誓約（T-46）もここで決める
    const origin = await pickOrigin();
    const fate = { tendency: await pickTendency(), vows: await pickVows() };
    state = startLife(seed, origin, undefined, fate);
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
      // 強個体の討伐（T-44）：図鑑に刻んだ旨を1行出す
      if (e.type === "uniqueDefeated") {
        const name = enemies.enemies.find((x) => x.id === e.enemyId)?.name ?? e.enemyId;
        return [tpl(t.text.uniqueDefeated, { name })];
      }
      // 頂点ルートの段（T-41）：通知文は pinnacles.json 側に書かれている
      if (e.type === "pinnacleStageReached") {
        const notice = pinnacles.pinnacles
          .find((r) => r.id === e.route)
          ?.stages.find((s) => s.id === e.stage)?.notice;
        return [notice ?? `――頂点への段《${e.stage}》に至りました。`];
      }
      if (e.type === "skillUnlocked") {
        const name = skillNames.get(e.id) ?? e.id;
        return [tpl(t.text.skillUnlocked, { name })];
      }
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
      // 老衰死（T-36）：起床ログのあとに1行出す。老いの兆候（oldAgeSign）は
      // report.surprises に既出なのでここでは行を出さない
      if (e.type === "deathByAge") return [tpl(t.text.deathByAge, { age: e.age })];
      return [];
    });

  // 語り層（07 §6）：文章だけを返す。ゲーム結果は core が先に決めている
  const narrator = opts.narrator ?? new TemplateProvider(narration);
  /** 作品の表示名：注文名（特別注文は元の注文名）＞スキル名の順で解決する */
  const workName = (w: Work): string => {
    const orderId = w.order?.split("#")[0];
    return orderId
      ? (orders.orders.find((o) => o.id === orderId)?.name ?? w.order ?? w.kind)
      : (skillNames.get(w.kind) ?? w.kind);
  };
  /** 伝記（T-37）：素材は core が摘み、表示名はここで解決する。cause 省略時は閉じ行を出さない */
  const bioLines = (st: GameState, cause?: "retire" | "death"): string[] => {
    const m = biographyMaterial(st, cfg.pinnacles);
    const titleNames = m.titleIds
      .map((id) => titles.titles.find((x) => x.id === id)?.name ?? id)
      .join("、");
    const goalNames = m.achievedGoalIds
      .map((id) => society.lifeGoals.find((g) => g.id === id)?.name ?? id)
      .join("、");
    // 頂点ルート名（T-41）：達成したルートの表示名を繋ぐ
    const pinnacleNames = m.pinnacleIds
      .map((id) => pinnacles.pinnacles.find((r) => r.id === id)?.name ?? id)
      .join("、");
    return narrator.narrate(
      {
        scene: "biography",
        name: m.name,
        days: m.days,
        deeds: m.deeds,
        origin: origins.origins.find((o) => o.id === m.originId)?.name ?? m.originId,
        standing: society.standings.find((s) => s.id === m.standingId)?.name ?? m.standingId,
        ...(m.professionId !== null
          ? {
              profession:
                society.professions.find((p) => p.id === m.professionId)?.name ?? m.professionId,
            }
          : {}),
        ...(titleNames !== "" ? { titles: titleNames } : {}),
        ...(goalNames !== "" ? { goals: goalNames } : {}),
        ...(m.bestWork !== null
          ? {
              work: {
                name: workName(m.bestWork),
                quality: m.bestWork.quality,
                tier: m.bestWork.tier,
              },
            }
          : {}),
        ...(m.peakSkill !== null
          ? {
              peakSkill: {
                name: skillNames.get(m.peakSkill.id) ?? m.peakSkill.id,
                value: Math.round(m.peakSkill.value * 10) / 10,
              },
            }
          : {}),
        ...(pinnacleNames !== "" ? { pinnacle: pinnacleNames } : {}),
        ...(cause !== undefined ? { cause } : {}),
      },
      // 同じ死には同じ伝記（通算死亡数でシードを分ける）
      createRng(`${seed}:bio:${st.seed}:${m.days}:${m.deaths}`),
    );
  };

  /** died イベントがあれば年代記に追記する（戦闘死＝蘇生する死。老衰死・引退は reincarnate 側で刻む。T-40） */
  const noteDeath = (res: StepResult): boolean => {
    if (!res.events.some((e) => e.type === "died")) return false;
    // 老衰（T-36 の deathByAge）は死因として区別して残す
    const cause: LifeCause = res.events.some((e) => e.type === "deathByAge") ? "oldAge" : "death";
    chronicle = recordLife(chronicle, res.state, cause, {
      titleDefs: cfg.titles,
      // 頂点に至ったルートの記録（T-41。伝記とは別に構造化して残す）
      pinnacles: reachedPinnacles(res.state, cfg.pinnacles ?? []),
      // 表示した伝記と同じものを年代記にも残す（06 §1：伝記 → 年代記の順）
      biography: bioLines(res.state, "death").join("\n"),
    });
    saveChronicle(chronicle);
    return true;
  };

  const newspaper = (events: ActionEvent[]): string[] => {
    const slept = events.find(
      (e): e is Extract<ActionEvent, { type: "slept" }> => e.type === "slept",
    );
    const day = slept?.from.day ?? 0;
    const deeds = state!.actionLog.filter((a) => a.day === day).map((a) => a.kind);
    // 台帳由来の記事：その日に記録された作品を新聞の材料にする（03 §5）。
    // 表示名は注文名（特別注文は元の注文名）＞スキル名の順で解決する
    const works = state!.ledger
      .filter((w) => w.day === day)
      .map((w) => ({ name: workName(w), quality: w.quality, tier: w.tier }));
    const deaths = state!.counters["death.count"] ?? 0;
    // 前世の伝説（T-42）：年代記が非空なら最新の人生の名・二つ名が噂に混ざる
    const lastLife = chronicle.lives[chronicle.lives.length - 1];
    const prevLife =
      lastLife === undefined
        ? undefined
        : {
            name: lastLife.name,
            epithet:
              lastLife.epithet === undefined
                ? undefined
                : (titles.titles.find((x) => x.id === lastLife.epithet)?.name ?? lastLife.epithet),
          };
    const title = events.find(
      (e): e is Extract<ActionEvent, { type: "titleGained" }> =>
        e.type === "titleGained" && !e.suppressed,
    );
    const offer = events.find(
      (e): e is Extract<ActionEvent, { type: "offerReceived" }> => e.type === "offerReceived",
    );
    // ライバルの噂（T-47）：ランキングの筆頭ライバルが話題に混ざる
    const topRival = rivalsOf(state!, rivals, balance.rivals).entries.find((e) => !e.isPlayer);
    return narrator.narrate(
      {
        scene: "newspaper",
        deeds,
        works,
        deaths,
        ...(prevLife !== undefined ? { prevLife } : {}),
        ...(topRival !== undefined ? { rival: topRival } : {}),
        ...(title
          ? { newTitle: titles.titles.find((x) => x.id === title.id)?.name ?? title.id }
          : {}),
        ...(offer
          ? {
              newOffer:
                society.standings.find((s) => s.id === offer.id)?.name ??
                society.professions.find((p) => p.id === offer.id)?.name ??
                offer.id,
            }
          : {}),
      },
      createRng(`${seed}:news:${day}`),
    );
  };

  const delay = opts.delay ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  /** タイミング系の皮（鍛冶・演奏・釣り）を手動で遊ぶ。結果は品質とフラグ */
  const playTiming = async (
    order: Order,
    st: GameState,
    skin: {
      game: MiniGame<TimingInput, TimingState, { quality: number; flags: string[] }>;
      intervalMs: number;
      start: string;
      beat: string;
    },
  ): Promise<{ quality: number; flags: string[] } | null> => {
    let s = skin.game.init({ skill: st.player.skills[order.kind]?.value ?? 0, seed: st.seed });
    out(tpl(skin.start, { name: order.name, beats: s.beats.length }));
    for (let i = 0; i < s.beats.length; i++) {
      await delay(skin.intervalMs);
      out(tpl(skin.beat, { n: i + 1 }));
      const pressedAt = Date.now();
      const line = await io.read();
      if (line === null) return null;
      const at = (i + 1) * skin.intervalMs + (Date.now() - pressedAt);
      s = skin.game.tick(s, { at } satisfies TimingInput);
    }
    const r = skin.game.result(s);
    return { quality: r.quality, flags: r.flags };
  };

  /** 注文の kind → タイミング系の皮（ゲーム本体と拍の間隔・演出文） */
  const timingSkin = (kind: string) => {
    if (kind === "smithing")
      return {
        game: smithingGame(balance.minigame.smithing),
        intervalMs: balance.minigame.smithing.beatIntervalMs,
        start: t.text.workStart,
        beat: t.text.workBeat,
      };
    if (kind === "performance")
      return {
        game: performanceGame(balance.minigame.performance),
        intervalMs: balance.minigame.performance.beatIntervalMs,
        start: t.text.performanceStart,
        beat: t.text.performanceBeat,
      };
    if (kind === "fishing")
      return {
        game: fishingGame(balance.minigame.fishing),
        intervalMs: balance.minigame.fishing.beatIntervalMs,
        start: t.text.fishingStart,
        beat: t.text.fishingBeat,
      };
    return null;
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

  /** 盤面推理系の皮（採掘・鑑定）を手動で遊ぶ */
  const playBoard = async (
    order: Order,
    st: GameState,
    skin: {
      game: MiniGame<BoardInput, BoardState, { quality: number; flags: string[] }>;
      text: {
        start: string;
        prompt: string;
        found: string;
        hint: string;
        miss: string;
        done: string;
      };
    },
  ): Promise<{ quality: number; flags: string[] } | null> => {
    let s = skin.game.init({ skill: st.player.skills[order.kind]?.value ?? 0, seed: st.seed });
    out(tpl(skin.text.start, { name: order.name }));
    while (!s.done) {
      outAll(boardLines(s));
      const line = await ask(skin.text.prompt);
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
      s = skin.game.tick(s, { x: x - 1, y: y - 1 } satisfies BoardInput);
      const cell = s.cells[(y - 1) * s.width + (x - 1)]!;
      if (cell.kind === "ore" && s.ores > before.ores) {
        out(tpl(skin.text.found, { ores: s.ores, found: s.ores, total: s.oresTotal }));
      } else if (cell.kind === "rock") {
        out(skin.text.miss);
      } else if (s.lastHint !== null) {
        out(tpl(skin.text.hint, { radius: s.hintRadius, n: s.lastHint }));
      }
    }
    if (s.ores >= s.oresTotal && s.rocksHit === 0) out(skin.text.done);
    const r = skin.game.result(s);
    return { quality: r.quality, flags: r.flags };
  };

  /** 注文の kind → 盤面推理系の皮（ゲーム本体と演出文の組） */
  const boardSkin = (kind: string) => {
    if (kind === "mining")
      return {
        game: miningGame(balance.minigame.mining),
        text: {
          start: t.text.miningStart,
          prompt: t.text.miningPrompt,
          found: t.text.miningOre,
          hint: t.text.miningHint,
          miss: t.text.miningRock,
          done: t.text.miningDone,
        },
      };
    if (kind === "appraisal")
      return {
        game: appraisalGame(balance.minigame.appraisal),
        text: {
          start: t.text.appraisalStart,
          prompt: t.text.appraisalPrompt,
          found: t.text.appraisalFound,
          hint: t.text.appraisalHint,
          miss: t.text.appraisalMiss,
          done: t.text.appraisalDone,
        },
      };
    return null;
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

  /** サブメニューに渡す共有コンテキスト（menus.ts） */
  const menuCtx = {
    out,
    outAll,
    ask,
    cfg,
    t,
    save,
    applyTitles: (events: ActionEvent[]) => applyTitles(events),
    bio: bioLines,
    /** 現在の年代記（T-38。街の記録から眺める） */
    chronicle: () => chronicle,
  };

  /** 遺物の表示名（name は注文IDかスキルIDなので表示名に解決する） */
  const artifactName = (a: { name: string; kind: string }): string =>
    orders.orders.find((o) => o.id === a.name.split("#")[0])?.name ??
    skillNames.get(a.name) ??
    skillNames.get(a.kind) ??
    a.name;

  /**
   * 一生の終わり（06 §1「伝記 → 年代記 → 継承 → 転生」。T-40）。
   * cause は retire（引退）か oldAge（老衰）。戦闘死は蘇生するのでここには来ない。
   * 戻り値は新しい周の GameState（旧セーブはそのまま新しい周に置き換わる）。
   * 途中の入力が尽きても自動選択に倒し、必ず新しい周を返す
   */
  const reincarnate = async (st: GameState, cause: "retire" | "oldAge"): Promise<GameState> => {
    // 伝記（語り層の cause 語彙は retire/death だけ。老衰は death に倒す）。
    // 次代を継ぐ道でも前代の記録として同じ伝記がその場に残る（T-48）
    const bio = bioLines(st, cause === "retire" ? "retire" : "death");
    outAll(bio);

    // 生の継ぎ方を選ぶ（T-48）：転生（新しい世界・強い継承）か次代（同じ世界・弱い継承）か。
    // 空/EOF は転生に倒す
    out(t.text.heirWayPick);
    out(t.text.heirWayRebirth);
    out(t.text.heirWayHeir);
    const way = await ask(t.text.promptChoice);

    if (way !== null && way.trim() === "2") {
      // ---- 次代を継ぐ（T-48、06 §1）：同じ世界 seed で新キャラを始める ----
      // 同じ世界なので年代記には追記しない（recordLife は呼ばない）。前代の記録は
      // 上で表示した伝記が担う。世界が同じなので傾向は前世のものを継ぎ、
      // 誓約だけは生ごとの選択として選び直す（D-38）
      const heirOrigin = await pickOrigin();
      const heirVows = await pickVows();
      const {
        state: next,
        kind,
        legacy: inherited,
      } = succeedLife(
        st,
        t.text.playerName,
        {
          skillIds: skillList.map((s) => s.id),
          initialPotential: balance.player.initialPotential,
          origin: heirOrigin,
          potentialInitMin: balance.player.potentialInitMin,
          potentialInitMax: balance.player.potentialInitMax,
          initialStatValue: balance.player.initialStatValue,
          initialMoney: balance.player.initialMoney,
          tendency: st.tendency,
          vows: heirVows,
        },
        balance.heir,
      );
      save(next);
      out(
        tpl(t.text.heirStart, {
          kind: t.display.heirKindNames[kind] ?? kind,
          gen: heirGenerationOf(next),
        }),
      );
      out(t.text.heirNoChronicle);
      const heirBonus = Object.entries(inherited.potentialBonus)
        .map(([id, v]) => `《${skillNames.get(id) ?? id}》+${v}`)
        .join("、");
      if (heirBonus !== "") out(tpl(t.text.heirPotential, { skills: heirBonus }));
      return next;
    }

    // 年代記に1頁。同じ一生の重複記録は書かない（中断→再生で同じ終わりが再び来ても安全）
    if (!hasLifeRecord(chronicle, st, cause)) {
      chronicle = recordLife(chronicle, st, cause, {
        titleDefs: cfg.titles,
        // 頂点に至ったルートの記録（T-41。伝記とは別に構造化して残す）
        pinnacles: reachedPinnacles(st, cfg.pinnacles ?? []),
        // 表示した伝記と同じものを年代記にも残す（06 §1：伝記 → 年代記の順）
        biography: bio.join("\n"),
      });
      saveChronicle(chronicle);
    }
    out(t.text.chronicleRecorded);
    // 二つ名は記録時に自動で選ばれている（最上位ランクのうち最後に得たもの）。
    // この一生の頁から読む（冪等スキップ済みでも確実に同じ頁を見る）
    const epithet = [...chronicle.lives]
      .reverse()
      .find((l) => l.worldSeed === st.seed && l.cause === cause)?.epithet;
    if (epithet !== undefined) out(tpl(t.text.rebirthEpithet, { name: titleName(epithet) }));

    // 継承（06 §2）：「前世の記憶」の称号と遺物1個を選ぶ。空/EOF は自動選択に倒す
    out(t.text.legacyHeader);
    let rememberedTitles: string[] | undefined;
    if (st.titles.length === 0) {
      out(t.text.legacyNoTitles);
    } else {
      out(tpl(t.text.legacyTitlesPrompt, { max: balance.legacy.rememberedMax }));
      st.titles.forEach((id, i) =>
        out(tpl(t.text.legacyTitleLine, { i: i + 1, name: titleName(id) })),
      );
      const ti = await ask(t.text.promptChoice);
      if (ti !== null && ti.trim() !== "") {
        rememberedTitles = [
          ...new Set(
            ti
              .split(/[、,\s]+/)
              .map((s) => Number.parseInt(s, 10) - 1)
              .filter((i) => i >= 0 && i < st.titles.length)
              .map((i) => st.titles[i]!),
          ),
        ].slice(0, balance.legacy.rememberedMax);
      }
    }
    let artifactId: string | undefined;
    if (st.ledger.length === 0) {
      out(t.text.legacyNoArtifact);
    } else {
      // 候補は品質上位から5件（自動選択と同じ順位付け）
      const top = [...st.ledger]
        .sort((a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day)
        .slice(0, 5);
      out(t.text.legacyArtifactPrompt);
      top.forEach((w, i) =>
        out(
          tpl(t.text.legacyArtifactLine, {
            i: i + 1,
            name: workName(w),
            quality: w.quality,
            tier: w.tier,
            day: w.day + 1,
          }),
        ),
      );
      const ai = await ask(t.text.promptChoice);
      if (ai !== null && ai.trim() !== "") {
        const n = Number.parseInt(ai.trim(), 10) - 1;
        if (n >= 0 && n < top.length) artifactId = top[n]!.id;
      }
    }
    const legacy = legacyOf(st, balance.legacy, {
      titleDefs: cfg.titles,
      ...(rememberedTitles !== undefined ? { rememberedTitles } : {}),
      ...(artifactId !== undefined ? { artifactId } : {}),
    });

    // 転生：新しいシードの世界へ（旧セーブは新しい周に置き換わる）。
    // 生まれ変わった世の傾向と新たな誓約もここで選ぶ（T-45/T-46）
    const nextOrigin = await pickOrigin();
    const next = startLife(nextWorldSeed(st), nextOrigin, legacy, {
      tendency: await pickTendency(),
      vows: await pickVows(),
    });
    save(next);
    out(t.text.rebirthStart);
    const bonus = Object.entries(legacy.potentialBonus)
      .map(([id, v]) => `《${skillNames.get(id) ?? id}》+${v}`)
      .join("、");
    if (bonus !== "") out(tpl(t.text.rebirthPotential, { skills: bonus }));
    if (legacy.rememberedTitles.length > 0) {
      out(tpl(t.text.rebirthMemory, { titles: legacy.rememberedTitles.map(titleName).join("、") }));
    }
    if (legacy.artifact !== null) {
      out(tpl(t.text.rebirthArtifact, { name: artifactName(legacy.artifact) }));
    }
    return next;
  };

  /**
   * CT戦闘を対話的に回す（狩り・深層の共通部品）。
   * seed は逃走判定などの乱数源（狩りは日付×行動、深層はラン×層で別々に与える）。
   * opts.spend はプレイヤー行動ごとの消費（深層の灯り）。opts.aborted() が true なら
   * 未決着のまま打ち切る（灯り切れ）。戻り値は最終 CombatState。EOF なら null
   */
  const fightEnemy = async (
    enemy: EnemyJson,
    seed: string,
    st: GameState,
    opts?: { spend?: () => void; aborted?: () => boolean },
  ): Promise<CombatState | null> => {
    // 称号・認定職・師匠・読了書物の与ダメージ効果（T-35・T-27・T-26。例《百狼斬り》の damageVs.wolf）
    const atkFactor = damageFactor(
      [
        ...activeEffects(st, cfg.titles, cfg.society.professions, cfg.mentors?.mentors),
        ...activeBookEffects(st, cfg.books),
      ],
      enemy.id,
    );
    // 運命の傾向・誓約の世界補正（T-45/T-46）：戦乱の世や強敵の誓で敵の基礎値が上がる。
    // 攻撃側の傾向効果（workGainFactor など）は step 側のゲイン経路に乗る
    const worldEnemy = withWorldMods(enemy, worldMods(st, balance.tendency, vows.vows));
    let cs = startCombat(worldEnemy, balance.combat, st.player, atkFactor);
    out(tpl(t.text.combatStart, { name: enemy.name }));
    let printed = 0;
    while (!cs.done && !(opts?.aborted?.() ?? false)) {
      outAll(telegraphLines(cs, worldEnemy, balance.combat));
      out(
        tpl(t.text.combatStatus, {
          playerHp: Math.max(0, cs.playerHp),
          playerMax: cs.playerHpMax,
          enemy: enemy.name,
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
  };

  // ---- ループ ----
  for (;;) {
    // 老衰したまま残ったセーブは転生フローから再開する（T-40・D-31。
    // T-40 以前に死んだセーブもここで年代記に刻んでから新しい周へ）
    if (state.counters["death.oldAge"] !== undefined) {
      state = await reincarnate(state, "oldAge");
      continue;
    }
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

    // 行動残が無いときのメニュー番号は別表（1=寝る, 2=休む, 3=目標と認定, 4=街の記録, 5=書店, 6=師匠, 7=引退）
    const pick = canAction
      ? c
      : c === "1"
        ? "sleep"
        : c === "2"
          ? "rest"
          : c === "3"
            ? "6"
            : c === "4"
              ? "8"
              : c === "5"
                ? "9"
                : c === "6"
                  ? "10"
                  : c === "7"
                    ? "11"
                    : c;

    if (pick === "1") {
      // ---- 訓練（派生スキルは解放済みだけ出す）----
      const cur = state;
      const avail = skillList.filter((s) => isSkillUnlocked(cur, s));
      outAll(skillPickLines(state, t, avail));
      const si = await ask(t.text.promptChoice);
      if (si === null) return state;
      const idx = Number.parseInt(si.trim(), 10) - 1;
      if (!(idx >= 0 && idx < avail.length)) {
        out(t.text.invalidInput);
        continue;
      }
      const skill = avail[idx]!;
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
      // 日替わりの特別注文（街の出来事。シード×日付で決定的に出る）
      const special = specialOrderOf(state.seed, state.time.day);
      if (special) out(t.text.specialOrder);
      const orderList = special ? [...orders.orders, special] : orders.orders;
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
      const tSkin = playManual ? timingSkin(order.kind) : null;
      const bSkin = playManual ? boardSkin(order.kind) : null;
      if (tSkin) {
        const r = await playTiming(order, state, tSkin);
        if (r === null) return state;
        quality = r.quality;
        flags = r.flags;
      } else if (bSkin) {
        const r = await playBoard(order, state, bSkin);
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

      // 特別注文は経験係数が上乗せされる
      if ("special" in order && order.special === true) {
        expFactor = (expFactor ?? 1) * (order as SpecialOrder).expFactor;
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
          rewardMoney: order.rewardMoney,
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
      const paid = res.events.find(
        (e): e is Extract<ActionEvent, { type: "moneyPaid" }> => e.type === "moneyPaid",
      );
      if (paid) out(tpl(t.text.moneyPaid, { amount: paid.amount }));
      outAll(applyTitles(res.events));
    } else if (pick === "3") {
      // ---- 狩りに出る（周辺エリアで敵と戦う。03 §4） ----
      out(t.text.huntPick);
      // エリアごとに見出しを付けて列挙する。選択番号はエリアをまたいで通し（T-23）
      // 同種を unique.afterKills 体倒すと強個体が並ぶ（T-44）
      const huntList: { def: EnemyJson; unique: boolean }[] = [];
      const uniqueCfg = balance.combat.unique;
      for (const [area, group] of enemiesByArea(enemies)) {
        out(tpl(t.text.huntArea, { name: t.display.huntAreas[area] ?? area }));
        for (const e of group) {
          huntList.push({ def: e, unique: false });
          out(
            tpl(t.text.huntLine, { index: huntList.length, name: e.name, challenge: e.challenge }),
          );
          if (uniqueCfg !== undefined && canFightUnique(state, e.id, uniqueCfg)) {
            const ue: EnemyJson = {
              ...e,
              ...enhancedEnemy(e, uniqueCfg),
              name: tpl(t.text.uniqueName, { name: e.name }),
            };
            huntList.push({ def: ue, unique: true });
            out(
              tpl(t.text.huntLine, {
                index: huntList.length,
                name: ue.name,
                challenge: ue.challenge,
              }),
            );
          }
        }
      }
      const ei = await ask(t.text.promptChoice);
      if (ei === null) return state;
      const picked = huntList[Number.parseInt(ei.trim(), 10) - 1];
      if (!picked) {
        out(t.text.invalidInput);
        continue;
      }
      const enemy = picked.def;
      const isUnique = picked.unique;
      // 逃走判定の乱数は従来どおり「この日何度目の戦闘か」で決める
      const cs = await fightEnemy(
        enemy,
        `${state.seed}-combat-${state.counters["action.combat"] ?? 0}`,
        state,
      );
      if (cs === null) return state;
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
          ...(isUnique ? { unique: true } : {}),
        },
        cfg,
      );
      state = res.state;
      if (r.won) out(tpl(t.text.combatWon, { name: enemy.name }));
      else if (r.fled) out(t.text.combatFled);
      else {
        out(t.text.combatLost);
        // 死亡時は伝記が生成される（06 §1。蘇生するが記録は残る）
        if (r.died) {
          outAll(bioLines(state, "death"));
          // 伝記 → 年代記への記録（T-38。T-40 までは戦闘死のみ追記する最小接続）
          if (noteDeath(res)) out(t.text.chronicleRecorded);
        }
      }
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
      if (res.events.some((e) => e.type === "deathByAge")) {
        // 老衰死（T-40・D-31）：教会蘇生せず、そのまま生涯の終わり → 転生へ
        state = await reincarnate(state, "oldAge");
        continue;
      }
      if (noteDeath(res)) out(t.text.chronicleRecorded);
      save(state);
      out(t.text.wake.saved);
    } else if (pick === "5" || pick === "sleep") {
      // ---- 寝る（宿・夕食を選ぶ） ----
      // 表示する宿代にも世界補正を掛ける（T-45/T-46：飢饉の世・高い宿の誓い。実際の支払いは step 側）
      const withDinner = true;
      const innCostFactor = worldFactor(
        worldMods(state, balance.tendency, vows.vows),
        "innCostFactor",
      );
      const { lines: innLines, affordable } = innPickLines(
        t,
        (inn) => sleepQuality(inn, withDinner, cfg.sleep),
        state.player.money,
        (inn) => Math.round((cfg.sleep.innCost?.[inn] ?? 0) * innCostFactor),
      );
      outAll(innLines);
      if (affordable.length === 0) continue;
      const ii = await ask(t.text.promptChoice);
      if (ii === null) return state;
      const inn = affordable[Number.parseInt(ii.trim(), 10) - 1];
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
      if (report) {
        outAll(wakeBlock(report.report, applyTitles(res.events), t, skillNames));
        // 朝の新聞（07 §6：語り層の最初の呼び出し箇所）
        outAll(newspaper(res.events));
      }
      if (res.events.some((e) => e.type === "deathByAge")) {
        // 老衰死（T-40・D-31）：教会蘇生せず、そのまま生涯の終わり → 転生へ
        state = await reincarnate(state, "oldAge");
        continue;
      }
      if (noteDeath(res)) out(t.text.chronicleRecorded);
      save(state);
      out(t.text.wake.saved);
    } else if (pick === "6") {
      // ---- 目標と認定（03 §1）→ menus.ts ----
      const r = await societyMenu(state, menuCtx);
      if (r === null) return state;
      state = r;
    } else if (pick === "7" && canAction) {
      // ---- 見聞録を読む（07 §3）→ menus.ts ----
      const r = await loreMenu(state, menuCtx);
      if (r === null) return state;
      state = r;
    } else if (pick === "8") {
      // ---- 街の記録（台帳・称号・見聞録。行動は消費しない） ----
      state = recordsMenu(state, menuCtx);
    } else if (pick === "9") {
      // ---- 書店（購入は行動を消費しない。読むには1行動） → menus.ts ----
      const r = await booksMenu(state, menuCtx);
      if (r === null) return state;
      state = r;
    } else if (pick === "10") {
      // ---- 師匠（弟子入りは行動を消費しない。稽古は1行動＋礼金） → menus.ts ----
      const r = await mentorMenu(state, menuCtx);
      if (r === null) return state;
      state = r;
    } else if (pick === "11") {
      // ---- 引退（06 §1・T-40）：いつでも選べる。確認は1回 ----
      const conf = await ask(t.text.retireConfirm);
      if (conf === null) return state;
      if (conf.trim().toLowerCase() === "y") {
        const res = step(state, { type: "retire" }, cfg);
        state = await reincarnate(res.state, "retire");
      } else {
        out(t.text.retireCancelled);
      }
    } else if (pick === "12" && canAction) {
      // ---- 深層に潜る（T-43、06 §3B）：層を下る連戦。灯り（行動回数）が尽きるまで ----
      let run = startRun(
        abyssRunSeed(state.seed, state.counters["abyss.runs"] ?? 0),
        balance.abyss,
      );
      out(tpl(t.text.abyssStart, { light: run.light }));
      let loss: { enemyId: string; difficulty: number } | undefined;
      while (!run.done) {
        const floor = run.floor;
        const enemy = floorEnemy(run.seed, floor, enemies.enemies, balance.abyss);
        out(tpl(t.text.abyssFloor, { floor }));
        const cs = await fightEnemy(enemy, `${run.seed}:f${floor}`, state, {
          spend: () => {
            run = spendLight(run);
          },
          aborted: () => run.done,
        });
        if (cs === null) return state;
        const r = combatResult(cs);
        if (r.won) {
          // 倒した層を刻む。最後の灯りで倒しても層は数える（灯り切れはそのあとで閉じる）
          run = killFloor(run, { enemyId: enemy.id, difficulty: enemy.challenge });
          if (!run.done) {
            // 層の合間だけ引き返せる。戦闘中の離脱は「逃げる」で
            out(tpl(t.text.abyssCleared, { name: enemy.name }));
            out(tpl(t.text.abyssLight, { light: run.light }));
            const d = await ask(t.text.abyssDescendPrompt);
            if (d === null) return state;
            if (d.trim() !== "1") run = endRun(run, "retreat");
          }
        } else {
          loss = { enemyId: enemy.id, difficulty: enemy.challenge };
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
        },
        cfg,
      );
      state = res.state;
      const ended = res.events.find(
        (e): e is Extract<ActionEvent, { type: "abyssEnded" }> => e.type === "abyssEnded",
      );
      out(tpl(t.text.abyssResult, { depth: ended?.depth ?? 0, best: ended?.best ?? 0 }));
      if (ended?.newBest) out(tpl(t.text.abyssBest, { best: ended.best }));
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
      // 深層での死も教会蘇生の扱いは同じ（03 §4）。伝記は生成して年代記に残す
      if (run.end === "died") {
        outAll(bioLines(state, "death"));
        if (noteDeath(res)) out(t.text.chronicleRecorded);
      }
    } else {
      out(t.text.invalidInput);
    }
  }
}
