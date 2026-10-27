import { evaluate, type Cond } from "../conditions/index.js";
import { npcGoneReason } from "../npclife/index.js";
import { createRng } from "../rng/index.js";
import { drawRivalCast, type RivalsConfig, type RivalNamePool } from "../rivals/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 勝負所の行事（X-10、docs/03 §2「勝負所でミニゲームが出る」）。
 *
 * 仕事の注文や危機の決着とは別に、品評会・決闘・大取引のような
 * 「ここ一番の勝負」が、条件を満たす生き方にだけ打診として届く。
 * 届き方は人物からの持ちかけ（会話・打診の形）で、一覧のクエストボードにはしない。
 * 断っても不利益はなく、応えれば勝負所（既存のミニゲームの皮か決闘）に臨む。
 *
 * 決定論：その日に届く行事は `createRng(seed).fork` 系統の
 * 日付＋世界シード由来の独立した乱数列（`${seed}:occasions:${day}`）で決まる。
 * 世界を進める乱数列（state.rng）は一切消費しない（危機接点と同じ方式）。
 *
 * 状態は GameState に新しい欄を足さず、counters/flags/actionLog から導出する：
 * - `occasion.offer.day.<id>`      打診が届いた日（再提示の間隔の基準）
 * - `occasion.offer.kind.<kind>`   同種の行事が最後に届いた日（同種が続かない間隔）
 * - `occasion.join.day.<id>`       打診に応えた日（当日だけ有効）
 * - `occasion.attempt.day.<id>`    勝負所を果たした日（1日1回・同日再挑戦の防止）
 * - `occasion.won[.id|.kind]` / `occasion.lost[.id|.kind]`  勝敗の記録（称号・条件・新聞が読む）
 * - `occasion.renown`              勝負所由来の評判（ライバル・ランキングの実績点に乗る）
 */

/** 打診を運ぶ者：街の住人（voices.json の id）か、名のあるライバル（抽選の index）か */
export type OccasionSpeaker = { kind: "npc"; id: string } | { kind: "rival"; index: number };

/** 勝負の器：既存3エンジンのミニゲームの皮（対象技能＋勝ちの品質）か、一騎打ちの戦闘か */
export type OccasionVessel =
  | {
      kind: "minigame";
      /** 皮に使う技能ID（skills.json。例: smithing / appraisal / eloquence） */
      skill: string;
      /** 勝ちとみなす品質（0〜100） */
      targetQuality: number;
    }
  | {
      kind: "combat";
      /** 決闘の相手（enemies.json の id） */
      ref: string;
    };

/** 勝敗ごとの効果：賞金・評判（ランキングの実績点）・旗印（条件DSLが読める刻印） */
export interface OccasionSide {
  /** 動く金（G。勝ちは賞金、負けは掛け金の損失として負の値も書ける） */
  money?: number;
  /** 評判の増減（occasion.renown カウンタ。負けで減ることもある） */
  renown?: number;
  /** 勝敗で立つ旗印（称号・条件の材料にする刻印） */
  flags?: string[];
}

/** 行事の定義（content/occasions.json。数値の組み合わせはバランスの一部としてJSON側に置く） */
export interface OccasionDef {
  id: string;
  /** 行事の名（《》で囲まず、表示側で《name》と包む） */
  name: string;
  /** 行事の種類（同じ種類が続かない間隔の単位。例: exhibition / duel / deal / appraisal） */
  kind: string;
  speaker: OccasionSpeaker;
  /** 打診の台詞（会話窓に出す人物の言葉） */
  line: string;
  /** 提示条件（条件DSL。省略時は無条件 —— ただし日付・間隔の制は効く） */
  require?: Cond;
  /** 周期開催（品評会など）：(day - offset) % days === 0 の日だけ候補になる */
  every?: { days: number; offset?: number };
  /** 候補からの抽選の重み（省略時 1） */
  weight?: number;
  /** この行事が再び届くまでの最小間隔（日。省略時は cfg.cooldownDays） */
  cooldownDays?: number;
  vessel: OccasionVessel;
  /** 勝ったときの効果 */
  win?: OccasionSide;
  /** 負けたときの効果（敗北も記録される —— 数値が増えなくても物語は動く） */
  loss?: OccasionSide;
}

/** balance.json の occasions 節＋注入する顔ぶれ（npc名・ライバル母集団） */
export interface OccasionsConfig {
  occasions: readonly OccasionDef[];
  /** 1日に届く行事の上限（docs/03 §2「1日に1〜2回まで」） */
  offersPerDay: number;
  /** 行事が届く日の基本確率（届かない日もある —— 日常は作業にならない） */
  offerChance: number;
  /** 2件目が届く確率（offersPerDay >= 2 のときだけ振られる） */
  secondChance: number;
  /** def.cooldownDays 未指定時の再提示間隔（日） */
  cooldownDays: number;
  /** 同じ種類（kind）が続かない既定の間隔（日） */
  kindGapDays: number;
  /** 決闘（combat 器）で「勝った」とみなす出来の閾値（score >= これで勝ち） */
  combatWinScore: number;
  /** 決闘から逃げたときの出来（呼び出し側が score に換算する目安。勝ちではない） */
  combatFledScore: number;
  /** 話者に街の住人を使うための名簿（voices.json 由来。省略時は npc 話者は名前なし） */
  npcs?: readonly { id: string; name: string; role: string }[];
  /** 話者にライバルを使うための母集団（rivals.json ＋ balance.rivals） */
  rivals?: RivalNamePool & Pick<RivalsConfig, "size" | "scoreMin" | "scoreMax" | "growthPerDay">;
}

// ---- counters/flags の刻印（GameState の形は変えない） ----

/** その行事の打診が最後に届いた日 */
export const occasionOfferDayKey = (id: string): string => `occasion.offer.day.${id}`;
/** その種類の行事が最後に届いた日（同種が続かない間隔の基準） */
export const occasionOfferKindDayKey = (kind: string): string => `occasion.offer.kind.${kind}`;
/** 打診に応えた日（当日だけ有効） */
export const occasionJoinDayKey = (id: string): string => `occasion.join.day.${id}`;
/** 勝負所を果たした日（同日の再挑戦を防ぐ） */
export const occasionAttemptDayKey = (id: string): string => `occasion.attempt.day.${id}`;
/** 勝負所由来の評判（ライバル・ランキングの実績点に乗るカウンタ） */
export const OCCASION_RENOWN_KEY = "occasion.renown";

/** 今日届いている打診（打診→受諾→勝負所の進行状態つき） */
export interface OccasionOffer {
  def: OccasionDef;
  /** 打診に応えた（当日の join が刻まれている） */
  accepted: boolean;
  /** 勝負所を果たした（当日の attempt が刻まれている） */
  attempted: boolean;
}

/**
 * 今日届いた行事の一覧（届いた打診だけを見せる —— クエストボードにしない）。
 * 届いたかどうかは occasion.offer.day.<id> === 今日 で決まる（step が
 * occasionOffered イベントを発行したとき刻まれる）
 */
export function occasionOffers(state: GameState, cfg: OccasionsConfig): OccasionOffer[] {
  const day = state.time.day;
  return cfg.occasions
    .filter((d) => state.counters[occasionOfferDayKey(d.id)] === day)
    .map((def) => ({
      def,
      accepted: state.counters[occasionJoinDayKey(def.id)] === day,
      attempted: state.counters[occasionAttemptDayKey(def.id)] === day,
    }));
}

/**
 * 打診を運ぶ者が街に居ないか（X-12：引退・旅立ち・亡くなった者は打診を運ばない ——
 * 持ちかけは人物から届くので、居ない者の分の行事はその日の候補に挙がらない）
 */
function speakerGone(sp: OccasionSpeaker, state: GameState, cfg: OccasionsConfig): boolean {
  if (sp.kind === "npc") return npcGoneReason(state, sp.id) !== null;
  if (cfg.rivals === undefined) return false;
  const cast = drawRivalCast(state.seed, cfg.rivals, cfg.rivals);
  return npcGoneReason(state, `rival.${sp.index % cast.length}`) !== null;
}

/** その日に候補に挙がるか（条件・周期・再提示間隔・同種の間隔・話者の在否） */
function eligible(
  def: OccasionDef,
  state: GameState,
  cfg: OccasionsConfig,
  time: TimeConfig,
): boolean {
  const day = state.time.day;
  if (speakerGone(def.speaker, state, cfg)) return false;
  if (def.every !== undefined) {
    const offset = def.every.offset ?? 0;
    if (day < offset || (day - offset) % def.every.days !== 0) return false;
  }
  if (def.require !== undefined && !evaluate(def.require, state, time)) return false;
  // 同じ行事が再び届くまでの間隔。今日既に届いたものは「抽選結果の一部」として残す
  // （抽選は日のセットとして決定的 —— 届いた分を除くと残りの枠が別の抽選にずれる）
  const last = state.counters[occasionOfferDayKey(def.id)];
  if (last !== undefined && last < day && day - last < (def.cooldownDays ?? cfg.cooldownDays)) {
    return false;
  }
  const lastKind = state.counters[occasionOfferKindDayKey(def.kind)];
  if (lastKind !== undefined && lastKind < day && day - lastKind < cfg.kindGapDays) {
    return false;
  }
  return true;
}

/**
 * その日の行事の抽選（日付＋世界シードの独立した乱数列 —— state.rng は消費しない）。
 * 届いた打診を含む「その日の行事の集合」を返す。上限は offersPerDay。
 * 候補がいても届かない日がある（offerChance）し、2件目は secondChance 任せ
 */
function drawOccasions(state: GameState, cfg: OccasionsConfig, time: TimeConfig): OccasionDef[] {
  const day = state.time.day;
  const pool = cfg.occasions.filter((d) => eligible(d, state, cfg, time));
  if (pool.length === 0) return [];
  const rng = createRng(`${state.seed}:occasions:${day}`);
  if (!rng.chance(cfg.offerChance)) return [];
  const first = rng.weighted(pool.map((d) => ({ item: d, weight: d.weight ?? 1 })));
  const out = [first];
  if (cfg.offersPerDay >= 2 && rng.chance(cfg.secondChance)) {
    // 同じ種類は同日に並ばない（「同じ種類が続かない」は日またぎにも効く）
    const rest = pool.filter((d) => d.id !== first.id && d.kind !== first.kind);
    if (rest.length > 0) {
      out.push(rng.weighted(rest.map((d) => ({ item: d, weight: d.weight ?? 1 }))));
    }
  }
  return out.slice(0, cfg.offersPerDay);
}

/**
 * いま届けるべき打診（まだ届いていない抽選済みの行事）。
 * 届いた分＋これから届く分の合計が offersPerDay を超えないよう切り詰める。
 * step が1日のどこかの行動でこれを見て occasionOffered を発行する
 */
export function occasionPending(
  state: GameState,
  cfg: OccasionsConfig,
  time: TimeConfig,
): OccasionDef[] {
  const day = state.time.day;
  const delivered = cfg.occasions.filter(
    (d) => state.counters[occasionOfferDayKey(d.id)] === day,
  ).length;
  const remaining = cfg.offersPerDay - delivered;
  if (remaining <= 0) return [];
  return drawOccasions(state, cfg, time)
    .filter((d) => state.counters[occasionOfferDayKey(d.id)] !== day)
    .slice(0, remaining);
}

/** id → 行事の定義 */
export function occasionDef(cfg: OccasionsConfig, id: string): OccasionDef | undefined {
  return cfg.occasions.find((d) => d.id === id);
}

/** 打診を運ぶ者の表示名（ライバルは世界シードの抽選から解決 —— state.rng は消費しない） */
export function occasionSpeaker(
  state: GameState,
  cfg: OccasionsConfig,
  def: OccasionDef,
): { name: string; role?: string } | undefined {
  const sp = def.speaker;
  if (sp.kind === "rival") {
    if (cfg.rivals === undefined) return undefined;
    const cast = drawRivalCast(state.seed, cfg.rivals, cfg.rivals);
    const r = cast[sp.index % cast.length];
    return r !== undefined ? { name: r.name, role: r.epithet } : undefined;
  }
  const n = cfg.npcs?.find((x) => x.id === sp.id);
  return n !== undefined ? { name: n.name, role: n.role } : undefined;
}
