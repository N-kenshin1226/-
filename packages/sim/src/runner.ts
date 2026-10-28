import {
  createRng,
  incidentPendingChoice,
  newGame,
  step,
  type Command,
  type GameState,
  type NewGameConfig,
  type StepConfig,
} from "@trace/core";
import type { Bot, BotCtx } from "./bots.js";
import type { SimClock } from "./config.js";

/** 1日分のスナップショット（睡眠直後の状態） */
export interface DayRecord {
  day: number;
  /** その時点までの累計実時間（分） */
  minutes: number;
  skills: Record<string, number>;
  mainSkill: number;
  totalSkill: number;
  fatigue: number;
  overwork: boolean;
  /** 終わった日に日々の出来事が届いたか（F-05 の頻度ゲートが読む） */
  incident: boolean;
}

/** 「初めての経験」イベント（初称号・初追い風の種類・初めての行動など） */
export interface FirstEvent {
  key: string;
  minutes: number;
  label: string;
}

export interface RunResult {
  botId: string;
  days: DayRecord[];
  firsts: FirstEvent[];
  /** 行動コマンドの同一（kind×target）最大連続数。sleep/rest は切れ目に含めない */
  maxConsecutiveSameAction: number;
  titlesEarned: string[];
  /** 日々の出来事が届いた日の一覧（昇順。F-05 の頻度ゲート「3日に1回以上」が読む） */
  incidentDays: number[];
  final: GameState;
}

const SLEEP_KINDS = new Set(["sleep", "rest"]);

/**
 * bot を days 日分回す。コマンド列は Bot の act/endDay が決め、
 * 時間は actions×minutesPerAction + sleeps×minutesPerSleep で進める。
 * 1日が終わる（slept イベント）たびに DayRecord を取る。
 */
export function runBot(
  bot: Bot,
  days: number,
  seed: string,
  cfg: StepConfig,
  clock: SimClock,
  skillIds: readonly string[],
  /** newGame への追加初期値（G-02：生成地方の世界・始まりの町・初期所持金など） */
  init?: Partial<NewGameConfig>,
): RunResult {
  let g: GameState = newGame(`${seed}:${bot.id}`, bot.id, {
    skillIds,
    initialPotential: 100,
    initialStatValue: 10,
    // 世界の危機（W-01）：ボットの世界にもシード由来の危機を抽選する
    ...(cfg.crisis !== undefined ? { crisis: cfg.crisis } : {}),
    ...init,
  });
  const rng = createRng(`bot:${seed}:${bot.id}`);
  // 出来事への応えは独立した乱数列で引く —— 出来事の有無が
  // ボットの主系列の判断（仕事・訓練・睡眠の選択）をずらさない（core と同じ方式）
  const incidentRng = createRng(`bot-inc:${seed}:${bot.id}`);
  const ctx: BotCtx = { cfg, rng, skillIds };

  const records: DayRecord[] = [];
  const firsts: FirstEvent[] = [];
  const seenFirsts = new Set<string>();
  let minutes = 0;
  let titlesEarned: string[] = [];

  let consecutive = 0;
  let maxConsecutive = 0;
  let lastActionKey = "";
  let incidentToday = false;
  const incidentDaySet = new Set<number>();

  const pushFirst = (key: string, label: string) => {
    if (seenFirsts.has(key)) return;
    seenFirsts.add(key);
    firsts.push({ key, minutes, label });
  };

  let guard = 0;
  while (records.length < days && guard++ < days * 20 + 50) {
    const cmd: Command =
      g.time.action >= cfg.time.actionsPerDay ? bot.endDay(g, ctx) : bot.act(g, ctx);
    const dayBefore = g.time.day;
    const { state: next, events } = step(g, cmd, cfg);
    g = next;
    minutes += SLEEP_KINDS.has(cmd.type) ? clock.minutesPerSleep : clock.minutesPerAction;
    // 出来事への応答のステップで発行されたイベント（アトム・称号・頂点段などの
    // 尾を引く効果）は主ステップのイベントと同じく記録する —— 捨てると
    // 「出来事の途中で段に達した」が記録に残らない（merchant_king.market_face など）
    const extraEvents: typeof events = [];

    // 日々の出来事（F-05）：届いた分にはその場で応える（応えは行動を消費しない。
    // 選択は出来事専用の乱数列で決定的に —— 手堅い手と賭けの手の両方がシムに流れる）
    if (cfg.incidents !== undefined) {
      for (const offer of incidentPendingChoice(g, cfg.incidents)) {
        const choice = incidentRng.pick(offer.def.choices);
        const res = step(g, { type: "incidentChoose", id: offer.def.id, choice: choice.id }, cfg);
        g = res.state;
        extraEvents.push(...res.events);
      }
    }

    // 連続同一行動の計測（睡眠・休息は切れ目にしない＝日をまたいだ連続も数える）
    if (!SLEEP_KINDS.has(cmd.type)) {
      const key = `${cmd.type}:${"skill" in cmd ? cmd.skill : "-"}`;
      consecutive = key === lastActionKey ? consecutive + 1 : 1;
      lastActionKey = key;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      pushFirst(`act:${key}`, `${cmd.type}`);
    }
    if (cmd.type === "sleep") pushFirst(`sleep:${cmd.inn ?? "normal"}`, "宿");
    if (cmd.type === "rest") pushFirst("rest", "休養");

    for (const e of [...events, ...extraEvents]) {
      if (e.type === "titleGained") {
        titlesEarned.push(e.id);
        pushFirst(`title:${e.id}`, `称号 ${e.id}`);
      } else if (e.type === "pinnacleStageReached") {
        // 頂点ルートの段（T-41。「到達までの日数」目安を firsts から読む）
        pushFirst(`pinnacle:${e.route}.${e.stage}`, `頂点 ${e.route}.${e.stage}`);
      } else if (e.type === "wakeReport") {
        for (const w of e.report.tailwinds) pushFirst(`wind:${w.id}`, `追い風 ${w.label}`);
        if (e.report.restDay) pushFirst("restDay", "休養日");
        if (e.report.overwork.became) pushFirst("overwork", "オーバーワーク");
        for (const l of e.report.lines) pushFirst(`grow:${l.kind}:${l.id}`, `${l.id} の成長`);
        // 初めての持ち越し（F-01：上限を超えても消えないことが目に見える）
        if (e.report.lines.some((l) => l.carried !== undefined)) pushFirst("carryover", "持ち越し");
      } else if (e.type === "skillRankUp") {
        // ランク帯を越えた節目（F-01。「最初のランクアップは3日以内」の計測に使う）
        pushFirst(`rankup:${e.skill}:${e.toRank}`, `ランクアップ ${e.skill}`);
      } else if (e.type === "slept") {
        pushFirst("slept", "初めての睡眠");
      } else if (e.type === "incidentOffered") {
        // 出来事が届いた日を記録する（応える・応えないに関わらず「出会いがあった日」）
        incidentToday = true;
        incidentDaySet.add(dayBefore);
        pushFirst(`incident:${e.id}`, `出来事 ${e.id}`);
      }
    }

    if (g.time.day !== dayBefore) {
      const values = Object.values(g.player.skills).map((s) => s.value);
      records.push({
        day: g.time.day,
        minutes,
        skills: Object.fromEntries(Object.entries(g.player.skills).map(([k, s]) => [k, s.value])),
        mainSkill: Math.max(0, ...values),
        totalSkill: values.reduce((a, b) => a + b, 0),
        fatigue: g.player.fatigue,
        overwork: g.player.overwork.active,
        incident: incidentToday,
      });
      incidentToday = false;
      titlesEarned = [...new Set(titlesEarned)];
    }
  }

  return {
    botId: bot.id,
    days: records,
    firsts,
    maxConsecutiveSameAction: maxConsecutive,
    titlesEarned,
    incidentDays: [...incidentDaySet].sort((a, b) => a - b),
    final: g,
  };
}

/** minutes を超えた直近の日のレコード（無ければ最後） */
export function atMinutes(days: DayRecord[], minutes: number): DayRecord | undefined {
  return [...days].reverse().find((d) => d.minutes <= minutes) ?? days[0];
}
