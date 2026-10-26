import { activeBookEffects, buyBook, readBook, type BooksConfig } from "./books/index.js";
import { evaluate, type Cond } from "./conditions/index.js";
import { activeEffects, gainModifier, priceFactor, type Effect } from "./effects/index.js";
import { worldFactor, worldMods, type TendencyDefs, type VowDef } from "./fate/index.js";
import { subscribers, type ActionEvent } from "./events/index.js";
import { ageBand, agingOnWake, type AgingConfig } from "./growth/aging.js";
import {
  applyActionLoad,
  consolidateBody,
  updateOverwork,
  type BodyConfig,
} from "./growth/body.js";
import { consolidateSleep, type InnRank, type SleepConfig } from "./growth/consolidate.js";
import { computeGain, recentRepeats, type GainConfig } from "./growth/gain.js";
import { rollTailwind, windFor, type TailwindConfig } from "./growth/tailwind.js";
import { recordWork, type LedgerConfig } from "./ledger/index.js";
import type { CombatConfig } from "./combat/index.js";
import { consumeS, emitKehai, resetDailyNotify } from "./notify/index.js";
import { checkPinnacles, type PinnacleRouteDef } from "./pinnacle/index.js";
import { acceptOffer, goalAchieved, newOffers, type SocietyDefs } from "./society/index.js";
import { readAtom, type LoreConfig } from "./lore/index.js";
import {
  apprentice,
  currentMentor,
  leaveMentor,
  mentorSession,
  type MentorsConfig,
} from "./mentors/index.js";
import { unlockSkills } from "./skills/index.js";
import { restoreRng } from "./rng/index.js";
import type { GameState, SkillId } from "./state/types.js";
import {
  advance as advanceTime,
  canAct,
  describe as describeTime,
  sleep as sleepTime,
  type TimeConfig,
} from "./time/index.js";

/**
 * step(state, command, cfg) → { state, events }
 * 純粋関数：入力の state を変更しない。docs/04_tech_and_devin.md §2 原則2。
 * cfg は balance.json 由来（数値をコードに直書きしない）。
 */

export interface StepConfig {
  time: TimeConfig;
  /** actionLog の保持上限（balance.json state.actionLogMax） */
  actionLogMax: number;
  gain: GainConfig;
  sleep: SleepConfig;
  tailwind: TailwindConfig;
  body: BodyConfig;
  /** 作品台帳（T-16。03 §3） */
  ledger: LedgerConfig;
  /** 戦闘（03 §4。死亡時の経験損失に使う） */
  combat: CombatConfig;
  /** 立場・職業・人生目標の定義（03 §1。content/society.json）＋達成報酬の係数 */
  society: SocietyDefs & { goalRewardFactor: number };
  /** 見聞録（07 §3。content/lore のアトムとつながり定義） */
  lore: LoreConfig;
  /** 称号の定義（content/titles.json。core が必要とする最小形） */
  titles: readonly { id: string; rank: "S" | "A" | "B"; condition: Cond; effect?: Effect }[];
  /** 派生スキルの解放条件（skills.json の unlock を持つもの。02：派生） */
  skillUnlocks?: readonly { id: string; condition: Cond }[];
  /** 書物（02 §8、T-26。content/books.json と素質上限） */
  books?: BooksConfig;
  /** 師匠（02 §8、T-27。content/mentors.json と素質上限） */
  mentors?: MentorsConfig;
  /** 起床ログなどに出すスキル表示名（省略時はID） */
  skillNames?: Record<string, string>;
  /** 寿命・加齢（06 §1、T-36。balance.aging ＋ cli.json 由来の文）。省略時は加齢なし */
  aging?: AgingConfig;
  /** 継承（06 §2、T-39。balance.legacy）。遺物の gainVs 係数を渡す */
  legacy?: { artifactGainFactor: number };
  /** 頂点ルート（06 §3A、T-41。content/pinnacles.json）。省略時は条件鎖を評価しない */
  pinnacles?: readonly PinnacleRouteDef[];
  /** 運命の傾向の定義（06 §3C、T-45。balance.tendency）。省略時はすべて中立 */
  tendency?: TendencyDefs;
  /** 誓約の定義（06 §3C、T-46。content/vows.json）。省略時は誓約の効果なし */
  vows?: readonly VowDef[];
}

export type Command =
  | { type: "wait" }
  /** 宿で寝る。inn/dinner は睡眠の質（2要因のみ） */
  | { type: "sleep"; inn?: InnRank; dinner?: boolean }
  /** 休養：家で休んで眠る。行動0回なら休養日（素質回復・オーバーワーク解除） */
  | { type: "rest" }
  /** 訓練：安全だが挑戦係数に上限がある（02 §8）。difficulty は行動の難度 */
  | { type: "train"; skill: SkillId; difficulty: number; failed?: boolean }
  /**
   * 仕事で作品を作る（03 §3 作品台帳）。quality は結果、difficulty は注文の難しさ
   * （省略時は quality − 現在値を挑戦差とみなす＝自己ベスト級の挑戦）
   */
  | {
      type: "work";
      kind: string;
      quality: number;
      difficulty?: number;
      order?: string;
      flags?: string[];
      /** 簡易判定なら経験係数（03 §2「50%」）。手動は省略/1 */
      expFactor?: number;
      /** 注文の報酬（G）。省略時は台帳の市場価値がそのまま入る */
      rewardMoney?: number;
    }
  /**
   * 戦闘の結果を世界に反映する（03 §4）。戦闘の進行自体は combat/ で行い、
   * ここでは勝敗を記録し経験を入れる。敵の強さは difficulty（challenge）で渡す
   */
  | {
      type: "combat";
      enemyId: string;
      /** 敵の challenge（gain の挑戦差） */
      difficulty: number;
      won: boolean;
      fled?: boolean;
      died?: boolean;
      /** 強化版ユニークとの戦闘（T-44）。討伐時に kill.unique.<id>/total を数える */
      unique?: boolean;
    }
  /**
   * 深層ダンジョンのランの結果を世界に反映する（06 §3B、T-43）。
   * ランの進行自体は abyss/ で行い、ここでは層ごとの撃破・到達深度・終わり方を記録する。
   * 潜行1回につき1行動を消費する（層数によらない）
   */
  | {
      type: "abyss";
      /** ランの終わり方：逃走／灯り切れ／途中離脱／死亡 */
      end: "fled" | "light" | "retreat" | "died";
      /** クリアした層の敵（倒した順）。difficulty は強化後の挑戦差 */
      kills?: readonly { enemyId: string; difficulty: number }[];
      /** 未決着で終わった層の敵（逃走・死亡・灯り切れ）。失敗経験を入れる */
      loss?: { enemyId: string; difficulty: number };
    }
  /** 打診を受けて立場・職業の認定を受ける（03 §1）。行動は消費しない */
  | { type: "acceptOffer"; id: string }
  /** 人生目標を宣言する（03 §1）。行動は消費しない */
  | { type: "declareGoal"; id: string }
  /** 人生目標を取り下げる（差し替え用） */
  | { type: "abandonGoal" }
  /** アトムを読む（見聞録。行動を1回消費する） */
  | { type: "readAtom"; id: string }
  /** 書物を買う（02 §8、T-26。行動は消費しない） */
  | { type: "buyBook"; id: string }
  /** 所持する書物を読む（行動を1回消費。素質回復・期間効果・知識フラグ） */
  | { type: "readBook"; id: string }
  /** 師匠に弟子入りする（02 §8、T-27。条件達成で認められる。行動は消費しない） */
  | { type: "apprentice"; id: string }
  /** 師匠の門を出る（行動は消費しない） */
  | { type: "leaveMentor" }
  /**
   * 師匠の稽古を受ける（行動を1回消費＋礼金）。担当スキルの経験は train と同じ式で、
   * M項には弟子期間の師匠効果が乗る。稽古ごとに担当スキルの素質が回復し、
   * 初回は秘伝フラグが立つ
   */
  | { type: "trainWithMentor"; difficulty: number }
  /**
   * 引退する（06 §1、T-40）。いつでも選べて行動は消費しない。
   * state は変えず `retired` イベントだけを返す —— 伝記・年代記・継承・転生は
   * 呼び出し側が行う（転生は newGame で別の GameState に切り替わるため）
   */
  | { type: "retire" };

export interface StepResult {
  state: GameState;
  events: ActionEvent[];
}

/** actionPerformed イベントを行動ログに追記し、上限で丸める */
function recordAction(state: GameState, event: ActionEvent, max: number): GameState {
  if (event.type !== "actionPerformed") return state;
  const entry = {
    day: event.day,
    kind: event.kind,
    ...(event.target ? { target: event.target } : {}),
    ...(event.variant ? { variant: event.variant } : {}),
  };
  const actionLog = [...state.actionLog, entry].slice(-max);
  return { ...state, actionLog };
}

export function step(state: GameState, command: Command, cfg: StepConfig): StepResult {
  // イミュータブル：入力のクローンだけを触る。
  // GameState はシリアライズ可能なプレーンオブジェクトなので JSON 往復で複製する
  // （structuredClone は DOM/node 型依存を core に持ち込まないため避ける）
  let next = JSON.parse(JSON.stringify(state)) as GameState;
  const events: ActionEvent[] = [];

  // 運命の傾向＋誓約（T-45/T-46）：この周に効いている世界修飾の合算。
  // 傾向・誓約は step 中に変化しないので入力 state から一度だけ計算する
  const fate = worldMods(state, cfg.tendency, cfg.vows);

  switch (command.type) {
    case "wait": {
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "wait", cfg.body);
      events.push({ type: "actionPerformed", kind: "wait", day: next.time.day });
      break;
    }
    case "sleep":
    case "rest": {
      const from = next.time;
      // 行動0回で眠る日は休養日（オーバーワーク解除・素質回復）
      const restDay = !next.actionLog.some((e) => e.day === next.time.day);

      // オーバーワークの連続カウントを更新し、今晩の定着係数を決める
      const { overwork, becameOverwork } = updateOverwork(next, cfg.body, restDay);
      next = { ...next, player: { ...next.player, overwork } };
      const capFactor = overwork.active ? cfg.body.overworkConsolidateFactor : 1;

      // 年齢帯（T-36）：終わる日の年齢で係数が決まる（若いと基礎能力、高齢でスキルが伸びやすい）
      const band = cfg.aging ? ageBand(describeTime(from, cfg.time).age, cfg.aging) : undefined;

      // 今日の行動が終わる前に未定着経験を定着させ、起床ログを作る
      const isRest = command.type === "rest";
      const { state: rested, report } = consolidateSleep(
        next,
        isRest ? "normal" : (command.inn ?? "normal"),
        isRest ? false : (command.dinner ?? false),
        cfg.sleep,
        {
          capFactor,
          skillFactor: band?.skillFactor,
          ...(isRest ? { qualityOverride: cfg.body.restQuality } : {}),
          names: cfg.skillNames,
        },
      );
      next = rested;

      // 身体側の定着：負荷 → 基礎能力、疲労回復、休養日の素質回復
      const bodyRes = consolidateBody(next, report.quality, cfg.body, {
        restDay,
        capFactor,
        statFactor: band?.statFactor,
        // 傾向・誓約（T-45/T-46）：素質回復への修飾（例：飢饉・癒えにくい身体の誓いで半減）
        potentialFactor: worldFactor(fate, "restPotentialFactor"),
      });
      next = bodyRes.state;
      report.lines.push(...bodyRes.lines);
      report.lines.sort((a, b) => a.delta - b.delta);
      report.fatigue.to = next.player.fatigue;
      report.overwork = { active: overwork.active, became: becameOverwork };
      report.restDay = restDay;

      // 翌日の追い風を抽選して保持し、起床ログに含める
      const rng = restoreRng(next.rng);
      let winds = rollTailwind(next, rng, cfg.tailwind);
      // 誓約「追い風なし」（T-46）：tailwind 方向だけを落とす（逆風は残る）
      if (fate.noTailwind) winds = winds.filter((w) => w.direction !== "tailwind");
      next.rng = rng.state();
      next.today = { ...next.today, winds };
      report.tailwinds = winds.map((w) => ({
        id: w.id,
        label: w.label,
        direction: w.direction,
      }));
      // 宿代を払う（rest・自宅は無料）。傾向・誓約で変動する（T-45/T-46）
      if (!isRest) {
        const cost = Math.round(
          (cfg.sleep.innCost?.[command.inn ?? "normal"] ?? 0) * worldFactor(fate, "innCostFactor"),
        );
        next = {
          ...next,
          player: { ...next.player, money: Math.max(0, next.player.money - cost) },
        };
      }

      next.time = sleepTime(next.time);
      next = resetDailyNotify(next); // 日付が変わると通知予算はリセット

      // 加齢（T-36）：新しい朝の年齢で「老いの兆候」と老衰死を判定する（06 §1）
      const agingEvents: ActionEvent[] = [];
      if (cfg.aging) {
        const aged = agingOnWake(next, cfg.aging, cfg.time, cfg.combat.deathPendingFactor);
        next = aged.state;
        if (aged.signLine !== null) report.surprises.push(aged.signLine);
        agingEvents.push(...aged.events);
      }

      events.push({ type: "slept", from, to: next.time });
      events.push({ type: "wakeReport", report });
      events.push(...agingEvents);
      break;
    }
    case "train": {
      const skill = next.player.skills[command.skill];
      if (!skill) throw new Error(`train: 未知のスキル ${command.skill}`);
      // 派生スキルは解放済み（flags）でないと鍛えられない（T-28）
      const unlockCond = cfg.skillUnlocks?.find((u) => u.id === command.skill)?.condition;
      if (unlockCond && next.flags[`skill.unlock.${command.skill}`] !== true) {
        throw new Error(`train: 未解放のスキル ${command.skill}`);
      }

      const repeats = recentRepeats(
        next.actionLog,
        "train",
        command.skill,
        cfg.gain.noveltyWindow,
        String(command.difficulty),
      );
      const { amount } = computeGain(
        {
          kind: "train",
          skill: skill.value,
          delta: command.difficulty - skill.value,
          repeats,
          potential: skill.potential,
          fatigue: next.player.fatigue,
          wind: windFor(next, "train", command.skill),
          // M 項：称号・認定職・師匠（T-27）に加えて、読了した書物の期間効果（T-26）も積に入る
          modifiers: gainModifier(
            [
              ...activeEffects(
                next,
                cfg.titles,
                cfg.society.professions,
                cfg.mentors?.mentors,
                cfg.legacy?.artifactGainFactor,
              ),
              ...activeBookEffects(next, cfg.books),
            ],
            "train",
            command.skill,
          ),
          failed: command.failed,
          isTraining: true,
        },
        cfg.gain,
      );
      skill.pending += amount;
      skill.lastUsedDay = next.time.day;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "train", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "train",
        day: next.time.day,
        target: command.skill,
        variant: String(command.difficulty),
      });
      events.push({ type: "gainApplied", skill: command.skill, amount });
      break;
    }
    case "work": {
      // 技能を使う仕事。作品が台帳に載り、ティア更新なら大きな経験ボーナス
      const recorded = recordWork(
        next,
        {
          kind: command.kind,
          quality: command.quality,
          ...(command.order !== undefined ? { order: command.order } : {}),
          ...(command.flags !== undefined ? { flags: command.flags } : {}),
        },
        cfg.ledger,
      );
      next = recorded.state;
      const skill = next.player.skills[command.kind];
      const skillValue = skill?.value ?? 0;
      const repeats = recentRepeats(next.actionLog, "work", command.kind, cfg.gain.noveltyWindow);
      // 称号・認定職・師匠・読了書物の効果（T-35・T-27・T-26）：M 項の修正と報酬の値段変化
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      const { amount } = computeGain(
        {
          kind: "work",
          skill: skillValue,
          delta: command.difficulty ?? command.quality - skillValue,
          repeats,
          potential: skill?.potential ?? 0,
          fatigue: next.player.fatigue,
          wind: windFor(next, "work", command.kind),
          modifiers: (command.expFactor ?? 1) * gainModifier(effects, "work", command.kind),
        },
        cfg.gain,
      );
      if (skill) {
        skill.pending += amount + (recorded.tierUp ? cfg.ledger.tierUpBonusPending : 0);
        skill.lastUsedDay = next.time.day;
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "work", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "work",
        day: next.time.day,
        target: command.kind,
        ...(command.order !== undefined ? { variant: command.order } : {}),
      });
      events.push({ type: "gainApplied", skill: command.kind, amount });
      events.push({ type: "workRecorded", work: recorded.work });
      if (recorded.tierUp) {
        events.push({ type: "tierUp", kind: command.kind, tier: recorded.work.tier });
      }
      // 報酬が入る（注文の約定額があればそれ、無ければ市場価値。認定の値段変化と
      // 傾向・誓約の報酬係数（T-45/T-46）を乗せる）
      const pay = Math.max(
        0,
        Math.round(
          (command.rewardMoney ?? recorded.work.marketValue) *
            priceFactor(effects, command.kind) *
            worldFactor(fate, "rewardFactor"),
        ),
      );
      next = {
        ...next,
        player: { ...next.player, money: next.player.money + pay },
      };
      events.push({ type: "moneyPaid", amount: pay });
      break;
    }
    case "combat": {
      // 戦闘も行動：剣術と回避に経験が入る（kind "combat" の B）
      const sks = next.player.skills;
      const repeats = recentRepeats(
        next.actionLog,
        "combat",
        command.enemyId,
        cfg.gain.noveltyWindow,
      );
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      for (const skillId of ["swordplay", "evasion"] as const) {
        const skill = sks[skillId];
        if (!skill) continue;
        const { amount } = computeGain(
          {
            kind: "combat",
            skill: skill.value,
            delta: command.difficulty - skill.value,
            repeats,
            potential: skill.potential,
            fatigue: next.player.fatigue,
            wind: windFor(next, "combat", skillId),
            modifiers:
              gainModifier(effects, "combat", skillId, command.enemyId) *
              worldFactor(fate, "combatGainFactor"),
            failed: !command.won,
          },
          cfg.gain,
        );
        skill.pending += amount;
        skill.lastUsedDay = next.time.day;
        events.push({ type: "gainApplied", skill: skillId, amount });
      }

      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "combat", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "combat",
        day: next.time.day,
        target: command.enemyId,
      });
      events.push({
        type: "combatEnded",
        enemyId: command.enemyId,
        won: command.won,
        fled: command.fled ?? false,
      });
      // 撃破数と死は年代記に残る（カウンタで条件DSL・称号が読める）
      const counters = { ...next.counters };
      if (command.won) {
        const key = `kill.species.${command.enemyId}`;
        counters[key] = (counters[key] ?? 0) + 1;
        // 強個体の討伐は別系統でも数える（T-44。図鑑・称号の条件用）
        if (command.unique === true) {
          const uKey = `kill.unique.${command.enemyId}`;
          counters[uKey] = (counters[uKey] ?? 0) + 1;
          counters["kill.unique.total"] = (counters["kill.unique.total"] ?? 0) + 1;
          events.push({ type: "uniqueDefeated", enemyId: command.enemyId });
        }
      }
      if (command.died) {
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        // 教会蘇生：未定着経験の半分を失う。数値そのものは下がらない（03 §4）
        const skills = { ...next.player.skills };
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * cfg.combat.deathPendingFactor };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      next = { ...next, counters };
      break;
    }
    case "abyss": {
      // 深層ダンジョン（T-43、06 §3B）：潜行1回＝1行動。層ごとの撃破に戦闘と同じ
      // 経験を入れ、到達深度を counters（abyss.best 等）に記録する。
      // GameState の形は変えないのでセーブバージョン据置
      if (!canAct(next.time, cfg.time)) break;
      const counters = { ...next.counters };
      const sks = next.player.skills;
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      // 層ごとの戦闘を順に反映する。同じラン内での同種連戦も反復として数える
      const inRun = new Map<string, number>();
      const applyFight = (fight: { enemyId: string; difficulty: number }, won: boolean) => {
        const repeats =
          recentRepeats(next.actionLog, "combat", fight.enemyId, cfg.gain.noveltyWindow) +
          (inRun.get(fight.enemyId) ?? 0);
        for (const skillId of ["swordplay", "evasion"] as const) {
          const skill = sks[skillId];
          if (!skill) continue;
          const { amount } = computeGain(
            {
              kind: "combat",
              skill: skill.value,
              delta: fight.difficulty - skill.value,
              repeats,
              potential: skill.potential,
              fatigue: next.player.fatigue,
              wind: windFor(next, "combat", skillId),
              modifiers:
                gainModifier(effects, "combat", skillId, fight.enemyId) *
                worldFactor(fate, "combatGainFactor"),
              failed: !won,
            },
            cfg.gain,
          );
          skill.pending += amount;
          skill.lastUsedDay = next.time.day;
          events.push({ type: "gainApplied", skill: skillId, amount });
        }
        inRun.set(fight.enemyId, (inRun.get(fight.enemyId) ?? 0) + 1);
        // 行動ログの kind は "combat"（新規性・新聞の記事分類を共有）、variant で深層を区別
        events.push({
          type: "actionPerformed",
          kind: "combat",
          day: next.time.day,
          target: fight.enemyId,
          variant: "abyss",
        });
        events.push({
          type: "combatEnded",
          enemyId: fight.enemyId,
          won,
          fled: !won && command.end === "fled",
        });
        if (won) {
          const key = `kill.species.${fight.enemyId}`;
          counters[key] = (counters[key] ?? 0) + 1;
        }
      };
      for (const k of command.kills ?? []) applyFight(k, true);
      // 未決着の層（逃走・死亡・灯り切れで中断した戦闘）も失敗経験を入れる
      if (command.loss !== undefined) applyFight(command.loss, false);

      // 潜行自体：時間を1行動分だけ進め、負荷を積む
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "abyss", cfg.body);
      events.push({ type: "actionPerformed", kind: "abyss", day: next.time.day });

      // 到達深度の記録（自己ベストは counters で十分：D-34。年代記・記録画面はここを読む）
      counters["abyss.runs"] = (counters["abyss.runs"] ?? 0) + 1;
      counters["abyss.floors"] = (counters["abyss.floors"] ?? 0) + (command.kills?.length ?? 0);
      const depth = command.kills?.length ?? 0;
      const prevBest = counters["abyss.best"] ?? 0;
      const newBest = depth > prevBest;
      if (newBest) counters["abyss.best"] = depth;
      events.push({
        type: "abyssEnded",
        end: command.end,
        depth,
        best: newBest ? depth : prevBest,
        newBest,
      });

      if (command.end === "died") {
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        // 教会蘇生：未定着経験の半分を失う。深層で死んでも扱いは戦闘死と同じ（03 §4）
        const skills = { ...next.player.skills };
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * cfg.combat.deathPendingFactor };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      next = { ...next, counters };
      break;
    }
    case "acceptOffer": {
      // 打診の受諾：行動は消費しない（認定は会話の一瞬）
      const res = acceptOffer(next, cfg.society, command.id);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "offerAccepted", id: command.id });
      break;
    }
    case "declareGoal": {
      // 人生目標の宣言：未達成・未宣言のものだけ。行動は消費しない
      const exists = cfg.society.lifeGoals.some(
        (g) => g.id === command.id && !next.society.achievedGoals.includes(g.id),
      );
      if (exists && next.society.goal !== command.id) {
        next = { ...next, society: { ...next.society, goal: command.id } };
        events.push({ type: "goalDeclared", id: command.id });
      }
      break;
    }
    case "abandonGoal": {
      if (next.society.goal !== null) {
        next = { ...next, society: { ...next.society, goal: null } };
      }
      break;
    }
    case "readAtom": {
      // 読むのも行動（1回消費）。読み済み・不明IDは時間だけ使わない
      const res = readAtom(next, command.id, cfg.lore);
      if (!res.ok) break;
      next = res.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "read", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "read",
        day: next.time.day,
        target: command.id,
      });
      events.push({ type: "atomRead", id: command.id });
      for (const f of res.newFacts) events.push({ type: "factLearned", id: f });
      for (const c of res.connections) {
        events.push({ type: "loreConnection", id: c.eventId, flag: c.flag });
      }
      break;
    }
    case "buyBook": {
      // 購入は行動を消費しない（書店への立ち寄り。認定の受諾と同じ扱い）
      const res = buyBook(next, command.id, cfg.books);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "bookBought", id: command.id });
      break;
    }
    case "readBook": {
      // 読むのは行動（1回消費）。未所持・読了済み・不明IDは時間だけ使わない。
      // 行動残が無いときは読めない（期間効果を無料で得る抜け道を塞ぐ）
      if (!canAct(next.time, cfg.time)) break;
      const res = readBook(next, command.id, cfg.books);
      if (!res.ok) break;
      next = res.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "read", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "read",
        day: next.time.day,
        target: command.id,
      });
      events.push({
        type: "bookRead",
        id: command.id,
        recovered: res.recovered,
        ...(res.flag !== undefined ? { flag: res.flag } : {}),
      });
      break;
    }
    case "apprentice": {
      // 弟子入り：行動は消費しない（会話の一瞬。認定の受諾と同じ扱い）
      const res = apprentice(next, command.id, cfg.mentors, cfg.time);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "mentorApprenticed", id: command.id });
      break;
    }
    case "leaveMentor": {
      const res = leaveMentor(next);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "mentorLeft", id: res.id! });
      break;
    }
    case "trainWithMentor": {
      // 師匠の稽古（1行動＋礼金）。師匠がいない・礼金不足・行動残なし・
      // 担当スキル不明は何も起きない（readBook と同じく時間も進めない）
      const mentor = currentMentor(next, cfg.mentors);
      if (mentor === null) break;
      if (!canAct(next.time, cfg.time)) break;
      if (next.player.money < mentor.fee) break;
      const skill = next.player.skills[mentor.skill];
      if (!skill) break;

      const repeats = recentRepeats(
        next.actionLog,
        "train",
        mentor.skill,
        cfg.gain.noveltyWindow,
        String(command.difficulty),
      );
      const { amount } = computeGain(
        {
          kind: "train",
          skill: skill.value,
          delta: command.difficulty - skill.value,
          repeats,
          potential: skill.potential,
          fatigue: next.player.fatigue,
          wind: windFor(next, "train", mentor.skill),
          // M 項：称号・認定職・師匠の弟子期間効果・読了書物（T-35・T-27・T-26）
          modifiers: gainModifier(
            [
              ...activeEffects(
                next,
                cfg.titles,
                cfg.society.professions,
                cfg.mentors?.mentors,
                cfg.legacy?.artifactGainFactor,
              ),
              ...activeBookEffects(next, cfg.books),
            ],
            "train",
            mentor.skill,
          ),
          isTraining: true,
        },
        cfg.gain,
      );
      skill.pending += amount;
      skill.lastUsedDay = next.time.day;

      // 礼金と素質回復・秘伝フラグ（gain の後に清算する）
      const ses = mentorSession(next, cfg.mentors);
      next = ses.state;

      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "train", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "train",
        day: next.time.day,
        target: mentor.skill,
        variant: String(command.difficulty),
      });
      events.push({ type: "gainApplied", skill: mentor.skill, amount });
      events.push({
        type: "mentorTrained",
        id: mentor.id,
        fee: mentor.fee,
        recovered: ses.recovered,
        ...(ses.flag !== undefined ? { flag: ses.flag } : {}),
      });
      break;
    }
    case "retire": {
      // 引退：行動を消費せず状態も変えない。生涯の終わりを告げる出来事だけを発行し、
      // 伝記・年代記への記録・継承・転生は呼び出し側の仕事（T-40。06 §1）
      events.push({ type: "retired" });
      break;
    }
  }

  // イベントを購読者に流して派生状態を更新し、行動ログを記録する
  for (const event of events) {
    for (const sub of subscribers) next = sub(next, event);
    next = recordAction(next, event, cfg.actionLogMax);
  }

  // 称号の判定（購読者がカウンタを更新した後の state で評価。
  // 1ステップに複数取れてよいが、同じ称号は二度取らない）
  const titleEvents: ActionEvent[] = [];

  // 頂点ルートの条件鎖（06 §3A、T-41）：各ルートの次の未達成段だけを見る。
  // 段の達成は flags["pinnacle.<route>.<stage>"] に刻み、最終段（S）の頂点称号は
  // そのフラグを条件に持つ既存の称号判定がこの直後に拾う（二重管理を避ける）
  if (cfg.pinnacles) {
    const prog = checkPinnacles(next, cfg.pinnacles, cfg.time);
    next = prog.state;
    for (const r of prog.reached) {
      const event: ActionEvent = {
        type: "pinnacleStageReached",
        route: r.route.id,
        stage: r.stage.id,
        rank: r.stage.rank,
      };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
    // 頂点（Sランク段）への接近は「気配」として出す（記録は checkPinnacles 側で済み）
    for (const _ of prog.kehai) titleEvents.push({ type: "kehai" });
  }

  for (const def of cfg.titles) {
    if (next.titles.includes(def.id)) continue;
    if (evaluate(def.condition, next, cfg.time)) {
      next = { ...next, titles: [...next.titles, def.id] };
      titleEvents.push({ type: "titleGained", id: def.id, rank: def.rank });
      // 通知予算：Sは1日1回。超過したSは抑制フラグで格下げ表示にする
      if (def.rank === "S") {
        const r = consumeS(next);
        next = r.state;
        if (!r.allowed) {
          titleEvents[titleEvents.length - 1] = {
            type: "titleGained",
            id: def.id,
            rank: def.rank,
            suppressed: true,
          };
        }
      }
    }
  }
  // 派生スキルの解放判定（02：素スキルが育つと派生が開花。解放は flags に記録）
  if (cfg.skillUnlocks) {
    const u = unlockSkills(next, cfg.skillUnlocks, cfg.time);
    next = u.state;
    for (const id of u.unlocked) {
      const event: ActionEvent = { type: "skillUnlocked", id };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // S候補への接近 → 条件を明かさず「気配」の一行（03 §6）
  const kehai = emitKehai(next, cfg.titles);
  next = kehai.state;
  for (const _ of kehai.fired) titleEvents.push({ type: "kehai" });
  for (const event of titleEvents) {
    for (const sub of subscribers) next = sub(next, event);
    next = recordAction(next, event, cfg.actionLogMax);
    events.push(event);
  }

  // 立場・職業の打診（条件を満たしたらオファーが溜まる。通知Aランク相当）
  for (const offer of newOffers(next, cfg.society, cfg.time)) {
    next = {
      ...next,
      society: {
        ...next.society,
        pendingOffers: [...next.society.pendingOffers, offer.id],
      },
    };
    events.push({ type: "offerReceived", kind: offer.kind, id: offer.id });
  }
  // 人生目標の達成：宣言していた目標が満たされたら報酬（pending）を付与
  const achieved = goalAchieved(next, cfg.society, cfg.time);
  if (achieved) {
    next = {
      ...next,
      society: {
        ...next.society,
        achievedGoals: [...next.society.achievedGoals, achieved.id],
        goal: null,
      },
    };
    for (const [skillId, base] of Object.entries(achieved.reward.pendingBySkill ?? {})) {
      const skill = next.player.skills[skillId];
      if (!skill) continue;
      skill.pending += base * cfg.society.goalRewardFactor;
    }
    events.push({ type: "goalAchieved", id: achieved.id });
  }

  return { state: next, events };
}
