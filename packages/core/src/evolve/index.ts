import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import { createRng } from "../rng/index.js";
import type { TimeConfig } from "../time/index.js";
import type { ArtDef, ArtsConfig, EvolveBranch } from "../arts/index.js";
import type { GameState } from "../state/types.js";

/**
 * 技の進化・合成・ユニークスキル（K-03、docs/09 §7「なろう系」）。
 *
 * - **進化**：技・魔法が Lv10（maxLevel）に達すると上位に進化する。
 *   どの分岐に進化するかはプレイヤーが選ぶのではなく、使い方の記録
 *   （artTags の使用タグ）が分岐ごとの「状況の重み」に最も合うもので決まる。
 *   どの分岐にも合わない極端な使い方は、まれに隠し分岐（hidden）に通じる
 * - **合成**：技能・技の組み合わせで新しい技が生まれる。条件は
 *   データ（hidden/k03）側にあり、ヒントだけが噂・書物に載る
 * - **ユニーク**：その世界で一人だけ持てる技。厳しい条件で得るが、
 *   ライバルが先に取ることもある（眠りのあいだに世界が動く）。
 *   取った事実は新聞と世界の記録（state.uniques）に残る
 *
 * 乱数は state.rng を消費しない —— ライバルの先取りだけは世界シード×
 * 技×日付の独立した乱数列から引く（決定論的）
 */

/** その技の使用タグのシェア（母数は artTags[id]["use.total"]） */
function artTagShare(
  artTags: Record<string, Record<string, number>> | undefined,
  artId: string,
  tag: string,
): number {
  const rec = artTags?.[artId];
  if (rec === undefined) return 0;
  const total = rec["use.total"] ?? 0;
  if (total <= 0) return 0;
  return (rec[tag] ?? 0) / total;
}

/**
 * 分岐スコア：Σ weight × share(使用タグ)。
 * 「その分岐が向いている使い方を、どれだけの割合で積み重ねてきたか」
 */
export function branchScore(
  artTags: Record<string, Record<string, number>> | undefined,
  artId: string,
  branch: EvolveBranch,
): number {
  let score = 0;
  for (const [tag, w] of Object.entries(branch.weights)) {
    score += w * artTagShare(artTags, artId, tag);
  }
  return score;
}

/**
 * 傾きの可視化（09 §7.1「今どちらに傾いているか」）。
 * 公開分岐ごとのスコアを返す —— 進化形の名は返さず、傾きの軸（tilt）と
 * その強さだけ。ステータスの技タブがそのままメーターに使う。
 * 隠し分岐はここには出さない（存在自体を伏せる）
 */
export function evolveTilts(
  artTags: Record<string, Record<string, number>> | undefined,
  def: ArtDef,
): { tilt: string; share: number }[] {
  if (def.evolve === undefined) return [];
  return def.evolve.branches.map((b) => ({
    tilt: b.tilt,
    share: Math.min(1, branchScore(artTags, def.id, b)),
  }));
}

/**
 * 進化の設定（balance.evolution ＋ hidden の分岐表）。
 * 隠し分岐は from（元の技ID）ごとの EvolveBranch 列 —— 公開分岐と
 * 同じ形で判定するが、選ばれるには「極端さ」の閾値を越える必要がある
 */
export interface EvolutionConfig {
  /**
   * 隠し分岐が出る主シェアの下限（0〜1）：分岐の重みが掛かっている
   * 使用タグのうち最も偏ったもののシェアがこれ以上で、かつ公開分岐の
   * 最良スコアを上回ったときだけ隠し分岐に進化する
   */
  hiddenShareMin: number;
  /**
   * 隠し分岐の表（hidden/k03 由来）：元の技ID → 分岐列。
   * 無い世界・読み込まない経路では省略
   */
  hidden?: Record<string, readonly EvolveBranch[]>;
}

/** 進化先の決定（null なら進化しない：分岐が無い・進化先の定義が無い） */
export function pickEvolution(
  state: GameState,
  def: ArtDef,
  arts: ArtsConfig,
  cfg: EvolutionConfig,
): { to: string; reason: string; hidden: boolean } | null {
  const branches = (def.evolve?.branches ?? []).filter((b) => arts.defs[b.to] !== undefined);
  if (branches.length === 0) return null;
  let best = branches[0]!;
  let bestScore = branchScore(state.player.artTags, def.id, best);
  for (const b of branches.slice(1)) {
    const s = branchScore(state.player.artTags, def.id, b);
    if (s > bestScore) {
      best = b;
      bestScore = s;
    }
  }
  /* 隠し分岐：公開のどの分岐にも合わない極端な使い方（重みの掛かるタグの
     主シェアが閾値以上）で、公開の最良を上回るときだけ通る（まれに） */
  const hidden = (cfg.hidden?.[def.id] ?? []).filter((b) => arts.defs[b.to] !== undefined);
  for (const b of hidden) {
    const dominant = Math.max(
      0,
      ...Object.keys(b.weights).map((tag) => artTagShare(state.player.artTags, def.id, tag)),
    );
    if (dominant < cfg.hiddenShareMin) continue;
    const s = branchScore(state.player.artTags, def.id, b);
    if (s > bestScore) {
      return { to: b.to, reason: b.reason, hidden: true };
    }
  }
  return { to: best.to, reason: best.reason, hidden: false };
}

/**
 * Lv10 の技を進化させる（睡眠の定着の後・習得判定と同じ場面で呼ぶ）。
 * 進化形は新しい技として Lv1 から育ち直し、構成スロットはそのまま
 * 引き継ぐ（眠りのあいだに形が変わっても使い手の構えは変わらない）。
 * 元の技の使用記録（artTags）は歴史として残す
 */
export function checkEvolution(
  state: GameState,
  arts: ArtsConfig,
  cfg: EvolutionConfig,
): { state: GameState; evolved: { from: string; to: string; reason: string; hidden: boolean }[] } {
  const evolved: { from: string; to: string; reason: string; hidden: boolean }[] = [];
  let arts_ = state.player.arts;
  let build = state.player.build;
  for (const [id, a] of Object.entries(arts_)) {
    if (a.lv < arts.maxLevel) continue;
    const def = arts.defs[id];
    if (def === undefined) continue;
    const pick = pickEvolution(state, def, arts, cfg);
    if (pick === null) continue;
    if (arts_[pick.to] !== undefined) continue; // 既に持っている形には化けない
    arts_ = { ...arts_ };
    delete arts_[id];
    arts_[pick.to] = { lv: 1, exp: 0, pending: 0 };
    // 構成スロットは同じ位置で引き継ぐ（進化しても構えは崩れない）
    build = {
      ...build,
      slots: build.slots.map((s) => (s === id ? pick.to : s)),
      passives: build.passives.map((s) => (s === id ? pick.to : s)),
    };
    evolved.push({ from: id, to: pick.to, reason: pick.reason, hidden: pick.hidden });
  }
  if (evolved.length === 0) return { state, evolved };
  // 進化の累計刻印（counters["art.evolved"]）は artEvolved イベントの
  // 購読者が刻む —— ここでは二重に数えない
  return {
    state: { ...state, player: { ...state.player, arts: arts_, build } },
    evolved,
  };
}

/* ── 合成（09 §7「2つの技能・技の組み合わせで新しい技」） ── */

/**
 * 合成レシピ（hidden/k03 由来。条件は伏せられ、ヒントだけが噂に載る）。
 * condition は条件DSL —— {skill}/{art}/{counter} などの組み合わせ
 */
export interface SynthesisRecipe {
  /** 生まれる技（defs の特別な技。learn.at は持たない） */
  to: string;
  /** 条件（条件DSL。全部満たすと技が生まれる） */
  condition: Cond;
  /** 噂・書物に載るヒントの文（条件そのものは明かさない） */
  hint?: string;
}

/**
 * 合成の判定：条件を満たす未獲得のレシピを全部生やす。
 * 習得判定（checkArtsLearn）と同じ場面で呼ぶ —— 技・技能・刻印が
 * 揃った瞬間に生まれる（「響き合い」）
 */
export function checkSynthesis(
  state: GameState,
  recipes: readonly SynthesisRecipe[],
  time: TimeConfig,
  env?: CondEnv,
): { state: GameState; learned: string[] } {
  const learned: string[] = [];
  const arts = { ...state.player.arts };
  for (const r of recipes) {
    if (arts[r.to] !== undefined) continue;
    if (!evaluate(r.condition, state, time, env)) continue;
    arts[r.to] = { lv: 1, exp: 0, pending: 0 };
    learned.push(r.to);
  }
  if (learned.length === 0) return { state, learned };
  // 響き合いの累計刻印（counters["art.synthesized"]）は artSynthesized
  // イベントの購読者が刻む —— ここでは二重に数えない
  return {
    state: { ...state, player: { ...state.player, arts } },
    learned,
  };
}

/**
 * 合成の噂（ヒントは噂・書物・見聞録に載る —— 09 §7）。
 * 未獲得のレシピから当日の一件を seed×日付で決定的に引く
 * （dailyDiscoveryHint と同じ仕組み。条件そのものは出さない）
 */
export function synthesisHintOf(
  seed: string,
  day: number,
  recipes: readonly SynthesisRecipe[],
  arts: Record<string, unknown>,
): SynthesisRecipe | null {
  const pending = recipes.filter((r) => arts[r.to] === undefined && r.hint !== undefined);
  if (pending.length === 0) return null;
  const i = createRng(`${seed}:synth:${day}`).int(0, pending.length - 1);
  return pending[i]!;
}

/* ── ユニークスキル（09 §7「その世界で一人だけ持てる技」） ── */

/**
 * ユニークスキルの定義（hidden/k03 由来）。条件は厳しめ
 * （偉業・極端な積み重ね。条件DSL で書く）
 */
export interface UniqueDef {
  /** 得られる技（defs の特別な技。learn.at は持たない） */
  art: string;
  /** 条件（条件DSL） */
  condition: Cond;
  /**
   * ライバルの先取り（任意）：dayMin 日以降、終わった日ごとに
   * 世界シード由来の抽選で chance の確率で先に取られる。
   * 省略時はライバルは狙わない（その世界の主導権はプレイヤーにある）
   */
  rival?: { dayMin: number; chance: number };
}

/** ユニークスキルの設定（hidden/k03 ＋ ライバルの顔ぶれの規模） */
export interface UniquesConfig {
  uniques: readonly UniqueDef[];
  /** ライバルの抽選人数（balance.rivals.size。0 なら先取りは起きない） */
  rivalSize: number;
}

/**
 * 主人公の獲得判定：条件を満たし、まだ誰の手にも渡っていない
 * ユニークを取る（通知Sランク相当 —— 「世界初」の出来事）。
 * 記録は state.uniques（一人だけ制約）に刻む
 */
export function checkUniques(
  state: GameState,
  cfg: UniquesConfig,
  time: TimeConfig,
  env?: CondEnv,
): { state: GameState; gained: string[] } {
  const gained: string[] = [];
  let arts = state.player.arts;
  let uniques = state.uniques;
  for (const u of cfg.uniques) {
    if (uniques[u.art] !== undefined) continue;
    if (!evaluate(u.condition, state, time, env)) continue;
    arts = { ...arts, [u.art]: { lv: 1, exp: 0, pending: 0 } };
    uniques = { ...uniques, [u.art]: { holder: "player", day: state.time.day } };
    gained.push(u.art);
  }
  if (gained.length === 0) return { state, gained };
  return {
    state: { ...state, player: { ...state.player, arts }, uniques },
    gained,
  };
}

/**
 * ライバルの先取り（眠りのあいだに世界が動く）：終わった日（day）に
 * 未請求のユニークそれぞれについて、世界シード×技×日付の抽選で
 * chance 未満ならライバルが取る。取った人は新聞と世界の記録に載る。
 * 返す rivalIndex はライバルの抽選順（"rival.<index>" の表示名は
 * 呼び出し側がランキングの抽選から解決する）
 */
export function checkRivalClaims(
  state: GameState,
  cfg: UniquesConfig,
  day: number,
): { state: GameState; claimed: { art: string; rivalIndex: number }[] } {
  const claimed: { art: string; rivalIndex: number }[] = [];
  let uniques = state.uniques;
  for (const u of cfg.uniques) {
    if (uniques[u.art] !== undefined) continue;
    if (u.rival === undefined || cfg.rivalSize <= 0) continue;
    if (day < u.rival.dayMin) continue;
    const roll = createRng(`${state.seed}:uniq:${u.art}:${day}`).next();
    if (roll >= u.rival.chance) continue;
    const who = createRng(`${state.seed}:uniq:${u.art}:${day}:who`).int(0, cfg.rivalSize - 1);
    uniques = { ...uniques, [u.art]: { holder: `rival.${who}`, day } };
    claimed.push({ art: u.art, rivalIndex: who });
  }
  if (claimed.length === 0) return { state, claimed };
  return { state: { ...state, uniques }, claimed };
}
