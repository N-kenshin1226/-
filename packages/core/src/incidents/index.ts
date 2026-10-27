import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import { npcGoneReason } from "../npclife/index.js";
import { mentorAbsent, type MentorDefLike } from "../mentors/index.js";
import { createRng } from "../rng/index.js";
import { drawRivalCast, type RivalsConfig, type RivalNamePool } from "../rivals/index.js";
import type { CrisisFieldId, GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * 日々の出来事（F-05、docs/devin_tasks/F-05_daily_events.md）。
 *
 * 仕事・訓練・狩りの合間に、街の小さな出来事が差し込まれる。旅人に道を
 * 聞かれる、喧嘩の仲裁、拾い物、珍しい客、師匠の気まぐれ、天候の急変 ——
 * 選択肢つきで、結果に幅がある（小さな得・小さな損・縁・手がかり・
 * ごく稀に大当たり）。勝負所の行事（occasions）とは別物で、こちらは
 * 会話と選択だけで終わる日常の挿話（ミニゲームは出さない）。
 *
 * 決定論：その日に起きる出来事は 日付＋世界シード由来の独立した乱数列
 * （`${seed}:incidents:${day}`）で決まり、結果の抽選も
 * `${seed}:incident-out:${day}:${id}:${choice}` の独立した乱数列で決まる。
 * 世界を進める乱数列（state.rng）は一切消費しない（危機接点・行事と同じ方式）。
 *
 * 状態は GameState に新しい欄を足さず、counters/flags から導出する：
 * - `incident.offer.day.<id>`       出来事が届いた日（再提示の間隔の基準＋今日の提示判定）
 * - `incident.offer.kind.<kind>`    同種の出来事が最後に届いた日（同種が続かない間隔）
 * - `incident.done.day.<id>`        応えた日（当日だけ有効 —— 応えなくても翌日には流れる）
 * - `incident.offered[.id]` / `incident.resolved[.id]`  届いた数・応えた数の記録
 *   （`once` の判定・条件DSL「あの出来事に応えた」・sim の頻度計測が読む）
 */

/** 出来事を運ぶ者：街の住人・名のあるライバル・弟子入り中の師匠（話し手なしの出来事もある） */
export type IncidentSpeaker =
  { kind: "npc"; id: string } | { kind: "rival"; index: number } | { kind: "mentor" };

/** 結果1件：結末の文と小さな効果。選んだ選択肢から重みつきで1件だけ引く */
export interface IncidentOutcome {
  /** 結果の抽選の重み（省略時 1） */
  weight?: number;
  /** 結末の一文（記録の行。「――」始まりの地の文） */
  text: string;
  /** 動く金（G。負の値で損失。所持金は 0 未満にならない） */
  money?: number;
  /** 未定着経験（skill は skills.json の id） */
  gain?: { skill: string; amount: number };
  /** 疲労の増減（負の値で回復） */
  fatigue?: number;
  /** 立つ旗印（縁・手がかりの刻印。条件DSLが読める） */
  flags?: string[];
  /** 加算するカウンタ（値は増分） */
  counters?: Record<string, number>;
  /** 見聞録に記すアトムの id（手がかり系の結果。lore/atoms の id） */
  atom?: string;
  /**
   * 世界の備えへの寄与（docs/08 §5。出来事が危機の接点になるとき）。
   * 進行中の危機が無い世界では何も足されない
   */
  contribution?: { field: CrisisFieldId; amount: number };
}

/** 選択肢1件。安全な手と賭けの手を並べるときは hint で匂わせる（「手堅い」「賭け」など） */
export interface IncidentChoice {
  id: string;
  label: string;
  /** 副題（選択の気配。「賭け」「手堅い」など。省略可） */
  hint?: string;
  outcomes: readonly IncidentOutcome[];
}

/** 出来事の定義（content/incidents.json。数値の組み合わせはバランスの一部としてJSON側に置く） */
export interface IncidentDef {
  id: string;
  /** 出来事の名（《》で囲まず、表示側で《name》と包む） */
  name: string;
  /** 出来事の種類（同じ種類が続かない間隔の単位。例: encounter / found / trouble / fate） */
  kind: string;
  /** 出来事の描写（会話窓に出す1〜2文の地の文） */
  text: string;
  /** 話し手（省略可。speaker があるときだけ say が効く） */
  speaker?: IncidentSpeaker;
  /** 話し手の台詞（speaker 必須） */
  say?: string;
  /** 提示条件（条件DSL。省略時は無条件 —— ただし日付・間隔の制は効く） */
  require?: Cond;
  /** 周期（市の日など）：(day - offset) % days === 0 の日だけ候補になる */
  every?: { days: number; offset?: number };
  /** 候補からの抽選の重み（省略時 1） */
  weight?: number;
  /** この出来事が再び届くまでの最小間隔（日。省略時は cfg.cooldownDays） */
  cooldownDays?: number;
  /** その生で一度だけ届く（届いた時点で二度と候補に挙がらない） */
  once?: boolean;
  /** 応えの選択肢（1〜3件。最後に「見送る」系の安全な手を置くのが目安） */
  choices: readonly IncidentChoice[];
}

/** balance.json の incidents 節＋注入する顔ぶれ（npc名・ライバル母集団・師匠の人物） */
export interface IncidentsConfig {
  incidents: readonly IncidentDef[];
  /** 1日に起きる出来事の上限（0〜2 を想定） */
  perDay: number;
  /** 出来事が起きる日の基本確率（起きない日もある —— 日常は作業にならない） */
  chance: number;
  /** 2件目が起きる確率（perDay >= 2 のときだけ振られる） */
  secondChance: number;
  /** def.cooldownDays 未指定時の再提示間隔（日） */
  cooldownDays: number;
  /** 同じ種類（kind）が続かない既定の間隔（日） */
  kindGapDays: number;
  /**
   * 出来事の起きない日が続いたときの保証（F-05「3日に1回以上」）：
   * 最後に出来事が届いた日からこの日数が経つと、その日の抽選は確実に起きる。
   * まだ一度も届いていない生では効かない（0日目から出る保証はしない）
   */
  pityGapDays: number;
  /** 話し手に街の住人を使うための名簿（voices.json 由来） */
  npcs?: readonly { id: string; name: string; role: string }[];
  /** 話し手にライバルを使うための母集団（rivals.json ＋ balance.rivals） */
  rivals?: RivalNamePool & Pick<RivalsConfig, "size" | "scoreMin" | "scoreMax" | "growthPerDay">;
  /** 「師匠」の話し手の解決に使う師匠表（mentors.json の id と npc 紐付け） */
  mentors?: readonly MentorDefLike[];
}

// ---- counters/flags の刻印（GameState の形は変えない） ----

/** その出来事が最後に届いた日（今日届いているか・再提示間隔の基準） */
export const incidentOfferDayKey = (id: string): string => `incident.offer.day.${id}`;
/** その種類の出来事が最後に届いた日（同種が続かない間隔の基準） */
export const incidentOfferKindDayKey = (kind: string): string => `incident.offer.kind.${kind}`;
/** その出来事に応えた日（同日の二度応えを防ぐ） */
export const incidentDoneDayKey = (id: string): string => `incident.done.day.${id}`;
/** 出来事が最後に届いた日（どの出来事でも。保証の間隔の基準） */
export const incidentLastOfferKey = "incident.offer.last";

/** id → 出来事の定義 */
export function incidentDef(cfg: IncidentsConfig, id: string): IncidentDef | undefined {
  return cfg.incidents.find((d) => d.id === id);
}

/** 今日届いている出来事（応えたかどうかつき）。届いた日の刻印が今日のものだけ */
export interface IncidentOffer {
  def: IncidentDef;
  /** すでに応えた（当日の done が刻まれている） */
  resolved: boolean;
}

export function incidentOffers(state: GameState, cfg: IncidentsConfig): IncidentOffer[] {
  const day = state.time.day;
  return cfg.incidents
    .filter((d) => state.counters[incidentOfferDayKey(d.id)] === day)
    .map((def) => ({
      def,
      resolved: state.counters[incidentDoneDayKey(def.id)] === day,
    }));
}

/** いま応えられる出来事（今日届いていて未応答のもの。届いた順） */
export function incidentPendingChoice(state: GameState, cfg: IncidentsConfig): IncidentOffer[] {
  return incidentOffers(state, cfg).filter((o) => !o.resolved);
}

/**
 * 出来事を運ぶ者が街に居ないか（X-12：引退・旅立ち・亡くなった者は届かない）。
 * 師匠は「弟子入り中で、街に居る」ことが前提（弟子でなければ出来事自体が来ない）
 */
function speakerGone(sp: IncidentSpeaker, state: GameState, cfg: IncidentsConfig): boolean {
  if (sp.kind === "npc") return npcGoneReason(state, sp.id) !== null;
  if (sp.kind === "mentor") {
    if (state.mentor === null) return true;
    const def = cfg.mentors?.find((m) => m.id === state.mentor!.id);
    if (def === undefined) return true;
    return mentorAbsent(state, def) !== null;
  }
  if (cfg.rivals === undefined) return false;
  const cast = drawRivalCast(state.seed, cfg.rivals, cfg.rivals);
  return npcGoneReason(state, `rival.${sp.index % cast.length}`) !== null;
}

/** その日に候補に挙がるか（条件・周期・一度きり・再提示間隔・同種の間隔・話し手の在否） */
function eligible(
  def: IncidentDef,
  state: GameState,
  cfg: IncidentsConfig,
  time: TimeConfig,
  env?: CondEnv,
): boolean {
  const day = state.time.day;
  if (def.speaker !== undefined && speakerGone(def.speaker, state, cfg)) return false;
  // その生に一度だけ届く出来事：届いたことがあれば二度と候補に挙がらない
  if (def.once === true && (state.counters[`incident.offered.${def.id}`] ?? 0) > 0) {
    return false;
  }
  if (def.every !== undefined) {
    const offset = def.every.offset ?? 0;
    if (day < offset || (day - offset) % def.every.days !== 0) return false;
  }
  if (def.require !== undefined && !evaluate(def.require, state, time, env)) return false;
  // 同じ出来事が再び届くまでの間隔。今日既に届いたものは「抽選結果の一部」として残す
  const last = state.counters[incidentOfferDayKey(def.id)];
  if (last !== undefined && last < day && day - last < (def.cooldownDays ?? cfg.cooldownDays)) {
    return false;
  }
  const lastKind = state.counters[incidentOfferKindDayKey(def.kind)];
  if (lastKind !== undefined && lastKind < day && day - lastKind < cfg.kindGapDays) {
    return false;
  }
  return true;
}

/** その日の抽選済みの出来事（届く行動番号つき）。件数は perDay まで */
export interface IncidentDraw {
  def: IncidentDef;
  /** 何回目の行動の終わりに届くか（1〜actionsPerDay。その行動に達しなければ届かない） */
  slot: number;
}

/**
 * その日の出来事の抽選（日付＋世界シードの独立した乱数列 —— state.rng は消費しない）。
 * 届いた分を含む「その日の出来事の集合」を返す。候補がいても起きない日があり、
 * 2件目は secondChance 任せ。届くタイミング（slot）は行動の合間に散る
 */
export function drawIncidents(
  state: GameState,
  cfg: IncidentsConfig,
  time: TimeConfig,
  env?: CondEnv,
): IncidentDraw[] {
  const day = state.time.day;
  const pool = cfg.incidents.filter((d) => eligible(d, state, cfg, time, env));
  if (pool.length === 0) return [];
  const rng = createRng(`${state.seed}:incidents:${day}`);
  // 出来事の起きない日が pityGapDays 続いたら、その日は確実に起きる
  // （普通に遊んで3日に1回以上は出来事に出会う ―― 起きない日の連続に上限を設ける）
  const lastOffer = state.counters[incidentLastOfferKey];
  const due = lastOffer !== undefined && day - lastOffer >= cfg.pityGapDays;
  if (!due && !rng.chance(cfg.chance)) return [];
  const first = rng.weighted(pool.map((d) => ({ item: d, weight: d.weight ?? 1 })));
  const out: IncidentDraw[] = [{ def: first, slot: rng.int(1, time.actionsPerDay) }];
  if (cfg.perDay >= 2 && rng.chance(cfg.secondChance)) {
    // 同じ出来事・同じ種類は同日に並ばない
    const rest = pool.filter((d) => d.id !== first.id && d.kind !== first.kind);
    if (rest.length > 0) {
      const second = rng.weighted(rest.map((d) => ({ item: d, weight: d.weight ?? 1 })));
      out.push({ def: second, slot: rng.int(1, time.actionsPerDay) });
    }
  }
  return out.slice(0, cfg.perDay);
}

/**
 * いま届けるべき出来事：その日の抽選分のうち、届く行動番号（slot）に達していて
 * まだ届いていないもの。step が行動（actionPerformed）を刻んだステップの終わりに
 * 1件だけ届ける
 */
export function incidentPending(
  state: GameState,
  cfg: IncidentsConfig,
  time: TimeConfig,
  env?: CondEnv,
): IncidentDef[] {
  const day = state.time.day;
  // 今日届いた分を数える —— 候補の集合は条件の動きで日内に揺れうる
  // （所持金・時刻帯など）ので、届く総数はここで perDay に止める
  const offeredToday = cfg.incidents.filter(
    (d) => state.counters[incidentOfferDayKey(d.id)] === day,
  ).length;
  if (offeredToday >= cfg.perDay) return [];
  return drawIncidents(state, cfg, time, env)
    .filter((d) => d.slot <= state.time.action)
    .filter((d) => state.counters[incidentOfferDayKey(d.def.id)] !== day)
    .map((d) => d.def)
    .slice(0, cfg.perDay - offeredToday);
}

/** 話し手の表示名（ライバルは世界シードの抽選から、師匠は弟子入り中の師匠から解決） */
export function incidentSpeaker(
  state: GameState,
  cfg: IncidentsConfig,
  def: IncidentDef,
): { name: string; role?: string } | undefined {
  const sp = def.speaker;
  if (sp === undefined) return undefined;
  if (sp.kind === "rival") {
    if (cfg.rivals === undefined) return undefined;
    const cast = drawRivalCast(state.seed, cfg.rivals, cfg.rivals);
    const r = cast[sp.index % cast.length];
    return r !== undefined ? { name: r.name, role: r.epithet } : undefined;
  }
  const npcId =
    sp.kind === "mentor" ? cfg.mentors?.find((m) => m.id === state.mentor?.id)?.npc : sp.id;
  const n = npcId !== undefined ? cfg.npcs?.find((x) => x.id === npcId) : undefined;
  return n !== undefined ? { name: n.name, role: n.role } : undefined;
}

/**
 * 結果の抽選：選んだ選択肢の表から 世界シード×日付×出来事×選択肢 の
 * 独立した乱数列で1件を引く（state.rng は消費しない —— 同じ日・同じ選択には
 * 同じ結末が待っている。行動順やプレイ順で結果が揺れない）
 */
export function incidentOutcome(
  state: GameState,
  def: IncidentDef,
  choice: IncidentChoice,
): IncidentOutcome {
  const rng = createRng(`${state.seed}:incident-out:${state.time.day}:${def.id}:${choice.id}`);
  return rng.weighted(choice.outcomes.map((o) => ({ item: o, weight: o.weight ?? 1 })));
}

/** 出来事に応えられるか（今日届いていて未応答のものに限る。行動は消費しない） */
export function incidentChoosable(
  state: GameState,
  cfg: IncidentsConfig,
  id: string,
): IncidentOffer | undefined {
  const offer = incidentOffers(state, cfg).find((o) => o.def.id === id);
  return offer !== undefined && !offer.resolved ? offer : undefined;
}
