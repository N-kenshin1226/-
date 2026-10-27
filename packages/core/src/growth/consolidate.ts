import type { GameState, StatId } from "../state/types.js";
import { rustedValue, type RustConfig } from "./rust.js";

const tplRust = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/**
 * 睡眠による定着と起床ログ（docs/02_growth_system.md §3、§6、F-01）。
 *
 * - 未定着経験は睡眠時にまとめて数値へ変換する
 * - 1晩の定着上限 = 基礎上限 × 睡眠の質（宿ランク × 夕食の2要因）× ランク係数
 *   （低ランクほど大きく定着する —— 序盤の成長の爽快感のため、F-01）
 * - 上限超過分は**全量**翌日に持ち越される（頑張った分は消えない。P5）
 * - 値がランクの境目を越えたら rankUps に記録する（起床ログで節目として扱い、
 *   step() が skillRankUp イベントも発行する —— F-02 の演出の材料）
 * - 値が上がったら peak を更新し、素質を減らす（§6）
 */

export type InnRank = "cheap" | "normal" | "good";

/** スキルランク帯の1区（02 §1 のランク表 + F-01 の定着上限係数） */
export interface SkillRankDef {
  /** このランクが始まるスキル値（昇順。先頭は必ず 0） */
  at: number;
  /** このランクの1晩定着上限の倍率（低ランクほど大きい。省略時の既定は 1） */
  capFactor: number;
}

export interface SleepConfig {
  /** 1スキルあたり1晩の基礎定着上限 */
  nightlyCapPerSkill: number;
  /**
   * 1晩に定着できる全スキル合計の上限（×睡眠の質）。
   * 単一集中と多角化の総成長差を抑えるための上限（02 §10 方針間の差）。
   * その晩の未定着が1つの技能に集中している（シェアが focusShare 以上の）夜は、
   * その技能のランク係数がこちらにも掛かる —— 「今日はこれだけ頑張った」夜は
   * 定着の間口が広がる（F-01）。散らした夜は基礎値のまま（低ランクを広く回す
   * 方針に合計上限まで倍増させると方針間の差が開きすぎるため）
   */
  nightlyCapTotal: number;
  /**
   * 合計上限にランク係数を掛ける集中度の下限（0〜1、既定 0.5）。
   * その晩に積んだ未定着のうち最大の技能のシェアがこれを超えた夜だけ、
   * その技能のランク係数が nightlyCapTotal にも掛かる
   */
  focusShare?: number;
  /**
   * スキルのランク帯（02 §1 のランク表）と、その帯での定着上限倍率（F-01）。
   * 省略時は全ランク係数1（ランクによる上限差・ランクアップ検出なし）
   */
  skillRanks?: readonly SkillRankDef[];
  /** 宿ランク係数 */
  innFactors: Record<InnRank, number>;
  /** 夕食係数（あり/なし） */
  dinnerFactors: { withDinner: number; noDinner: number };
  /** 睡眠の質の下限・上限 */
  qualityMin: number;
  qualityMax: number;
  /** スキル値が 1 上がるごとの素質の減少率（§6：現在値の約1%） */
  potentialDecayPerPoint: number;
  /** 宿代（G）。省略時は無料 */
  innCost?: Record<InnRank, number>;
  /** 錆の設定（02 §7）。省略時は錆びない */
  rust?: RustConfig;
}

/** 睡眠の質 = 宿ランク係数 × 夕食係数（qualityMin〜qualityMax にクランプ） */
export function sleepQuality(inn: InnRank, dinner: boolean, cfg: SleepConfig): number {
  const q =
    cfg.innFactors[inn] * (dinner ? cfg.dinnerFactors.withDinner : cfg.dinnerFactors.noDinner);
  return Math.min(cfg.qualityMax, Math.max(cfg.qualityMin, q));
}

/**
 * スキル値 → ランク帯の添字（skillRanks の index）。
 * 帯が未設定なら常に 0。ランク名などの表示語彙は core に置かない
 * （表示側は cli.json display.skillRankNames を添字で引く）
 */
export function skillRankIndex(value: number, ranks: readonly SkillRankDef[] | undefined): number {
  if (ranks === undefined || ranks.length === 0) return 0;
  let r = 0;
  for (let i = 0; i < ranks.length; i++) {
    if (value >= ranks[i]!.at) r = i;
  }
  return r;
}

/** そのスキル値が属するランクの定着上限倍率（帯未設定なら 1） */
export function rankCapFactor(value: number, cfg: SleepConfig): number {
  return cfg.skillRanks?.[skillRankIndex(value, cfg.skillRanks)]?.capFactor ?? 1;
}

/** 起床ログの1行（スキル or 基礎能力の変化） */
export interface WakeLine {
  kind: "skill" | "stat";
  id: string;
  from: number;
  to: number;
  delta: number;
  /**
   * 上限で定着しきれず翌日に持ち越された分（F-01。頑張りは消えない ——
   * 朝に「+2.1 は明日に持ち越し」と出すための構造化データ）。
   * 0.05 未満の端数は表示しても +0.0 に丸まるだけなので立てない
   */
  carried?: number;
}

/** 睡眠でランク帯を越えた記録（F-01。起床ログで節目として大きく扱う材料） */
export interface SkillRankUp {
  skill: string;
  from: number;
  to: number;
  /** 越える前後のランク帯添字（表示名は表示側が skillRankNames で引く） */
  fromRank: number;
  toRank: number;
}

/** 起床ログの構造化データ。UI側はこれを整形する（文字列は core が組み立てない） */
export interface WakeReport {
  quality: number;
  inn: InnRank;
  dinner: boolean;
  /** 変化を伸びの小さい順に */
  lines: WakeLine[];
  /**
   * 「予想外の1行」の枠（派生の芽・錆の回復・気配など）。
   * 現時点では常に空。該当する機能が実装されたら末尾に置く。
   */
  surprises: string[];
  /** 翌日の追い風 */
  tailwinds: { id: string; label: string; direction: "tailwind" | "headwind" }[];
  /**
   * この睡眠でランク帯を越えたスキル（F-01。ランクの境目を跨いだときだけ入る。
   * 表示側は skillRankUp イベントと合わせて節目の演出に使う）
   */
  rankUps: SkillRankUp[];
  /** 疲労の推移（睡眠でどれだけ回復したか） */
  fatigue: { from: number; to: number };
  /** この睡眠でオーバーワークに陥った／継続中 */
  overwork: { active: boolean; became: boolean };
  /** 行動0回で眠った休養日か */
  restDay: boolean;
  /**
   * 今朝の天候（X-13。天候表が設定された世界でだけ入る）。
   * id/name は weather.json の種類、line はその日の風景の行 ——
   * 表示側はテンプレート（cli.json wake.weatherLine）に差し込んで1行出す
   */
  weather?: { id: string; name: string; line: string };
  /**
   * この睡眠でレベルの上がった武技（K-02。使って貯めた経験が眠りで定着し、
   * Lv の境目を越えた分だけ入る。表示側は wake.artLevelUp に差し込む）
   */
  arts?: { id: string; from: number; to: number }[];
  /**
   * この睡眠の定着で閃いた武技（K-02、09 §7.1。技能値×使い方の傾きで
   * 覚える条件を満たしたもの。表示側は wake.artLearned に差し込む）
   */
  artsLearned?: string[];
}

export interface ConsolidateResult {
  state: GameState;
  report: WakeReport;
}

/**
 * 全スキルの pending を定着させる。pending は「1スキルごと」に上限を適用する。
 * 上限超過分は翌日へ全量持ち越し（F-01：掛け率による消失は廃止）。
 * opts.capFactor: オーバーワーク等で上限ごと下げる倍率（省略時 1）
 * opts.skillFactor: 年齢帯（T-36）などによる定着量の倍率。消費する pending は
 *   変わらず、value の伸びだけが倍率で変わる（省略時 1）
 * opts.qualityOverride: rest コマンドなど宿・夕食を通さない場合の質の直接指定
 * opts.names: 起床ログに出すスキル表示名（省略時はID）
 */
export function consolidateSleep(
  state: GameState,
  inn: InnRank,
  dinner: boolean,
  cfg: SleepConfig,
  opts?: {
    capFactor?: number;
    skillFactor?: number;
    qualityOverride?: number;
    names?: Record<string, string>;
  },
): ConsolidateResult {
  const quality =
    opts?.qualityOverride !== undefined
      ? Math.min(cfg.qualityMax, Math.max(cfg.qualityMin, opts.qualityOverride))
      : sleepQuality(inn, dinner, cfg);
  const capBase = cfg.nightlyCapPerSkill * quality * (opts?.capFactor ?? 1);
  const totalCapBase = cfg.nightlyCapTotal * quality * (opts?.capFactor ?? 1);
  const lines: WakeLine[] = [];

  const surprises: string[] = [];
  const skills = { ...state.player.skills };

  // 錆（02 §7）：猶予を超えて使っていないスキルは睡眠時に下がる。
  // ランク係数・定着の from は錆びた後の値を使う（下がった技能は取り戻しも速い）
  if (cfg.rust) {
    const total = Object.values(skills).reduce((s, sk) => s + sk.value, 0);
    for (const [id, prev] of Object.entries(skills)) {
      const idle = state.time.day - prev.lastUsedDay;
      const decayed = rustedValue(prev.value, prev.peak, idle, total, cfg.rust);
      if (decayed < prev.value) {
        skills[id] = { ...prev, value: decayed };
        surprises.push(
          tplRust(cfg.rust.texts.rusted, {
            name: opts?.names?.[id] ?? id,
            loss: (prev.value - decayed).toFixed(1),
          }),
        );
      }
    }
  }

  // 第1段階：スキルごとの上限まで定着（上限はランク係数つき。低ランクほど大きい）。
  // 集中度も同時に計る —— その晩の未定着のうち最大の技能のシェアが focusShare
  // （既定 0.5）を超えていれば、その技能のランク係数を合計上限にも掛ける
  const appliedMap = new Map<string, number>();
  let appliedSum = 0;
  let pendingSum = 0;
  let topPending = 0;
  let topFactor = 1;
  for (const [id, prev] of Object.entries(skills)) {
    if (prev.pending <= 0) continue;
    const f = rankCapFactor(prev.value, cfg);
    const applied = Math.min(prev.pending, capBase * f);
    appliedMap.set(id, applied);
    appliedSum += applied;
    pendingSum += prev.pending;
    if (prev.pending > topPending) {
      topPending = prev.pending;
      topFactor = f;
    }
  }
  // 第2段階：合計上限を超えたら比例配分で縮める
  const focusShare = cfg.focusShare ?? 0.5;
  const totalCapFactor = pendingSum > 0 && topPending / pendingSum >= focusShare ? topFactor : 1;
  const totalCap = totalCapBase * totalCapFactor;
  const scale = appliedSum > totalCap && appliedSum > 0 ? totalCap / appliedSum : 1;

  const rankUps: SkillRankUp[] = [];

  for (const [id, prev0] of Object.entries(skills)) {
    if (prev0.pending <= 0) continue;
    const applied = (appliedMap.get(id) ?? 0) * scale;
    const from = prev0.value;
    // peak 未満の再習得は relearnFactor 倍速い（身体が覚えている）。
    // peak に達した分で倍率を打ち切り、残りは1倍で継続する
    let to = from + applied;
    if (cfg.rust && applied > 0 && from < prev0.peak) {
      const room = prev0.peak - from;
      const gainInRoom = Math.min(applied * cfg.rust.relearnFactor, room);
      const remaining = applied - gainInRoom / cfg.rust.relearnFactor;
      to = from + gainInRoom + remaining;
      surprises.push(
        tplRust(cfg.rust.texts.relearning, {
          name: opts?.names?.[id] ?? id,
          loss: "",
        }),
      );
    }
    // 年齢帯のスキル係数（T-36）：pending の消費量は変えず、伸びだけが倍率で変わる
    to = from + (to - from) * (opts?.skillFactor ?? 1);
    // F-01：上限を超えた分は全量持ち越す（明日は続きから伸びる。消えない）
    const carried = prev0.pending - applied;
    const fromRank = skillRankIndex(from, cfg.skillRanks);
    const toRank = skillRankIndex(to, cfg.skillRanks);
    if (toRank > fromRank) rankUps.push({ skill: id, from, to, fromRank, toRank });
    skills[id] = {
      ...prev0,
      value: to,
      peak: Math.max(prev0.peak, to),
      pending: carried,
      potential: prev0.potential * Math.pow(1 - cfg.potentialDecayPerPoint, applied),
    };
    if (to > from)
      lines.push({
        kind: "skill",
        id,
        from,
        to,
        delta: to - from,
        ...(carried >= 0.05 ? { carried } : {}),
      });
  }

  // 伸びの小さい順（02 §3：最後に予想外の1行が来る並び）
  lines.sort((a, b) => a.delta - b.delta);

  return {
    state: { ...state, player: { ...state.player, skills } },
    report: {
      quality,
      inn,
      dinner,
      lines,
      surprises,
      tailwinds: [],
      rankUps,
      fatigue: { from: state.player.fatigue, to: state.player.fatigue },
      overwork: { active: false, became: false },
      restDay: false,
    },
  };
}

/** stats 定着の行を追加する拡張点（T-08 の基礎能力が使う） */
export function statLine(id: StatId, from: number, to: number): WakeLine {
  return { kind: "stat", id, from, to, delta: to - from };
}
