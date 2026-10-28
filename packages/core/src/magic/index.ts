import { manaMaxOf, type ArtDef, type MagicElement, type StatusId } from "../arts/index.js";
import { createRng } from "../rng/index.js";
import type { GameState } from "../state/types.js";

/**
 * 魔法（M-01、docs/09_skills_and_magic.md §4〜5）。
 *
 * - 呪文は武技と同じ器（ArtDef + spell 節）に載る。8枠の戦闘スロットに
 *   武技と自由に混ぜられる（09 §6）。戦闘側の解決は combat/ が担う
 * - ここには魔法だけの導出を集める：
 *   - 属性適性（seed × 主体 × 属性の決定的な抽選。主人公もNPCも同じ分布）
 *   - 詠唱の長さ・中断の確率（技能で短く・安定する）
 *   - 呪文威力（技能・精神・適性・Lv の積）
 *   - 属性の相性（濡れ＋雷＝感電、油＋火＝延焼、凍結＋打撃＝砕く、風＋火＝火勢拡大）
 *   - 生活魔法の窓（cook/smith/farm/alchemy/gather/camp/heal/preserve）と付与
 * - 乱数は seed×主体×属性の独立した列だけを使う。state.rng は消費しない
 */

/* ── 適性（09 §4「適性は出自とシードで決まる。主人公は平凡」） ── */

/**
 * 属性適性を引く。戻り値は 0〜1（中央は aptitudeMean、±aptitudeSpread の
 * 対称三角分布 —— 極端な適性ほど稀、だれにも特別な適性を与えない）。
 * subject は主体を表す文字列：主人公は `origin:<出自id>`、
 * NPC・ライバルは `npc:<人物id>` —— どの主体も同じ分布から引くので、
 * 主人公の適性は「その世界の誰かと同じ引き」でしかない（同分布の検証はテスト）
 */
export function elementAptitude(
  seed: string,
  subject: string,
  element: MagicElement,
  cfg: MagicConfig,
): number {
  const rng = createRng(`${seed}:apt:${subject}:${element}`);
  const u = rng.next() + rng.next() - 1; // 対称三角分布 [-1, 1]
  const v = cfg.aptitudeMean + u * cfg.aptitudeSpread;
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

/**
 * 主人公の属性適性（全属性）。出自が主体になり、出自由来の
 * 小さな偏り（origins.json の elementBias）だけが足される。
 * 偏りはごく僅か（±0.1 まで）で、分布の形そのものは変わらない
 */
export function playerAptitudes(
  state: GameState,
  cfg: MagicConfig,
  elementBias?: Partial<Record<MagicElement, number>>,
): Record<MagicElement, number> {
  const subject = `origin:${state.player.origin || "none"}`;
  const out = {} as Record<MagicElement, number>;
  for (const el of ELEMENT_KEYS) {
    const v = elementAptitude(state.seed, subject, el, cfg) + (elementBias?.[el] ?? 0);
    out[el] = Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  }
  return out;
}

/** NPC・ライバルの属性適性（主人公と同じ分布。主体の違いで別の引きになる） */
export function npcAptitudes(
  seed: string,
  npcId: string,
  cfg: MagicConfig,
): Record<MagicElement, number> {
  const out = {} as Record<MagicElement, number>;
  for (const el of ELEMENT_KEYS) out[el] = elementAptitude(seed, `npc:${npcId}`, el, cfg);
  return out;
}

const ELEMENT_KEYS: readonly MagicElement[] = [
  "fire",
  "water",
  "wind",
  "earth",
  "light",
  "dark",
  "void",
  "life",
  "cure",
];

/* ── 詠唱（09 §4「詠唱の時間がかかる・熟練で短縮・極めると無詠唱」） ── */

/**
 * 実効の詠唱 tick。技能が高いほど短くなり（cast − 技能 × perSkill）、
 * パッシブ castSpeed（割合短縮）を掛け、castMin が下限。
 * パッシブ instantCast が 1 以上なら 0 —— 無詠唱（なろう系の定番）
 */
export function castTicksOf(
  def: ArtDef,
  skillValue: number,
  passiveFx: Record<string, number>,
  cfg: MagicConfig,
): number {
  const sp = def.spell;
  if (sp === undefined) return 0;
  if ((passiveFx["instantCast"] ?? 0) >= 1) return 0;
  const speed = Math.min(0.9, Math.max(0, passiveFx["castSpeed"] ?? 0));
  const t = (sp.cast - skillValue * cfg.castPerSkill) * (1 - speed);
  return Math.max(cfg.castMin, Math.round(t));
}

/**
 * 詠唱を攻撃で中断される確率（09 §4「攻撃されると中断されうる」）。
 * 魔力操作の技能が高いほど集中が切れにくい（interruptPerManaSkill）。
 * 下限 interruptMin、上限 interruptMax にクランプ
 */
export function interruptChanceOf(manaSkill: number, cfg: MagicConfig): number {
  return Math.min(
    cfg.interruptMax,
    Math.max(cfg.interruptMin, cfg.interruptBase - manaSkill * cfg.interruptPerManaSkill),
  );
}

/* ── 呪文威力 ── */

/**
 * 呪文の素の威力（技能・精神・適性・Lv の積。武器の攻撃力は参照しない）。
 * 命中・揺らぎ・耐性・相性は combat 側で畳む
 */
export function spellPowerOf(
  def: ArtDef,
  lv: number,
  skillValue: number,
  spirit: number,
  aptitude: number,
  levelPowerFactor: number,
  cfg: MagicConfig,
): number {
  const base = cfg.powerBase + skillValue * cfg.powerPerSkill + spirit * cfg.powerPerSpirit;
  const lvF = 1 + (lv - 1) * levelPowerFactor;
  const aptF = cfg.aptitudePowerBase + aptitude * cfg.aptitudePowerScale;
  return Math.round(base * (def.power ?? 1) * lvF * aptF * 10) / 10;
}

/* ── 属性の相性（09 §5） ── */

/** 相性の1件（balance.magic.interactions）。布石の状態 × 打ち手の属性/性質で発火 */
export interface ElementInteraction {
  id: string;
  /** 敵に掛かっていなければならない状態（濡れ・油・凍結・燃焼…） */
  primer: StatusId;
  /**
   * 打ち手の照合キー：呪文の属性（"fire" など）か、
   * 物理の打撃の性質（"blunt" など DamageType）に一致すると発火する
   */
  strike: string;
  /** 発火した一撃への威力倍率 */
  damage: number;
  /** 発火時に掛ける状態（感電・延焼など。省略時は状態を掛けない） */
  status?: StatusId;
  statusTicks?: number;
  statusPower?: number;
  /** 布石の状態を延ばす tick（風で燃え広がる、など。省略時は延ばさない） */
  extend?: number;
  /** 発火後に布石の状態を消すか（砕く・延焼は消費する） */
  consume: boolean;
}

/**
 * 掛かっている状態と打ち手（呪文属性 or 打撃の性質）から相性を引く。
 * 布石が複数あっても最初に一致した1件だけ発火する（事故を読みやすくするため）
 */
export function interactionOf(
  enemyStatus: Partial<Record<StatusId, { until: number }>>,
  strikeKey: string,
  tick: number,
  cfg: MagicConfig,
): ElementInteraction | undefined {
  return cfg.interactions.find(
    (i) =>
      i.strike === strikeKey &&
      enemyStatus[i.primer] !== undefined &&
      (enemyStatus[i.primer]?.until ?? 0) > tick,
  );
}

/* ── 生活魔法（09 §4「戦闘以外で役立つ」） ── */

/**
 * 生活魔法が使えるか（learn 済み・kind:"life"・魔力が足りる）。
 * 効果の適用は各コマンド（cook/work/gather/sleep/lifeSpell）が担う
 */
export function canLifeSpell(
  state: GameState,
  id: string,
  defs: Record<string, ArtDef>,
): { ok: boolean; def?: ArtDef; reason?: "unknown" | "notLearned" | "notLife" | "mana" } {
  const def = defs[id];
  if (def === undefined || def.spell === undefined) return { ok: false, reason: "unknown" };
  if (def.kind !== "life" || def.spell.life === undefined)
    return { ok: false, def, reason: "notLife" };
  if ((state.player.arts[id]?.lv ?? 0) < 1) return { ok: false, def, reason: "notLearned" };
  if (state.player.mana < def.spell.mana) return { ok: false, def, reason: "mana" };
  return { ok: true, def };
}

/** 生活魔法が掛けた効果を保持するカウンタのキー（使った行動で消費される） */
export function lifeBuffKey(hook: string): string {
  return `spell.buff.${hook}`;
}

/** 掛かっている生活魔法の効果量（0 なら未適用） */
export function lifeBuffOf(state: GameState, hook: string): number {
  return state.counters[lifeBuffKey(hook)] ?? 0;
}

/** 生活魔法の効果を消費する（使う行動側が呼ぶ。新しい counters を返す） */
export function consumeLifeBuff(
  counters: Record<string, number>,
  hook: string,
): { counters: Record<string, number>; value: number } {
  const key = lifeBuffKey(hook);
  const value = counters[key] ?? 0;
  if (value <= 0) return { counters, value: 0 };
  const next = { ...counters };
  delete next[key];
  return { counters: next, value };
}

/* ── 付与（09 §4「鍛冶＋火魔法の付与（エンチャント）」） ── */

/** 武器についた付与の段数（counters["enchant.<weaponId>"]） */
export function enchantLevel(state: GameState, weapon: string): number {
  return Math.trunc(state.counters[`enchant.${weapon}`] ?? 0);
}

/** 付与できるか（鍛冶・火魔法の技能・魔力・段の上限。武器を所持していること） */
export function canEnchant(
  state: GameState,
  weapon: string,
  cfg: MagicConfig,
): { ok: boolean; reason?: "weapon" | "smithing" | "fire" | "mana" | "maxed" } {
  if (!state.player.weapons.includes(weapon)) return { ok: false, reason: "weapon" };
  const ench = cfg.enchant;
  if ((state.player.skills["smithing"]?.value ?? 0) < ench.smithing)
    return { ok: false, reason: "smithing" };
  if ((state.player.skills["fire_magic"]?.value ?? 0) < ench.fireMagic)
    return { ok: false, reason: "fire" };
  if (enchantLevel(state, weapon) >= ench.maxLevel) return { ok: false, reason: "maxed" };
  if (state.player.mana < ench.mana) return { ok: false, reason: "mana" };
  return { ok: true };
}

/** 付与による攻撃力係数（1 + 段数 × atkPerLevel）。戦闘の attackFactor に畳む */
export function enchantFactor(state: GameState, weapon: string, cfg: MagicConfig): number {
  return 1 + enchantLevel(state, weapon) * cfg.enchant.atkPerLevel;
}

/* ── 設定（balance.magic） ── */

/** 魔法まわりの係数。数値はすべて balance.json の magic 節から注入する */
export interface MagicConfig {
  /* 適性（seed×主体×属性の対称三角分布：mean ± spread） */
  aptitudeMean: number;
  aptitudeSpread: number;
  /** 適性 → 威力係数 = aptitudePowerBase + 適性 × aptitudePowerScale */
  aptitudePowerBase: number;
  aptitudePowerScale: number;
  /* 呪文威力 = (powerBase + 技能 × perSkill + 精神 × perSpirit) × def.power × Lv係数 × 適性係数 */
  powerBase: number;
  powerPerSkill: number;
  powerPerSpirit: number;
  /* 詠唱：実効 tick = max(castMin, (cast − 技能 × castPerSkill) × (1 − castSpeed)) */
  castPerSkill: number;
  castMin: number;
  /* 詠唱の中断：確率 = clamp(interruptMin..Max, interruptBase − 魔力操作 × interruptPerManaSkill) */
  interruptBase: number;
  interruptPerManaSkill: number;
  interruptMin: number;
  interruptMax: number;
  /** 戦闘中、経過 tick ごとに戻る魔力 */
  manaRegenPerTick: number;
  /** 属性の相性（09 §5。濡れ＋雷・油＋火・凍結＋打撃・風＋火） */
  interactions: ElementInteraction[];
  /** 生活魔法が効く仕事の種目（仕事の kind → 品質ボーナスの対象表） */
  lifeWorkKinds: { hook: string; kinds: string[] }[];
  /** 付与（エンチャント。鍛冶＋火魔法が要件） */
  enchant: {
    /** 付与に必要な鍛冶の技能値 */
    smithing: number;
    /** 付与に必要な火魔法の技能値 */
    fireMagic: number;
    /** 1回の付与が消費する魔力 */
    mana: number;
    /** 1本の武器に掛けられる段の上限 */
    maxLevel: number;
    /** 1段あたりの攻撃力への加算（attackFactor に畳む） */
    atkPerLevel: number;
  };
}

/**
 * その行動（戦闘コマンド）が使った武器の付与込みの attackFactor を引く。
 * 称号等の attackFactor に乗算する形で畳む（combat.startCombat の第4引数）
 */
export function attackFactorWithEnchant(
  state: GameState,
  weapon: string | undefined,
  base: number,
  cfg: MagicConfig | undefined,
): number {
  if (cfg === undefined || weapon === undefined) return base;
  return base * enchantFactor(state, weapon, cfg);
}

export { manaMaxOf };
