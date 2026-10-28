import {
  COMBAT_ART_KINDS,
  kiMaxOf,
  manaMaxOf,
  type ArtDef,
  type ArtsConfig,
  type BodyPart,
  type DamageType,
  type MagicElement,
  type StatusId,
} from "../arts/index.js";
import {
  castTicksOf,
  interactionOf,
  interruptChanceOf,
  spellPowerOf,
  type MagicConfig,
} from "../magic/index.js";
import { ctxRng, type MiniGameCtx } from "../minigame/types.js";
import { linkSum, type SkillLinks } from "../links/index.js";
import type { Rng } from "../rng/index.js";

/**
 * 予兆を読むCT制戦闘（docs/03_world_systems.md §4）。
 *
 * - 時間は tick。プレイヤーの行動は CT（敏捷で変化）だけ時間を進め、
 *   その間に敵の行動予定が来れば敵が動く（速い敵は1行動に2回動く）
 * - 敵の行動は固定ルールのパターン（enemies.json）。大技の前に「予兆」が出る
 * - 予兆の精度は《観察》で上がる：低いと「狼が唸っている」、高いと技名＋残りtick
 * - 「見切り」は1行動を使う代わりに予兆の精度を底上げし、その間は回避に大きな
 *   ボーナスが乗る（F-04。読み切れれば大技を無傷で躱し、大きな隙が生まれる）
 * - 「防御」は次の自分の行動まで受けるダメージを軽減する。大技を防御で受け止めると
 *   敵の体勢が崩れ（隙＋次行動の遅れ）、次の一撃が確実な反撃になる
 *
 * F-04 の駆け引き：
 * - 攻撃には命中判定（外れることがある）・ダメージの揺らぎ・会心がある
 * - 敵の攻撃にも揺らぎと痛恨（会心）がある。通常被弾は《回避》でごく僅かに躱せる
 * - 大技は防御（確実に軽減＋反撃の隙）か見切り（賭けの完全回避＋大きな隙）で
 *   対応する。対応しないと大きな傷を負う —— 格上では連打だけでは沈む
 *
 * 乱数はすべて ctx のシードから fork して引く（turn 番号＋用途ラベル）。
 * 同じシード・同じ行動列なら必ず同じ結果になる（決定性）。
 *
 * 戦闘はここに閉じ、結果は step の combat コマンドで GameState に反映する。
 * K-02（武技・気力・状態異常）への拡張口：
 *   - CombatAction に { type:"art"; id } 形の行動を足す場合、turn 冒頭の
 *     switch に解決枝を追加する。導出値は CombatState の playerXxx に乗せる
 *   - CombatEvent.type / フラグに技の結果種別を足せば UI・SE が拾える
 *   - 敵の耐性・弱点は EnemyMove/EnemyDef にフィールドを足す（zod 側も）
 *   - 「隙」（openingUntil/openingFactor）は武器技の追撃・崩し大技の土台になる
 */

export interface EnemyMove {
  id: string;
  name: string;
  power: number;
  /**
   * 呪文として放つ大技（M-01）。spells.json の呪文 id を持つ技は
   * 「敵の魔法」として扱い、観察中に発動を見届けると見取り稽古で
   * その呪文の見知り（spell.seen.<id>）を得られる
   */
  spell?: string;
}

/**
 * 敵の系統（G-04、docs/10_world_generation.md §11）：
 * 獣・人・不死・魔物・精霊・竜種。使用記録の foe.<family> タグと
 * 「何を相手にしてきたか」の世界の記録に使う。獣は beast としても扱う
 * （beast.attack / beast.exp の技能リンクが効く相手）
 */
export const ENEMY_FAMILIES = ["beast", "human", "undead", "demon", "spirit", "dragon"] as const;
export type EnemyFamily = (typeof ENEMY_FAMILIES)[number];

export interface EnemyPatternStep {
  /** attack=通常攻撃 / telegraph=大技の予兆（ticks 後に move が発動） */
  type: "attack" | "telegraph";
  move?: string;
  ticks?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  /** 行動間隔（tick）。小さいほど速い */
  intervalTicks: number;
  /** gain の挑戦差に使う相手の強さ */
  challenge: number;
  /** 逃走の抵抗・命中回避の差分に使う敏捷相当値 */
  agility: number;
  /** 獣か（K-01。beast.attack の技能リンクが与ダメージに乗る相手） */
  beast?: true;
  /**
   * 系統（G-04。enemies.json の family）。使用記録に foe.<family>
   * タグを足す —— 不死・魔物・精霊・竜種は foe.human と区別して数える
   */
  family?: EnemyFamily;
  attack: EnemyMove;
  moves: Record<string, EnemyMove>;
  pattern: EnemyPatternStep[];
  /* ── K-02：耐性・弱点・状態耐性・部位 ── */
  /**
   * 打撃の性質ごとの被ダメージ倍率（<1=耐性・>1=弱点・省略=1）。
   * 同じ構成では全部の敵に勝てないよう、種ごとに利きを分ける（09 §3）
   */
  resist?: Partial<Record<DamageType, number>>;
  /** 状態異常への耐性：付与率に掛ける倍率（0=効かない、省略=通常） */
  statusResist?: Partial<Record<StatusId, number>>;
  /** 壊せる部位（省略時は4部位すべて） */
  parts?: BodyPart[];
}

/**
 * 武器の定義（weapons.json、K-01「武器持ち替え」）。
 * 武器ごとに使う技能・威力・行動間隔・命中/会心補正が違い、
 * 戦闘中に1行動を消費して持ち替えられる
 */
export interface WeaponDef {
  id: string;
  name: string;
  /** 対応する武器技能（この技能が攻撃・命中・会心に乗る） */
  skill: string;
  /** 攻撃力への加算 */
  power: number;
  /** 行動 CT への倍率（1=標準。大きいほど重くて遅い武器） */
  ctFactor: number;
  /** 会心率への加算（負も可） */
  critBonus: number;
  /** 命中率への加算（負も可） */
  hitBonus: number;
  /** 防御中の追加軽減（0〜0.9。盾系。combat.defend リンクと合算し 0.9 まで） */
  defendBonus?: number;
  /** 武器屋での値段（G。省略時は売り物に出さない） */
  price?: number;
}

/** 武器表の無い cfg でも従来どおり動く素の剣（power 0・技能は剣術） */
const FALLBACK_WEAPON: WeaponDef = {
  id: "sword",
  name: "剣",
  skill: "swordplay",
  power: 0,
  ctFactor: 1,
  critBonus: 0,
  hitBonus: 0,
};

/**
 * 装備武器の定義を解決する（K-01）。
 * 未知・未指定の武器は既定の1本に倒す（表の先頭。content 側では initial
 * の先頭＝素手ではなく defaultWeapon が実装備になるよう保証済み）
 */
export function weaponDefOf(cfg: CombatConfig, id: string | undefined): WeaponDef {
  const table = cfg.weapons;
  if (table !== undefined) {
    if (id !== undefined && table[id] !== undefined) return table[id];
    const first = Object.values(table)[0];
    if (first !== undefined) return first;
  }
  return FALLBACK_WEAPON;
}

/** 技能リンク由来の戦闘係数（K-01、balance.links。startCombat で確定する） */
export interface CombatLinkBonuses {
  /** 与ダメージへの加算倍率（combat.attack） */
  attack: number;
  /** 命中率への加算（combat.hit） */
  hit: number;
  /** 会心率への加算（combat.crit） */
  crit: number;
  /** 回避率への加算（combat.evade） */
  evade: number;
  /** 防御中の追加軽減（combat.defend。武器の defendBonus と合算） */
  defend: number;
  /** 逃走成功率への加算（combat.flee） */
  flee: number;
  /** 敵の威力を減衰させる率（combat.enemyPower） */
  enemyPower: number;
  /** 獣への与ダメージ加算（beast.attack。獣でない敵には乗らない） */
  beastAttack: number;
}

export interface CombatConfig {
  /** プレイヤー耐久 = base + endurance × perEndurance */
  baseHp: number;
  hpPerEndurance: number;
  /** 攻撃力 = (base + 武器技能 × perWeaponSkill + strength × perStrength + 武器の威力) × 補正 */
  attackBase: number;
  attackPerWeaponSkill: number;
  attackPerStrength: number;
  /** 行動1回の消費tick = max(ctMin, ctBase − agility × ctPerAgility) */
  ctBase: number;
  ctPerAgility: number;
  ctMin: number;
  /** 防御中に受ける通常ダメージの倍率 */
  defendFactor: number;
  /** 逃走成功率 = base + (敏捷 − 敵敏捷) × perAgility（0〜1 にクランプ） */
  fleeBase: number;
  fleePerAgility: number;
  /** 「見切り」行動で予兆精度に乗るボーナス */
  observeBonus: number;
  /** 予兆が精密になる観察の閾値（これ未満は曖昧表示） */
  preciseObserve: number;
  /** 死亡時に失う未定着経験の割合（03 §4「50%」） */
  deathPendingFactor: number;

  /* ── F-04：命中・会心・揺らぎ・対応行動 ── */
  /** 攻撃の命中率 = base + 武器技能 × perWeaponSkill + (敏捷 − 敵敏捷) × perAgilityDiff + 武器補正 */
  hitBase: number;
  hitPerWeaponSkill: number;
  hitPerAgilityDiff: number;
  /** 命中率の上下限（hitMin〜hitMax にクランプ） */
  hitMin: number;
  hitMax: number;
  /** ダメージの揺らぎ（最終威力に掛ける一様乱数の範囲。敵・味方共通） */
  varianceMin: number;
  varianceMax: number;
  /** 会心率 = base + 武器技能 × perWeaponSkill + 武器補正。会心の倍率は critFactor */
  critBase: number;
  critPerWeaponSkill: number;
  critFactor: number;
  /** 敵の痛恨率・倍率（被弾側の揺らぎと緊張） */
  enemyCritBase: number;
  enemyCritFactor: number;
  /**
   * 通常被弾の回避率 = base + 回避 × perEvasion + (敏捷 − 敵敏捷) × perAgilityDiff
   * （0〜evadeMax にクランプ。防御中は回避判定をしない —— 受け止める構え）
   */
  evadeBase: number;
  evadePerEvasion: number;
  evadePerAgilityDiff: number;
  evadeMax: number;
  /** 見切り中の回避への上乗せ（大技も躱せる賭けの一手） */
  readEvadeBonus: number;
  /** 防御中に予兆の大技を受け止めたときの被ダメージ倍率（defendFactor より強い） */
  guardTelegraphFactor: number;
  /** 大技を防御で受け止めたあとの反撃倍率（次の攻撃が確定命中＋この倍率） */
  counterFactor: number;
  /** 大技を見切りで躱したあとの反撃倍率（防御より大きい隙） */
  counterFactorRead: number;
  /** 隙の持続（tick）。反撃は次の攻撃1回だけ有効 */
  openingTicks: number;
  /** 大技をいなした敵の次行動の遅れ（tick。体勢崩しの間、敵は間を置く） */
  staggerTicks: number;

  /** 強化版ユニーク（T-44）。省略時は強個体なし */
  unique?: UniqueConfig;
  /** 個体差（R-01）。省略時は個体差なし */
  individual?: IndividualConfig;
  /**
   * 武器の定義表（K-01、weapons.json）。指定すると武器技能の選択・
   * 武器ごとの威力/間隔/補正・戦闘中の持ち替えが効く。
   * 省略時は素の剣（技能=剣術・補正なし）で従来どおり動く
   */
  weapons?: Record<string, WeaponDef>;
  /**
   * 技能リンク（K-01、balance.links）。combat.*・beast.attack の
   * フックを読み、技能値を命中・会心・回避・防御・逃走・与/被ダメージ
   * の補正に変換する。省略時はリンク効果なし
   */
  links?: SkillLinks;
  /**
   * 武技・資源（K-02、balance.arts ＋ arts.json の defs）。
   * 指定すると { type:"art" } 行動・気力・状態異常・部位破壊・
   * 耐性/弱点・パッシブ構成が効く。省略時は従来の戦闘のまま
   */
  arts?: ArtsConfig;
  /**
   * 魔法（M-01、balance.magic）。arts と併用する：
   * spell 節を持つ定義は呪文として、魔力消費・詠唱・中断・属性相性が効く。
   * 省略時は spell 節のある技もただの武技として解決される（魔力を使わない）
   */
  magic?: MagicConfig;
}

/**
 * プレイヤー行動。武器の持ち替え（K-01）と武技（K-02）はオブジェクト形の行動。
 * { type:"art", id } は構成スロットに入っている技だけ使える
 */
export type CombatAction =
  | "attack"
  | "defend"
  | "observe"
  | "flee"
  | { type: "switch"; weapon: string }
  | { type: "art"; id: string };

export interface Telegraph {
  move: string;
  name: string;
  /** 発動する tick */
  dueTick: number;
  /** 呪文の詠唱（M-01。敵の魔法は spell id が載り、UI は「詠唱」として描く） */
  spell?: string;
}

export interface CombatEvent {
  tick: number;
  type:
    | "playerAttack"
    | "playerMiss"
    | "playerDefend"
    | "playerObserve"
    | "playerFlee"
    | "playerSwitch"
    | "enemyHit"
    | "enemyMiss"
    | "telegraph"
    | "counter"
    | "fled"
    | "won"
    | "lost"
    /* ── K-02 ── */
    /** 武技の一撃が当たった（art 名は text に、IDは art に） */
    | "playerArt"
    /** 武技が外れた */
    | "playerArtMiss"
    /** 武技を使えなかった（気力不足・スロット外。行動は空費される） */
    | "playerArtFail"
    /** 敵に状態異常が掛かった */
    | "statusApplied"
    /** 出血・毒の継続ダメージ（敵側） */
    | "statusTick"
    /** 部位が壊れた */
    | "partBroken"
    /** 予兆が割り込みで潰れた */
    | "interrupted"
    /** 敵が気絶して行動を逃した */
    | "stunned"
    /** 受け流しでいなした（被弾は parryFactor に減る） */
    | "parried"
    /* ── M-01：魔法 ── */
    /** 呪文の詠唱を始めた（詠唱中に攻撃されると中断されうる） */
    | "playerCast"
    /** 呪文が発動して当たった・回復した（art に呪文ID） */
    | "playerSpell"
    /** 呪文は発動したが外れた */
    | "playerSpellMiss"
    /** 詠唱が攻撃で中断された（魔力は戻らない） */
    | "castBroken"
    /** 属性の相性が発火した（濡れ＋雷・油＋火・凍結＋打撃・風＋火） */
    | "reaction"
    /** 観察中に敵の呪文の発動を見届けた（見取り稽古。spell に呪文ID） */
    | "spellSeen";
  text: string;
  damage?: number;
  /** 回復量（playerSpell の治癒呪文） */
  heal?: number;
  /** 会心（playerAttack / playerArt / playerSpell / enemyHit） */
  crit?: boolean;
  /** 予兆の大技による被弾・回避（enemyHit / enemyMiss） */
  big?: boolean;
  /** 防御・鉄壁で受け止めた被弾（enemyHit） */
  guarded?: boolean;
  /** 隙への反撃としての一撃（playerAttack / playerArt / playerSpell） */
  counter?: boolean;
  /** 使った技・呪文のID（playerArt / playerArtMiss / playerArtFail / playerCast / playerSpell / playerSpellMiss / castBroken） */
  art?: string;
  /** 掛かった・消えた状態（statusApplied / statusTick / reaction の布石消費） */
  status?: StatusId;
  /** 壊れた部位（partBroken） */
  part?: BodyPart;
  /** 発火した相性の id（reaction） */
  reaction?: string;
  /** 敵が放った呪文（telegraph の spell / spellSeen の見取り先） */
  spell?: string;
}

export interface CombatState {
  tick: number;
  /** プレイヤーの行動数（乱数 fork のラベルに使う。同じ行動列は同じ乱数列） */
  turn: number;
  playerHp: number;
  playerHpMax: number;
  enemyHp: number;
  /** 敵の体力上限（開始時点。ゲージの max に使う） */
  enemyHpMax: number;
  enemyIdx: number;
  /** 次に敵のパターンが進む tick（体勢崩しで後ろへずれる） */
  enemyNextAt: number;
  telegraph: Telegraph | null;
  /** 防御姿勢が有効な上限 tick（この tick までに受けるダメージを軽減） */
  defendUntil: number;
  /** 見切りが有効な上限 tick（この tick まで回避に大きなボーナス） */
  readUntil: number;
  /**
   * 敵の隙（大技をいなした報酬）。この tick までの攻撃が確定命中・
   * openingFactor 倍の反撃になる。0/0 なら隙なし
   */
  openingUntil: number;
  openingFactor: number;
  /** 見切り行動を使ったか（予兆の精度を底上げ） */
  observed: boolean;
  fleeAttempts: number;
  done: boolean;
  won: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  hitsTaken: number;
  /** 敵の攻撃を躱した回数（F-04） */
  dodges: number;
  /** 大技を対応行動でいなした回数（受け止め＋見切り。F-04） */
  parries: number;
  /** プレイヤーの導出値（startCombat で確定。武器の持ち替えで更新される） */
  playerAttack: number;
  playerCt: number;
  playerObserve: number;
  playerAgility: number;
  /**
   * 現在の武器が使う技能の値（K-01。命中・会心・攻撃力の係数の元。
   * 武器の持ち替えで変わる —— 剣術一本ではない）
   */
  playerWeaponSkill: number;
  playerEvasion: number;
  /* ── K-01：武器の持ち替えと技能リンク ── */
  /** 装備中の武器ID（weapons のキー） */
  playerWeapon: string;
  /** 持ち替えられる武器ID（所持のうち定義のあるもの。装備中を含む） */
  ownedWeapons: readonly string[];
  /** 開始時の技能表（持ち替え時に武器技能を引き直す参照） */
  playerSkills: Record<string, { value: number }>;
  /** 開始時の筋力（持ち替え時の攻撃力を引き直す参照） */
  playerStrength: number;
  /** 開始時の精神（M-01：呪文威力の係数に使う） */
  playerSpirit: number;
  /** 与ダメージの総合倍率（称号等の attackFactor × combat.attack リンク） */
  playerAttackFactor: number;
  /** 武器係数を掛ける前の行動 CT（ctBase − 敏捷×ctPerAgility） */
  playerBaseCt: number;
  /** 現在の武器の命中・会心・防御補正（持ち替えで変わる） */
  weaponHitBonus: number;
  weaponCritBonus: number;
  weaponDefendBonus: number;
  /** 技能リンクの戦闘係数（balance.links。戦闘中は変わらない） */
  links: CombatLinkBonuses;
  /* ── K-02：気力・武技・状態異常・部位 ── */
  /** 気力（開始時点の残り。戦闘をまたいで一日は続く） */
  playerKi: number;
  playerKiMax: number;
  /** tick あたりの気力回復（経過時間に掛ける。パッシブ kiRegen を含む） */
  kiRegenPerTick: number;
  /** 構成スロットから解決した武技（定義＋Lv。装備中の武器技能のものだけ使える） */
  artSlots: { def: ArtDef; lv: number }[];
  /** パッシブの合算効果（hook → 合計値） */
  passiveFx: Record<string, number>;
  /** 敵に掛かっている状態（until=切れる tick、power=効果の強さ） */
  enemyStatus: Partial<Record<StatusId, { until: number; power: number }>>;
  /** 部位ごとの蓄積ダメージ（部位破壊までの進み） */
  partDamage: Record<BodyPart, number>;
  /** 既に壊れた部位 */
  brokenParts: BodyPart[];
  /** 受け流しが有効な上限 tick */
  parryUntil: number;
  /** 回避の構え（対応技）が有効な上限 tick */
  evadeUntil: number;
  /** 鉄壁の構え（対応技）が有効な上限 tick */
  guardArtUntil: number;
  /**
   * 使用記録（09 §7.1 の集計材料）：この戦闘で行った行動ごとの
   * 使用タグ。step が artTags / skillTags に畳む。id のあるものは武技
   */
  uses: { id?: string; skill: string; tags: string[] }[];
  /** 直前の行動で成功した対応（使用タグ after.* の材料） */
  afterGuard: boolean;
  afterParry: boolean;
  afterEvade: boolean;
  /** 直前の行動が武技ならそのID（chain.* タグ用） */
  lastArtId: string | null;
  /* ── M-01：魔力・詠唱・適性・見取り ── */
  /** 魔力（開始時点の残り。戦闘をまたいで一日は続く） */
  playerMana: number;
  playerManaMax: number;
  /** tick あたりの魔力回復（経過時間に掛ける。パッシブ manaRegen を含む） */
  manaRegenPerTick: number;
  /** 属性ごとの適性（0〜1。呪文の威力係数に畳む） */
  playerApt: Partial<Record<MagicElement, number>>;
  /**
   * 観察中に見届けた敵の呪文（見取り稽古。重複なし）。
   * step が flags["spell.seen.<id>"] に畳む
   */
  seenSpells: string[];
  log: CombatEvent[];
}

export interface CombatResult {
  won: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  hitsTaken: number;
  ticks: number;
  /* ── K-02 ── */
  /** 戦闘終了時点の気力（GameState.player.ki へ書き戻す） */
  kiLeft: number;
  /** この戦闘の使用記録（09 §7.1。step が artTags/skillTags に畳む） */
  uses: { id?: string; skill: string; tags: string[] }[];
  /* ── M-01 ── */
  /** 戦闘終了時点の魔力（GameState.player.mana へ書き戻す） */
  manaLeft: number;
  /** 観察中に見届けた敵の呪文（step が flags["spell.seen.<id>"] に畳む） */
  seenSpells: string[];
}

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 戦闘で使うプレイヤー情報の最小形（装備武器は v17〜。省略時は既定武器） */
export interface CombatPlayer {
  stats: Record<string, number>;
  skills: Record<string, { value: number }>;
  /** 装備中の武器ID（GameState.player.weapon） */
  weapon?: string;
  /** 所持武器ID（GameState.player.weapons。持ち替えの候補） */
  weapons?: readonly string[];
  /* ── K-02 ── */
  /** 現在の気力（GameState.player.ki。省略時は上限から始まる） */
  ki?: number;
  /* ── M-01 ── */
  /** 現在の魔力（GameState.player.mana。省略時は上限から始まる） */
  mana?: number;
  /** 属性ごとの適性（0〜1。playerAptitudes で導出して渡す。省略時は全属性0.5） */
  aptitude?: Partial<Record<MagicElement, number>>;
  /** 習得済み技のレベル表（GameState.player.arts の id→lv の薄い形） */
  arts?: Record<string, { lv: number }>;
  /**
   * 構成（GameState.player.build）：戦闘技スロット・パッシブ・持ち替え武器。
   * 武器枠があるときは持ち替えはその2本に限られる（09 §6）
   */
  build?: {
    slots?: readonly (string | null)[];
    passives?: readonly (string | null)[];
    weapons?: readonly (string | null)[];
  };
}

/**
 * 持ち替えられる武器の列（K-02：構成の武器枠∩所持。
 * 構成の武器枠が無い・全空なら所持全部 —— 従来どおり）
 */
function ownedWeaponsOf(player: CombatPlayer, cfg: CombatConfig): string[] {
  const equipped = weaponDefOf(cfg, player.weapon).id;
  const owned =
    player.weapons === undefined
      ? [equipped]
      : player.weapons.filter((id) => cfg.weapons?.[id] !== undefined || id === equipped);
  const all = owned.includes(equipped) ? owned : [equipped, ...owned];
  const slots = player.build?.weapons;
  if (slots === undefined || slots.every((id) => id === null)) return all;
  const chosen = slots.filter((id): id is string => id !== null && all.includes(id));
  return chosen.length > 0 ? chosen : all;
}

/**
 * プレイヤー側の戦闘数値（stats + スキル + 装備武器 + 技能リンクから導出）。
 * attackFactor は称号などの与ダメージ倍率（effects の damageVs。既定1）
 */
export function playerCombatStats(
  player: CombatPlayer,
  cfg: CombatConfig,
  attackFactor = 1,
): {
  hp: number;
  attack: number;
  ct: number;
  agility: number;
  observe: number;
  /** 現在の武器が使う技能の値（K-01。剣術だけではない） */
  weaponSkill: number;
  evasion: number;
  /** 解決済みの装備武器定義 */
  weapon: WeaponDef;
  ownedWeapons: string[];
  links: CombatLinkBonuses;
} {
  const weapon = weaponDefOf(cfg, player.weapon);
  const weaponSkill = player.skills[weapon.skill]?.value ?? 0;
  // 技能リンク（K-01）：combat.* / beast.attack フックを技能値から係数に畳む
  const links: CombatLinkBonuses = {
    attack: linkSum(cfg.links, "combat.attack", player.skills),
    hit: linkSum(cfg.links, "combat.hit", player.skills),
    crit: linkSum(cfg.links, "combat.crit", player.skills),
    evade: linkSum(cfg.links, "combat.evade", player.skills),
    defend: linkSum(cfg.links, "combat.defend", player.skills),
    flee: linkSum(cfg.links, "combat.flee", player.skills),
    enemyPower: linkSum(cfg.links, "combat.enemyPower", player.skills),
    beastAttack: linkSum(cfg.links, "beast.attack", player.skills),
  };
  const agility = player.stats["agility"] ?? 0;
  return {
    hp: Math.round(cfg.baseHp + (player.stats["endurance"] ?? 0) * cfg.hpPerEndurance),
    attack:
      Math.round(
        (cfg.attackBase +
          weaponSkill * cfg.attackPerWeaponSkill +
          (player.stats["strength"] ?? 0) * cfg.attackPerStrength +
          weapon.power) *
          attackFactor *
          (1 + links.attack) *
          10,
      ) / 10,
    ct: Math.max(cfg.ctMin, (cfg.ctBase - agility * cfg.ctPerAgility) * weapon.ctFactor),
    agility,
    observe: player.skills["observation"]?.value ?? 0,
    weaponSkill,
    evasion: player.skills["evasion"]?.value ?? 0,
    weapon,
    ownedWeapons: ownedWeaponsOf(player, cfg),
    links,
  };
}

/**
 * 構成の解決（K-02）：スロットのID列を、習得済みの技＋Lvの列に畳む。
 * 使える技は「スロットに入っていて、装備中の武器技能のもの」
 * —— 持ち替えたら使える技も替わる（使用可否は使うたびに武器技能と照合）
 */
export function artSlotsOf(player: CombatPlayer, cfg: CombatConfig): { def: ArtDef; lv: number }[] {
  const table = cfg.arts?.defs;
  if (table === undefined || player.build?.slots === undefined) return [];
  const out: { def: ArtDef; lv: number }[] = [];
  for (const id of player.build.slots) {
    if (id === null) continue;
    const def = table[id];
    const lv = player.arts?.[id]?.lv ?? 0;
    // M-01：戦闘スロットの種別は attack/response/support/heal（生活魔法は入らない）
    if (def === undefined || !COMBAT_ART_KINDS.includes(def.kind) || lv < 1) continue;
    out.push({ def, lv });
  }
  return out;
}

/** パッシブの合算効果（hook → Lv込みの合計値） */
export function passiveFxOf(player: CombatPlayer, cfg: CombatConfig): Record<string, number> {
  const table = cfg.arts?.defs;
  if (table === undefined || cfg.arts === undefined || player.build?.passives === undefined)
    return {};
  const out: Record<string, number> = {};
  for (const id of player.build.passives) {
    if (id === null) continue;
    const def = table[id];
    const lv = player.arts?.[id]?.lv ?? 0;
    if (def === undefined || def.kind !== "passive" || def.effect === undefined || lv < 1) continue;
    const scale = 1 + (lv - 1) * cfg.arts.levelPowerFactor;
    out[def.effect.hook] = (out[def.effect.hook] ?? 0) + def.effect.value * scale;
  }
  return out;
}

export function startCombat(
  enemy: EnemyDef,
  cfg: CombatConfig,
  player: CombatPlayer,
  /** 称号などの与ダメージ倍率（effects の damageFactor(enemyId)。既定1） */
  attackFactor = 1,
): CombatState {
  const p = playerCombatStats(player, cfg, attackFactor);
  // K-02：パッシブを畳んだ上で気力・魔力の上限を引く（pa_grit・pa_spring などが上限に効く）
  const passiveFx = passiveFxOf(player, cfg);
  const kiMax =
    cfg.arts !== undefined ? kiMaxOf(player.stats, cfg.arts, passiveFx["kiMax"] ?? 0) : 0;
  const manaMax =
    cfg.arts !== undefined ? manaMaxOf(player.stats, cfg.arts, passiveFx["manaMax"] ?? 0) : 0;
  return {
    tick: 0,
    turn: 0,
    playerHp: p.hp,
    playerHpMax: p.hp,
    enemyHp: enemy.hp,
    enemyHpMax: enemy.hp,
    enemyIdx: 0,
    enemyNextAt: Math.max(1, Math.round(enemy.intervalTicks / 2)),
    telegraph: null,
    defendUntil: -1,
    readUntil: -1,
    openingUntil: 0,
    openingFactor: 0,
    observed: false,
    fleeAttempts: 0,
    done: false,
    won: false,
    fled: false,
    died: false,
    damageTaken: 0,
    hitsTaken: 0,
    dodges: 0,
    parries: 0,
    playerAttack: p.attack,
    playerCt: p.ct,
    playerObserve: p.observe,
    playerAgility: p.agility,
    playerWeaponSkill: p.weaponSkill,
    playerEvasion: p.evasion,
    // K-01：武器・技能リンク（持ち替えの引き直しに必要な参照も保持する）
    playerWeapon: p.weapon.id,
    ownedWeapons: p.ownedWeapons,
    playerSkills: player.skills,
    playerStrength: player.stats["strength"] ?? 0,
    playerSpirit: player.stats["spirit"] ?? 0,
    playerAttackFactor: attackFactor * (1 + p.links.attack),
    playerBaseCt: cfg.ctBase - p.agility * cfg.ctPerAgility,
    weaponHitBonus: p.weapon.hitBonus,
    weaponCritBonus: p.weapon.critBonus,
    weaponDefendBonus: p.weapon.defendBonus ?? 0,
    links: p.links,
    // K-02：気力・武技・状態異常・部位（cfg.arts が無い世界では全部初期値のまま）
    playerKi: player.ki ?? kiMax,
    playerKiMax: kiMax,
    kiRegenPerTick: (cfg.arts?.kiRegenPerTick ?? 0) + (passiveFx["kiRegen"] ?? 0),
    artSlots: artSlotsOf(player, cfg),
    passiveFx,
    enemyStatus: {},
    partDamage: { head: 0, body: 0, arms: 0, legs: 0 },
    brokenParts: [],
    parryUntil: -1,
    evadeUntil: -1,
    guardArtUntil: -1,
    uses: [],
    afterGuard: false,
    afterParry: false,
    afterEvade: false,
    lastArtId: null,
    // M-01：魔力・適性・見取り（cfg.magic/arts が無い世界では 0 のまま動く）
    playerMana: player.mana ?? manaMax,
    playerManaMax: manaMax,
    manaRegenPerTick: (cfg.magic?.manaRegenPerTick ?? 0) + (passiveFx["manaRegen"] ?? 0),
    playerApt: player.aptitude ?? {},
    seenSpells: [],
    log: [],
  };
}

/** 敵の実効敏捷（脚が壊れていると下がる。命中・回避・逃走の差分に使う） */
export function enemyAgilityOf(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): number {
  const broken = state.brokenParts.includes("legs");
  return broken ? enemy.agility * (cfg.arts?.breakAgilityFactor ?? 1) : enemy.agility;
}

/** 攻撃の命中率（敵の敏捷との差と武器技能・武器補正・技能リンク・パッシブで変わる。隙への反撃は必中） */
export function hitChance(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): number {
  return clamp(
    cfg.hitMin,
    cfg.hitMax,
    cfg.hitBase +
      state.playerWeaponSkill * cfg.hitPerWeaponSkill +
      (state.playerAgility - enemyAgilityOf(state, enemy, cfg)) * cfg.hitPerAgilityDiff +
      state.weaponHitBonus +
      state.links.hit +
      (state.passiveFx["hit"] ?? 0),
  );
}

/** 会心率（隙への反撃は必ず会心扱い） */
export function critChance(state: CombatState, cfg: CombatConfig): number {
  return clamp(
    0,
    1,
    cfg.critBase +
      state.playerWeaponSkill * cfg.critPerWeaponSkill +
      state.weaponCritBonus +
      state.links.crit +
      (state.passiveFx["crit"] ?? 0),
  );
}

/** 被弾の回避率。見切り中は readEvadeBonus、回避の構え中は evadeArtBonus が乗る。防御・鉄壁中は 0（受け止める構え） */
export function evadeChance(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): number {
  if (state.tick <= state.defendUntil || state.tick <= state.guardArtUntil) return 0;
  const base =
    cfg.evadeBase +
    state.playerEvasion * cfg.evadePerEvasion +
    (state.playerAgility - enemyAgilityOf(state, enemy, cfg)) * cfg.evadePerAgilityDiff +
    state.links.evade +
    (state.passiveFx["evade"] ?? 0);
  const reading = state.tick <= state.readUntil;
  const evading = state.tick <= state.evadeUntil;
  return clamp(
    0,
    cfg.evadeMax,
    base + (reading ? cfg.readEvadeBonus : 0) + (evading ? (cfg.arts?.evadeArtBonus ?? 0) : 0),
  );
}

/** 予兆の3行表示（精度は観察＋見切りボーナスで決まる） */
export function telegraphLines(
  state: CombatState,
  enemy: EnemyDef,
  cfg: CombatConfig,
): [string, string, string] {
  const t = state.telegraph;
  if (!t) return ["――間合いを計っている。", "", ""];
  const eff = state.playerObserve + (state.observed ? cfg.observeBonus : 0);
  const remaining = Math.max(0, t.dueTick - state.tick);
  if (eff >= cfg.preciseObserve) {
    return [
      `――${enemy.name}が後ろ足に重心を移した`,
      `\u3000\u3000《${t.name}》（あと${remaining}tick）`,
      "\u3000\u3000防御か見切りでやり過ごせる",
    ];
  }
  return [
    `――${enemy.name}が唸っている。`,
    "\u3000\u3000何かを仕掛けてくる気配がする",
    "\u3000\u3000防御か見切りを",
  ];
}

/**
 * 敵の意図（F-04）：次に予定されている敵の行動と、いま有効な構え・隙。
 * 予兆の中身が読めるのは精度が preciseObserve 以上のときだけ（それ未満は
 * 「何か来る」まで分かるが名までは読めない）。UI・CLI の表示用。
 */
export interface CombatIntent {
  /** 発動待ちの予兆。precise=false なら name は不詳（曖昧表示向け） */
  telegraph: { name: string; dueIn: number; precise: boolean } | null;
  /**
   * 敵の次の行動予定（予兆発動とは別の、パターン上の一手）。
   * 精度が足りないときは kind/name を伏せて null 寄りの情報にする
   */
  next: { dueIn: number; kind: "attack" | "telegraph"; name: string | null } | null;
  /** いま有効な構え（防御/見切り。表示チップ用） */
  guarding: boolean;
  reading: boolean;
  /** 攻撃を抉れる隙が残っている tick 数（0 なら隙なし） */
  openingIn: number;
}

export function combatIntent(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): CombatIntent {
  const eff = state.playerObserve + (state.observed ? cfg.observeBonus : 0);
  const precise = eff >= cfg.preciseObserve;
  const t = state.telegraph;
  const telegraph =
    t === null
      ? null
      : {
          name: precise ? t.name : "",
          dueIn: precise ? Math.max(0, t.dueTick - state.tick) : -1,
          precise,
        };
  let next: CombatIntent["next"] = null;
  if (!state.done && state.enemyHp > 0) {
    const step = enemy.pattern[state.enemyIdx % enemy.pattern.length];
    const dueIn = Math.max(0, state.enemyNextAt - state.tick);
    if (step !== undefined) {
      // 観察行動を取っていれば「あと何tickで動くか」は掴める（中身は精度次第）
      const known = state.observed || precise;
      next = known
        ? {
            dueIn,
            kind: step.type,
            name: precise
              ? step.type === "telegraph" && step.move !== undefined
                ? (enemy.moves[step.move]?.name ?? step.move)
                : enemy.attack.name
              : null,
          }
        : { dueIn: -1, kind: "attack", name: null };
    }
  }
  return {
    telegraph,
    next,
    guarding: state.tick <= state.defendUntil,
    reading: state.tick <= state.readUntil,
    openingIn: Math.max(0, state.openingUntil - state.tick),
  };
}

/**
 * プレイヤーの1行動を解決し、行動 CT 分の時間を進める。
 * その間に敵の予定行動が来れば解決する（複数回動きうる）。
 */
export function turn(
  state: CombatState,
  action: CombatAction,
  enemy: EnemyDef,
  cfg: CombatConfig,
  ctx: MiniGameCtx,
): CombatState {
  if (state.done) return state;
  const s: CombatState = {
    ...state,
    log: [...state.log],
    uses: [...state.uses],
    enemyStatus: { ...state.enemyStatus },
    partDamage: { ...state.partDamage },
    brokenParts: [...state.brokenParts],
    turn: state.turn + 1,
  };
  const push = (e: Omit<CombatEvent, "tick">, tick = s.tick) => s.log.push({ ...e, tick });
  const arts = cfg.arts;
  const startTick = s.tick;

  /* ── K-02：使用記録（09 §7.1）。行動前の状況タグを集める ── */
  const weaponSkillNow = weaponDefOf(cfg, s.playerWeapon).skill;
  const baseTags: string[] = [];
  {
    // 相手との力関係（03 §4 の格上の目安：挑戦差 15）
    const edge = enemy.challenge - s.playerWeaponSkill;
    baseTags.push(edge >= 15 ? "foe.stronger" : edge <= -15 ? "foe.weaker" : "foe.even");
    baseTags.push("foe.single");
    if (enemy.beast === true) baseTags.push("foe.beast");
    // G-04：系統が獣でも人でもない敵（不死・魔物・精霊・竜種）は
    // foe.<family> で数える（09 §7.1 の種族の次元）
    else if (enemy.family !== undefined && enemy.family !== "human")
      baseTags.push(`foe.${enemy.family}`);
    else baseTags.push("foe.human");
    if (s.telegraph !== null) baseTags.push("vs.telegraph");
    if (s.turn === 1) baseTags.push("first.strike");
    if (s.playerHp <= s.playerHpMax * 0.3) baseTags.push("self.lowhp");
    if (s.afterGuard) baseTags.push("after.guard");
    if (s.afterParry) baseTags.push("after.parry");
    if (s.afterEvade) baseTags.push("after.evade");
    const staggered = s.enemyStatus.stagger !== undefined && s.enemyStatus.stagger.until > s.tick;
    if (staggered) baseTags.push("after.stagger");
  }
  // この行動の使用記録（解決後に s.uses に積む。基本行動は id なし）
  let use: { id?: string; skill: string; tags: string[] } | null = null;

  /* ── K-02：武技の解決に使う部品 ── */
  /** 部位への蓄積（破壊のしきい値を超えると部位が壊れる） */
  const addPartDamage = (part: BodyPart, dmg: number) => {
    const targets: readonly BodyPart[] = enemy.parts ?? ["head", "body", "arms", "legs"];
    if (!targets.includes(part) || s.brokenParts.includes(part)) return;
    s.partDamage[part] += dmg;
    if (arts !== undefined && s.partDamage[part] >= s.enemyHpMax * arts.partBreakShare) {
      s.brokenParts.push(part);
      push({ type: "partBroken", part, text: `――${enemy.name}の${PART_NAMES[part]}を壊した。` });
    }
  };
  /** 状態の付与（敵の耐性・頭の破壊・パッシブ・技Lvを含む1回判定）。
   *  atTick は付与される拍（詠唱が途中拍で解決される呪文はその拍を渡す） */
  const applyStatus = (def: ArtDef, lvStatus: number, hitIdx: number, atTick = s.tick) => {
    const st = def.status;
    if (st === undefined || arts === undefined || s.enemyHp <= 0) return;
    const head = s.brokenParts.includes("head") ? arts.breakStatusFactor : 1;
    const resist = enemy.statusResist?.[st.id] ?? 1;
    const chance = st.chance * lvStatus * (1 + (s.passiveFx["status"] ?? 0)) * head * resist;
    if (chance <= 0) return;
    const r = ctxRng(ctx, `st-${s.turn}-${hitIdx}`);
    if (r.next() >= Math.min(1, chance)) return;
    s.enemyStatus[st.id] = { until: atTick + st.ticks, power: st.power };
    push(
      {
        type: "statusApplied",
        status: st.id,
        text: `――${enemy.name}は${STATUS_NAMES[st.id]}。`,
      },
      atTick,
    );
  };

  /* ── M-01：属性の相性（09 §5） ──
   * 敵に掛かった布石の状態と打ち手（呪文属性 or 打撃の性質）が噛み合うと
   * 威力倍率＋追加の状態（感電・延焼）＋布石の消費/延長が起きる。
   * 戻り値は発火した相性の威力倍率（未発火は 1）
   */
  const react = (strikeKey: string, hitTick: number): number => {
    if (cfg.magic === undefined) return 1;
    const it = interactionOf(s.enemyStatus, strikeKey, hitTick, cfg.magic);
    if (it === undefined) return 1;
    if (it.consume) s.enemyStatus[it.primer] = undefined;
    if (it.extend !== undefined && s.enemyStatus[it.primer] !== undefined)
      s.enemyStatus[it.primer] = {
        ...s.enemyStatus[it.primer]!,
        until: s.enemyStatus[it.primer]!.until + it.extend,
      };
    if (it.status !== undefined && s.enemyHp > 0) {
      s.enemyStatus[it.status] = {
        until: hitTick + (it.statusTicks ?? 10),
        power: it.statusPower ?? 1,
      };
    }
    push(
      {
        type: "reaction",
        reaction: it.id,
        text: `――${enemy.name}は${REACTION_NAMES[it.id] ?? "相性を突かれた"}。`,
      },
      hitTick,
    );
    return it.damage;
  };

  /* ── M-01：詠唱の途中（この行動枠の中で解決予定の呪文） ── */
  let pendingSpell: { a: { def: ArtDef; lv: number }; due: number } | null = null;
  /** 詠唱中の被弾で中断を転がす（M-01「攻撃されると中断されうる」） */
  let interruptIdx = 0;
  const tryInterrupt = (hitTick: number) => {
    if (cfg.magic === undefined || pendingSpell === null) return;
    if (pendingSpell.due <= hitTick) return; // もう飛び出している
    const chance = interruptChanceOf(s.playerSkills["mana"]?.value ?? 0, cfg.magic);
    const r = ctxRng(ctx, `int-${s.turn}-${interruptIdx++}`);
    if (r.next() >= chance) return;
    push(
      {
        type: "castBroken",
        art: pendingSpell.a.def.id,
        text: `――《${pendingSpell.a.def.name}》の詠唱が途切れた。`,
      },
      hitTick,
    );
    pendingSpell = null;
  };
  /**
   * 技の一撃（攻撃技・割り込みの共通部品）。
   * 命中・会心・揺らぎ・耐性・部位蓄積・崩し特効・パッシブまで含めて1発解決する
   */
  const strike = (
    a: { def: ArtDef; lv: number },
    hitIdx: number,
  ): { dmg: number; crit: boolean; hit: boolean } => {
    const r = ctxRng(ctx, `art-${s.turn}-${hitIdx}`);
    const opening = s.openingFactor > 0 && s.tick <= s.openingUntil;
    const chance = clamp(0, 1, hitChance(s, enemy, cfg) + (a.def.hitBonus ?? 0));
    if (!opening && r.next() >= chance) return { dmg: 0, crit: false, hit: false };
    const staggered = s.enemyStatus.stagger !== undefined && s.enemyStatus.stagger.until > s.tick;
    // 崩し中の敵への大技：会心が確定し崩しを消費する（09 §5「崩し→大技」）
    const heavyCrit = a.def.heavy === true && staggered;
    const crit = opening || heavyCrit || r.next() < critChance(s, cfg);
    const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
    const dtype = a.def.dtype ?? "slash";
    let resist = enemy.resist?.[dtype] ?? 1;
    if (a.def.pierceArmor === true && resist < 1) resist = 1;
    const lvPower = arts !== undefined ? 1 + (a.lv - 1) * arts.levelPowerFactor : 1;
    // M-01：打撃の性質での相性（凍結＋打撃＝砕く など。布石が立っていれば威力が伸びる）
    const reactionFactor = react(dtype, s.tick);
    const dmg = round1(
      s.playerAttack *
        (a.def.power ?? 1) *
        lvPower *
        spread *
        (crit ? cfg.critFactor : 1) *
        (opening ? s.openingFactor : 1) *
        (staggered ? (arts?.staggerFactor ?? 1) : 1) *
        resist *
        reactionFactor *
        (1 + (s.passiveFx[`dmg.${dtype}`] ?? 0)) *
        (enemy.beast === true ? 1 + s.links.beastAttack : 1) *
        (s.brokenParts.includes("body") ? (arts?.breakDamageFactor ?? 1) : 1) *
        (1 + (s.passiveFx["attack"] ?? 0)),
    );
    s.enemyHp -= dmg;
    addPartDamage(a.def.part ?? "body", dmg);
    if (heavyCrit) s.enemyStatus.stagger = undefined;
    return { dmg, crit, hit: true };
  };
  /** 技の主処理（対応技は窓を開けるだけ。攻撃・割り込みは strike で当てる） */
  const resolveArt = (a: { def: ArtDef; lv: number }, tags: string[]) => {
    const lvStatus = arts !== undefined ? 1 + (a.lv - 1) * arts.levelStatusFactor : 1;
    switch (a.def.kind) {
      case "attack": {
        const hits = a.def.hits ?? 1;
        let total = 0;
        let critAny = false;
        let hitAny = false;
        const opening = s.openingFactor > 0 && s.tick <= s.openingUntil;
        for (let i = 0; i < hits && s.enemyHp > 0; i++) {
          const r = strike(a, i);
          if (!r.hit) continue;
          hitAny = true;
          total += r.dmg;
          critAny ||= r.crit;
        }
        if (opening) {
          s.openingUntil = 0;
          s.openingFactor = 0;
        }
        if (!hitAny) {
          push({
            type: "playerArtMiss",
            art: a.def.id,
            text: `《${a.def.name}》――${enemy.name}に躱された。`,
          });
        } else {
          push({
            type: "playerArt",
            art: a.def.id,
            damage: total,
            ...(critAny ? { crit: true } : {}),
            ...(opening ? { counter: true } : {}),
            text: `《${a.def.name}》――${enemy.name}に ${total} の傷。`,
          });
          applyStatus(a.def, lvStatus, 0);
        }
        break;
      }
      case "support": {
        // 補助（煙玉・油壺など）：ダメージを伴わず状態だけを掛ける
        push({ type: "playerArt", art: a.def.id, text: `《${a.def.name}》。` });
        applyStatus(a.def, lvStatus, 0);
        break;
      }
      case "response": {
        switch (a.def.response) {
          case "interrupt": {
            const r = strike(a, 0);
            if (!r.hit) {
              push({
                type: "playerArtMiss",
                art: a.def.id,
                text: `《${a.def.name}》――${enemy.name}に躱された。`,
              });
            } else {
              push({
                type: "playerArt",
                art: a.def.id,
                damage: r.dmg,
                ...(r.crit ? { crit: true } : {}),
                text: `《${a.def.name}》――${enemy.name}に ${r.dmg} の傷。`,
              });
              applyStatus(a.def, lvStatus, 0);
              // 予兆への割り込み：仕掛け途中の大技を潰し体勢を崩す（09 §5）
              if (s.telegraph !== null) {
                s.telegraph = null;
                s.enemyNextAt += cfg.staggerTicks;
                push({ type: "interrupted", text: `――${enemy.name}の大技を潰した。` });
                tags.push("interrupt");
              }
            }
            break;
          }
          case "parry": {
            s.parryUntil = endTick;
            push({ type: "playerArt", art: a.def.id, text: `《${a.def.name}》――受け流しの構え。` });
            break;
          }
          case "evade": {
            s.evadeUntil = endTick;
            push({ type: "playerArt", art: a.def.id, text: `《${a.def.name}》――間合いを取る。` });
            break;
          }
          case "guard": {
            s.guardArtUntil = endTick;
            push({ type: "playerArt", art: a.def.id, text: `《${a.def.name}》――鉄壁の構え。` });
            break;
          }
          case undefined:
            break;
        }
        break;
      }
      case "passive":
        break;
    }
  };

  /* ── M-01：呪文の解決 ──
   * 呪文の一撃。武技と同じ命中・会心・揺らぎの手続きだが、威力は武器の
   * 攻撃力ではなく呪文威力（技能・精神・適性・Lv の積）から引き、
   * 耐性は「魔」を、相性は呪文の属性を見る
   */
  const spellStrike = (
    a: { def: ArtDef; lv: number },
    hitIdx: number,
    atTick: number,
  ): { dmg: number; crit: boolean; hit: boolean } => {
    const sp = a.def.spell!;
    const magic = cfg.magic!;
    const r = ctxRng(ctx, `sp-${s.turn}-${hitIdx}`);
    const opening = s.openingFactor > 0 && atTick <= s.openingUntil;
    const chance = clamp(0, 1, hitChance(s, enemy, cfg) + (a.def.hitBonus ?? 0));
    if (!opening && r.next() >= chance) return { dmg: 0, crit: false, hit: false };
    const staggered = s.enemyStatus.stagger !== undefined && s.enemyStatus.stagger.until > atTick;
    const heavyCrit = a.def.heavy === true && staggered;
    const crit = opening || heavyCrit || r.next() < critChance(s, cfg);
    const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
    let resist = enemy.resist?.["magic"] ?? 1;
    if (a.def.pierceArmor === true && resist < 1) resist = 1;
    const skillValue = s.playerSkills[a.def.skill]?.value ?? 0;
    const apt = s.playerApt[sp.element] ?? 0.5;
    const lvFactor = arts?.levelPowerFactor ?? 0;
    const power = spellPowerOf(a.def, a.lv, skillValue, s.playerSpirit, apt, lvFactor, magic);
    // M-01：属性の相性（濡れ＋雷・油＋火・風＋火 など。布石が立っていれば威力が伸びる）
    const reactionFactor = react(sp.element, atTick);
    const dmg = round1(
      power *
        spread *
        (crit ? cfg.critFactor : 1) *
        (opening ? s.openingFactor : 1) *
        (staggered ? (arts?.staggerFactor ?? 1) : 1) *
        resist *
        reactionFactor *
        (1 + (s.passiveFx["dmg.magic"] ?? 0)) *
        (s.brokenParts.includes("body") ? (arts?.breakDamageFactor ?? 1) : 1) *
        (1 + (s.passiveFx["attack"] ?? 0)),
    );
    s.enemyHp -= dmg;
    addPartDamage(a.def.part ?? "body", dmg);
    if (heavyCrit) s.enemyStatus.stagger = undefined;
    return { dmg, crit, hit: true };
  };

  /** 呪文の発動（詠唱が終わった拍に呼ぶ。回復・補助・攻撃の3通り） */
  const resolveSpell = (a: { def: ArtDef; lv: number }, atTick: number) => {
    const sp = a.def.spell!;
    const lvStatus = arts !== undefined ? 1 + (a.lv - 1) * arts.levelStatusFactor : 1;
    switch (a.def.kind) {
      case "attack": {
        const hits = a.def.hits ?? 1;
        let total = 0;
        let critAny = false;
        let hitAny = false;
        const opening = s.openingFactor > 0 && atTick <= s.openingUntil;
        for (let i = 0; i < hits && s.enemyHp > 0; i++) {
          const r = spellStrike(a, i, atTick);
          if (!r.hit) continue;
          hitAny = true;
          total += r.dmg;
          critAny ||= r.crit;
        }
        if (opening) {
          s.openingUntil = 0;
          s.openingFactor = 0;
        }
        if (!hitAny) {
          push(
            {
              type: "playerSpellMiss",
              art: a.def.id,
              text: `《${a.def.name}》――${enemy.name}に躱された。`,
            },
            atTick,
          );
        } else {
          push(
            {
              type: "playerSpell",
              art: a.def.id,
              damage: total,
              ...(critAny ? { crit: true } : {}),
              ...(opening ? { counter: true } : {}),
              text: `《${a.def.name}》――${enemy.name}に ${total} の傷。`,
            },
            atTick,
          );
          // 吸収系：与えた傷の割合を自分が回復する（09 §4。命を吸う術）
          if ((sp.drain ?? 0) > 0) {
            const back = Math.max(1, Math.round(total * sp.drain!));
            s.playerHp = Math.min(s.playerHpMax, s.playerHp + back);
          }
          applyStatus(a.def, lvStatus, 0, atTick);
        }
        break;
      }
      case "heal": {
        const skillValue = s.playerSkills[a.def.skill]?.value ?? 0;
        const apt = s.playerApt[sp.element] ?? 0.5;
        const lvFactor = arts?.levelPowerFactor ?? 0;
        const amount = Math.max(
          1,
          Math.round(
            spellPowerOf(a.def, a.lv, skillValue, s.playerSpirit, apt, lvFactor, cfg.magic!) *
              (sp.heal ?? 1),
          ),
        );
        const before = s.playerHp;
        s.playerHp = Math.min(s.playerHpMax, s.playerHp + amount);
        push(
          {
            type: "playerSpell",
            art: a.def.id,
            heal: s.playerHp - before,
            text: `《${a.def.name}》――傷が ${s.playerHp - before} 塞がる。`,
          },
          atTick,
        );
        break;
      }
      case "support": {
        // 補助呪文（布石を掛ける）：ダメージを伴わず状態だけを掛ける
        push({ type: "playerSpell", art: a.def.id, text: `《${a.def.name}》。` }, atTick);
        applyStatus(a.def, lvStatus, 0, atTick);
        break;
      }
      default:
        break;
    }
  };

  // 1. プレイヤー行動
  const artAction = typeof action === "object" && action.type === "art" ? action : null;
  const art = artAction !== null ? s.artSlots.find((x) => x.def.id === artAction.id) : undefined;
  // 武技はスロット入り＋装備中の武器技能のものだけ使える（09 §6。持ち替えたら技も替わる）。
  // M-01：呪文は武器の構えに関係なく唱えられる（剣を持ったまま放つ）
  const isSpell = art !== undefined && art.def.spell !== undefined;
  const artUsable =
    art !== undefined && arts !== undefined && (isSpell || art.def.skill === weaponSkillNow);
  // M-01：詠唱の長さ（技能とパッシブで短縮。詠唱が CT を超えると行動全体が詠唱に伸びる）
  const spellCastTicks =
    isSpell && cfg.magic !== undefined
      ? castTicksOf(art.def, s.playerSkills[art.def.skill]?.value ?? 0, s.passiveFx, cfg.magic)
      : 0;
  const endTick = s.tick + Math.max(s.playerCt * (artUsable ? art.def.ct : 1), spellCastTicks);

  if (artAction !== null) {
    // 武技（K-02）：気力が足りない・構えの合わない技は行動だけが空費される
    if (!artUsable || art === undefined) {
      push({
        type: "playerArtFail",
        art: artAction.id,
        text: "――その技はいまの構えでは使えない。",
      });
    } else if (isSpell) {
      // 呪文（M-01）：気力ではなく魔力を消費し、詠唱の終わる拍に発動する。
      // 魔力が足りなければ行動だけが空費される。詠唱中の被弾は中断されうる
      // （中断判定は被弾のたびに tryInterrupt が転がす）
      const sp = art.def.spell!;
      if (cfg.magic === undefined) {
        push({
          type: "playerArtFail",
          art: art.def.id,
          text: "――この世界では術式が組めない。",
        });
      } else if (s.playerMana < sp.mana) {
        push({
          type: "playerArtFail",
          art: art.def.id,
          text: `――魔力が足りず、《${art.def.name}》は唱えられない。`,
        });
      } else {
        s.playerMana -= sp.mana;
        use = {
          id: art.def.id,
          skill: art.def.skill,
          tags: [...baseTags, "spell", `el.${sp.element}`, `tier.${sp.tier}`],
        };
        if (s.lastArtId !== null) use.tags.push(`chain.${s.lastArtId}`);
        if (art.def.part !== undefined) use.tags.push(`aim.${art.def.part}`);
        if (spellCastTicks <= 0) {
          // 無詠唱（instantCast）—— 唱え始めと同じ拍に放つ
          push({
            type: "playerCast",
            art: art.def.id,
            text: `――《${art.def.name}》が瞬時に放たれた。`,
          });
          resolveSpell(art, s.tick);
        } else {
          push({
            type: "playerCast",
            art: art.def.id,
            text: `――《${art.def.name}》の詠唱を始めた。`,
          });
          pendingSpell = { a: art, due: s.tick + spellCastTicks };
        }
      }
    } else if (s.playerKi < art.def.ki) {
      push({
        type: "playerArtFail",
        art: art.def.id,
        text: `――気力が足りず、《${art.def.name}》は出せない。`,
      });
    } else {
      s.playerKi -= art.def.ki;
      use = { id: art.def.id, skill: art.def.skill, tags: [...baseTags] };
      if (s.lastArtId !== null) use.tags.push(`chain.${s.lastArtId}`);
      if (art.def.part !== undefined) use.tags.push(`aim.${art.def.part}`);
      resolveArt(art, use.tags);
    }
  } else if (typeof action === "object" && action.type === "switch") {
    // 武器の持ち替え（K-01）：1行動を消費する。この行動の時間は持ち替え前の
    // 間隔で流れ、次の行動から新しい武器の間隔・技能・補正になる
    const def = cfg.weapons?.[action.weapon];
    if (def !== undefined && s.ownedWeapons.includes(def.id) && def.id !== s.playerWeapon) {
      s.playerWeapon = def.id;
      s.playerWeaponSkill = s.playerSkills[def.skill]?.value ?? 0;
      s.playerAttack = round1(
        (cfg.attackBase +
          s.playerWeaponSkill * cfg.attackPerWeaponSkill +
          s.playerStrength * cfg.attackPerStrength +
          def.power) *
          s.playerAttackFactor,
      );
      s.playerCt = Math.max(cfg.ctMin, s.playerBaseCt * def.ctFactor);
      s.weaponHitBonus = def.hitBonus;
      s.weaponCritBonus = def.critBonus;
      s.weaponDefendBonus = def.defendBonus ?? 0;
      push({ type: "playerSwitch", text: `――《${def.name}》に持ち替えた。` });
    } else {
      // 持っていない武器・既に構えている武器 —— 行動だけが空費される
      push({ type: "playerSwitch", text: "――持ち替えは成らなかった。" });
    }
  } else
    switch (action) {
      case "attack": {
        use = { skill: weaponSkillNow, tags: [...baseTags, "basic.attack"] };
        // 隙への反撃：体勢を崩した敵への一撃は必中・会心扱い（F-04）
        const opening = s.openingFactor > 0 && s.tick <= s.openingUntil;
        const r = ctxRng(ctx, `atk-${s.turn}`);
        if (!opening && r.next() >= hitChance(s, enemy, cfg)) {
          push({ type: "playerMiss", text: `攻撃――${enemy.name}に躱された。` });
          break;
        }
        const crit = opening || r.next() < critChance(s, cfg);
        const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
        // 獣には狩猟・動物知識の技能リンク（beast.attack）が与ダメージに乗る（K-01）
        const beastBonus = enemy.beast === true ? 1 + s.links.beastAttack : 1;
        const staggered =
          s.enemyStatus.stagger !== undefined && s.enemyStatus.stagger.until > s.tick;
        const dmg = round1(
          s.playerAttack *
            spread *
            (crit ? cfg.critFactor : 1) *
            (opening ? s.openingFactor : 1) *
            (staggered ? (arts?.staggerFactor ?? 1) : 1) *
            (s.brokenParts.includes("body") ? (arts?.breakDamageFactor ?? 1) : 1) *
            (1 + (s.passiveFx["attack"] ?? 0)) *
            beastBonus,
        );
        s.enemyHp -= dmg;
        if (opening) {
          s.openingUntil = 0;
          s.openingFactor = 0;
        }
        push({
          type: "playerAttack",
          damage: dmg,
          ...(crit ? { crit: true } : {}),
          ...(opening ? { counter: true } : {}),
          text: opening
            ? `隙を突く――${enemy.name}に ${dmg} の一撃。`
            : crit
              ? `会心――${enemy.name}に ${dmg} の一撃。`
              : `攻撃――${enemy.name}に ${dmg} の傷。`,
        });
        break;
      }
      case "defend": {
        use = { skill: weaponSkillNow, tags: [...baseTags, "basic.defend"] };
        s.defendUntil = endTick;
        push({ type: "playerDefend", text: "防御の構え。" });
        break;
      }
      case "observe": {
        use = { skill: weaponSkillNow, tags: [...baseTags, "basic.observe"] };
        s.observed = true;
        s.readUntil = endTick;
        push({ type: "playerObserve", text: "敵の動きを見切る。" });
        break;
      }
      case "flee": {
        s.fleeAttempts++;
        const rng = ctxRng(ctx, `combat-flee-${s.fleeAttempts}`);
        const chance = Math.min(
          1,
          Math.max(
            0,
            cfg.fleeBase +
              (s.playerAgility - enemyAgilityOf(s, enemy, cfg)) * cfg.fleePerAgility +
              s.links.flee,
          ),
        );
        if (rng.next() < chance) {
          s.fled = true;
          s.done = true;
          push({ type: "fled", text: "――間合いを離した。" });
          return s;
        }
        push({ type: "playerFlee", text: "逃げようとしたが、間合いを詰められた。" });
        break;
      }
    }

  // 使用記録を積む（仕留めた一撃には finisher。after.*・連鎖の記録もここで締める）
  if (use !== null) {
    if (s.enemyHp <= 0) use.tags.push("finisher");
    s.uses.push(use);
    s.lastArtId = use.id ?? null;
    s.afterGuard = false;
    s.afterParry = false;
    s.afterEvade = false;
  }

  if (s.enemyHp <= 0) {
    s.won = true;
    s.done = true;
    push({ type: "won", text: `――${enemy.name}は力尽きた。` });
    return s;
  }

  // 2. 時間を進めて、その間の敵行動を順に解決する
  //    被弾ごとに独立した乱数列（`evd-ターン-序数`）を fork する —— 決定的
  let absorbIdx = 0;
  /** 大技をいなした報酬：隙（反撃）＋体勢崩し（敵の次行動を遅らせる） */
  const openUp = (tick: number, factor: number) => {
    s.openingUntil = tick + cfg.openingTicks;
    s.openingFactor = factor;
    s.enemyNextAt += cfg.staggerTicks;
    s.parries++;
    push({ type: "counter", text: `――${enemy.name}の体勢が大きく崩れた。` }, tick);
  };
  const absorb = (tick: number, move: EnemyMove, big: boolean) => {
    const r = ctxRng(ctx, `evd-${s.turn}-${absorbIdx++}`);
    // M-01：敵の呪文（spell を持つ大技）を見届けると見取り稽古でその呪文を見知る。
    // 「観察」の目を通していなければ理は読めない（09 §4「観察して耐える」）
    if (move.spell !== undefined && s.observed && !s.seenSpells.includes(move.spell)) {
      s.seenSpells.push(move.spell);
      push(
        {
          type: "spellSeen",
          spell: move.spell,
          text: `――《${move.name}》の理を垣間見た。`,
        },
        tick,
      );
    }
    // 腕が壊れた敵の大技は威力が落ちる（K-02。09 §5「腕を壊すと大技が出せない」の弱体化）
    const movePower =
      move.power * (big && s.brokenParts.includes("arms") ? (arts?.breakMoveFactor ?? 1) : 1);
    // K-02 受け流しの構え（対応技）：構え中の被弾をいなす。
    // 大技をいなせば大きな隙が生まれ、使用記録には after.parry が残る
    if (tick <= s.parryUntil) {
      const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
      const dmg = Math.max(
        1,
        Math.round(movePower * spread * (arts?.parryFactor ?? 0.15) * (1 - s.links.enemyPower)),
      );
      s.playerHp -= dmg;
      s.damageTaken += dmg;
      s.hitsTaken++;
      s.afterParry = true;
      tryInterrupt(tick); // M-01：受け流した被弾でも集中は削れる
      push(
        {
          type: "parried",
          damage: dmg,
          ...(big ? { big: true } : {}),
          text: `${enemy.name}の《${move.name}》――受け流した（${dmg}）。`,
        },
        tick,
      );
      if (big) {
        openUp(
          tick,
          (arts?.parryCounterFactor ?? cfg.counterFactor) + (s.passiveFx["counter"] ?? 0),
        );
      }
      return;
    }
    // 回避判定（防御・鉄壁中は躱さない —— 受け止める構えの分だけ揺らぎが無い）
    const evade =
      tick <= s.defendUntil || tick <= s.guardArtUntil
        ? 0
        : clamp(
            0,
            cfg.evadeMax,
            cfg.evadeBase +
              s.playerEvasion * cfg.evadePerEvasion +
              (s.playerAgility - enemyAgilityOf(s, enemy, cfg)) * cfg.evadePerAgilityDiff +
              s.links.evade +
              (s.passiveFx["evade"] ?? 0) +
              (tick <= s.readUntil ? cfg.readEvadeBonus : 0) +
              (tick <= s.evadeUntil ? (arts?.evadeArtBonus ?? 0) : 0),
          );
    if (r.next() < evade) {
      s.dodges++;
      s.afterEvade = true;
      push(
        {
          type: "enemyMiss",
          ...(big ? { big: true } : {}),
          text:
            tick <= s.readUntil
              ? `${enemy.name}の《${move.name}》――見切って躱した。`
              : tick <= s.evadeUntil
                ? `${enemy.name}の《${move.name}》――間合いを抜けて躱した。`
                : `${enemy.name}の《${move.name}》――とっさに躱した。`,
        },
        tick,
      );
      // 見切り・回避の構えで大技を躱せば大きな隙が生まれる
      if (big && tick <= s.readUntil)
        openUp(tick, cfg.counterFactorRead + (s.passiveFx["counter"] ?? 0));
      else if (big && tick <= s.evadeUntil)
        openUp(tick, cfg.counterFactorRead + (s.passiveFx["counter"] ?? 0));
      return;
    }
    const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
    // 大技は揺らぎはあっても痛恨にはならない（対応すべき「約束された一撃」として読めるよう）
    const crit = !big && r.next() < cfg.enemyCritBase;
    // 威圧・魔法などの技能リンク（combat.enemyPower）で敵の威力を減衰させる（K-01）
    let dmg = movePower * spread * (crit ? cfg.enemyCritFactor : 1) * (1 - s.links.enemyPower);
    // 防御・鉄壁（K-02 対応技）：鉄壁は一律の軽減、通常の防御は大技に強い
    const guardArt = tick <= s.guardArtUntil;
    const guarded = tick <= s.defendUntil || guardArt;
    if (guarded) {
      // 防御中は武器の防御補正（盾）と技能リンク（combat.defend）・パッシブがさらに乗る（K-01/K-02）
      const extra = Math.min(
        0.9,
        s.weaponDefendBonus + s.links.defend + (s.passiveFx["defend"] ?? 0),
      );
      const factor = guardArt
        ? (arts?.guardArtFactor ?? 0.25)
        : big
          ? cfg.guardTelegraphFactor
          : cfg.defendFactor;
      dmg *= factor * (1 - extra);
    }
    dmg = Math.max(1, Math.round(dmg));
    s.playerHp -= dmg;
    s.damageTaken += dmg;
    s.hitsTaken++;
    s.afterGuard = guarded;
    tryInterrupt(tick); // M-01：詠唱中の被弾は術を途切らせうる
    push(
      {
        type: "enemyHit",
        damage: dmg,
        ...(crit ? { crit: true } : {}),
        ...(big ? { big: true } : {}),
        ...(guarded ? { guarded: true } : {}),
        text: guarded
          ? `${enemy.name}の《${move.name}》――受け止めた（${dmg}）。`
          : big
            ? `${enemy.name}の《${move.name}》――${dmg} の大傷。`
            : crit
              ? `${enemy.name}の《${move.name}》――痛恨。${dmg} の傷。`
              : `${enemy.name}の《${move.name}》――${dmg} の傷。`,
      },
      tick,
    );
    // 大技を防御・鉄壁で受け止めれば隙が生まれる
    if (big && guarded) openUp(tick, cfg.counterFactor + (s.passiveFx["counter"] ?? 0));
  };

  // 継続状態（K-02）：この行動枠の間に出血・毒・燃焼・感電が削った分（表示は1行に畳む）
  const tickDmg: Partial<Record<StatusId, number>> = {};
  let t = s.tick;
  while (t < endTick && s.enemyHp > 0) {
    // 出血・毒・燃焼・感電は tick ごとに敵の体力を削る（敵は動けずとも蝕まれていく）
    for (const id of ["bleed", "poison", "burn", "shock"] as const) {
      const st = s.enemyStatus[id];
      if (st !== undefined && st.until > t) {
        s.enemyHp -= st.power;
        tickDmg[id] = (tickDmg[id] ?? 0) + st.power;
      }
    }
    if (s.enemyHp <= 0) break;
    // M-01：詠唱の終わる拍に呪文が発動する（中断されていなければ）
    if (pendingSpell !== null && pendingSpell.due <= t) {
      const a = pendingSpell.a;
      pendingSpell = null;
      resolveSpell(a, t);
    }
    if (s.enemyHp <= 0) break;
    // 予兆の発動
    if (s.telegraph && s.telegraph.dueTick <= t) {
      const mv = enemy.moves[s.telegraph.move];
      s.telegraph = null;
      if (mv) absorb(t, mv, true);
    }
    // 敵のパターン行動
    if (s.enemyNextAt <= t) {
      const step = enemy.pattern[s.enemyIdx % enemy.pattern.length]!;
      s.enemyIdx++;
      s.enemyNextAt += enemy.intervalTicks;
      // 気絶（K-02）：掛かっている間、敵はその一手を逃す
      const stunned = s.enemyStatus.stun !== undefined && s.enemyStatus.stun.until > t;
      if (stunned) {
        s.enemyStatus.stun = undefined;
        push({ type: "stunned", text: `――${enemy.name}はふらついて動けない。` }, t);
      } else if (step.type === "telegraph" && step.move) {
        const mv = enemy.moves[step.move];
        s.telegraph = {
          move: step.move,
          name: mv?.name ?? step.move,
          // M-01：呪文の大技は「詠唱」として出す（spell id が載ると見取り稽古の対象）
          ...(mv?.spell !== undefined ? { spell: mv.spell } : {}),
          // F-04：発動は必ず現在の間合い（この行動の時間枠）の「先」に置く。
          // 予兆が見えてから次の判断まで必ず1手挟まる = 応じる機会が必ずある
          // （この枠の中で完結してしまうと、玩家は見えたのに防げない事故になる）
          dueTick: Math.max(t + (step.ticks ?? enemy.intervalTicks), endTick + 1),
        };
        push(
          {
            type: "telegraph",
            ...(mv?.spell !== undefined ? { spell: mv.spell } : {}),
            text:
              mv?.spell !== undefined
                ? `${enemy.name}が詠唱を始めた。`
                : `${enemy.name}に予兆が見える。`,
          },
          t,
        );
      } else {
        absorb(t, enemy.attack, false);
      }
      // 鈍足（K-02）：掛かっている間、敵の次の間合いが伸びる
      const slow = s.enemyStatus.slow;
      if (slow !== undefined && slow.until > t && slow.power > 1) {
        s.enemyNextAt += enemy.intervalTicks * (slow.power - 1);
      }
    }
    t++;
    if (s.playerHp <= 0) break;
  }
  // M-01：詠唱がちょうど行動枠の切れ目に終わる呪文（詠唱 > CT で枠が伸びた分）
  // はループ（t < endTick）の内側に来ない。枠の終わりの拍に発動する
  if (pendingSpell !== null && pendingSpell.due <= endTick && s.enemyHp > 0) {
    const a = pendingSpell.a;
    pendingSpell = null;
    resolveSpell(a, endTick);
  }
  s.tick = endTick;

  // 継続状態で削った分は1行に畳んで出す（出血が毎tick流れると読めないため）
  for (const [id, dmg] of Object.entries(tickDmg)) {
    if (dmg === undefined || dmg <= 0) continue;
    push({
      type: "statusTick",
      status: id as StatusId,
      damage: round1(dmg),
      text: `――${enemy.name}は${STATUS_TICK_NAMES[id as StatusId]}（${round1(dmg)}）。`,
    });
  }

  // 状態で倒れた敵（出血・毒で決着が着くこともある）
  if (s.enemyHp <= 0 && !s.done) {
    s.won = true;
    s.done = true;
    push({ type: "won", text: `――${enemy.name}は力尽きた。` });
    return s;
  }

  // K-02：行動に使った時間のぶん気力が戻る（09 §2「時間（CT）で戻る」）
  s.playerKi = Math.min(
    s.playerKiMax,
    round1(s.playerKi + s.kiRegenPerTick * (s.tick - startTick)),
  );
  // M-01：魔力も同じく時間で戻る（09 §2「時間・休息・瞑想・道具で戻る」の時間分）
  s.playerMana = Math.min(
    s.playerManaMax,
    round1(s.playerMana + s.manaRegenPerTick * (s.tick - startTick)),
  );

  if (s.playerHp <= 0) {
    s.done = true;
    s.died = true;
    push({ type: "lost", text: "――意識が遠のく。" });
  }
  return s;
}

export function combatResult(s: CombatState): CombatResult {
  return {
    won: s.won,
    fled: s.fled,
    died: s.died,
    damageTaken: s.damageTaken,
    hitsTaken: s.hitsTaken,
    ticks: s.tick,
    kiLeft: s.playerKi,
    uses: s.uses,
    manaLeft: s.playerMana,
    seenSpells: s.seenSpells,
  };
}

/**
 * いま使える武技・呪文（M-01）。
 * 武技はスロット入り＋装備中の武器技能のものだけ —— 持ち替えたら技も替わる。
 * 呪文は武器の構えに関係なく唱えられる（剣を持ったまま放てる）
 */
export function usableArts(state: CombatState, cfg: CombatConfig): { def: ArtDef; lv: number }[] {
  const skill = weaponDefOf(cfg, state.playerWeapon).skill;
  return state.artSlots.filter((a) => a.def.spell !== undefined || a.def.skill === skill);
}

/* ── K-02 の表示名（戦闘ログの語彙。cli.json ではなく戦闘内の定型としてここに置く） ── */

/** 状態異常の付与文（「――敵は◯◯。」） */
const STATUS_NAMES: Record<StatusId, string> = {
  bleed: "血を流している",
  stun: "気絶した",
  stagger: "体勢を崩した",
  slow: "足が鈍った",
  poison: "毒を受けた",
  wet: "びしょ濡れになった",
  oil: "油を被った",
  frozen: "凍り付いた",
  burn: "燃え上がった",
  shock: "感電している",
};

/** 継続ダメージの畳み込み文（「――敵は◯◯（N）。」） */
const STATUS_TICK_NAMES: Record<StatusId, string> = {
  bleed: "出血で体力を削られている",
  stun: "気絶している",
  stagger: "体勢が崩れている",
  slow: "足が鈍っている",
  poison: "毒に蝕まれている",
  wet: "びしょ濡れになっている",
  oil: "油を被っている",
  frozen: "凍り付いている",
  burn: "燃え続けている",
  shock: "感電で痺れている",
};

/** 相性の発火文（「――敵は◯◯。」） */
const REACTION_NAMES: Record<string, string> = {
  shock: "濡れた体に電撃が走った",
  enflame: "油が燃え移って延焼した",
  shatter: "凍った体が砕かれた",
  fan: "炎が風に煽られて燃え広がった",
};

/** 部位の表示名（部位破壊の文） */
const PART_NAMES: Record<BodyPart, string> = {
  head: "頭",
  body: "胴",
  arms: "腕",
  legs: "脚",
};

/** 強化版ユニーク（T-44、06 §3B）。balance.combat.unique に対応 */
export interface UniqueConfig {
  /** 強個体が解禁される同種の討伐数 */
  afterKills: number;
  /** HP・攻撃力の強化倍率 */
  hpFactor: number;
  powerFactor: number;
  /** 挑戦差（gain）・敏捷の加算値 */
  challengeBonus: number;
  agilityBonus: number;
}

/**
 * 敵の強化版を作る（再戦）。数値だけを強化し、行動パターンはそのまま。
 * 表示名は呼び出し側がテンプレートで付ける（core は表示名を作らない）
 */
export function enhancedEnemy(def: EnemyDef, u: UniqueConfig): EnemyDef {
  const scale = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.round(m.power * u.powerFactor),
  });
  return {
    ...def,
    hp: Math.round(def.hp * u.hpFactor),
    challenge: def.challenge + u.challengeBonus,
    agility: def.agility + u.agilityBonus,
    attack: scale(def.attack),
    moves: Object.fromEntries(Object.entries(def.moves).map(([k, m]) => [k, scale(m)])),
  };
}

/** 強個体が狩り対象として解禁されているか（同種の討伐数で判定） */
export function canFightUnique(
  state: { counters: Record<string, number> },
  enemyId: string,
  u: UniqueConfig,
): boolean {
  return (state.counters[`kill.species.${enemyId}`] ?? 0) >= u.afterKills;
}

/* ── R-01：個体差 ──────────────────────────────────────────── */

/**
 * 同じ種でも個体で違う（R-01）。「ちょっと強い狼」や「臆病な狼」が
 * 出会いごとに決定的に決まる。ユニーク（afterKills で解禁される固定の
 * 強個体）とは別系統で、こちらは遭遇のたびに揺らぐ。
 */
export interface IndividualConfig {
  /** 強い個体（精悍）の出る確率 */
  strongChance: number;
  /** 臆病な個体の出る確率 */
  timidChance: number;
  /** 強い個体の HP・攻撃威力の倍率と挑戦差・敏捷の加算 */
  strongHpFactor: number;
  strongPowerFactor: number;
  strongChallengeBonus: number;
  strongAgilityBonus: number;
  /** 臆病な個体：威力が下がり行動間隔が伸びる。挑戦差も下がる */
  timidPowerFactor: number;
  timidIntervalFactor: number;
  timidChallengeBonus: number;
  /**
   * 普通の個体にも掛かる小さなジッター（±の半幅）。HP・威力は倍率、
   * 敏捷は加減算の幅。期待値はいずれも元の値
   */
  hpJitter: number;
  powerJitter: number;
  agilityJitter: number;
}

/** 個体の気質（表示用。normal は素の敵） */
export type EnemyTrait = "strong" | "timid" | "normal";

/**
 * 個体差を敵定義に適用する。遭遇のたびに呼び、渡す乱数は
 * 出会い（seed×日×敵種×行動番号）の独立した列にすること。
 * 行動パターンは変えず、数値だけを動かす（enhancedEnemy と同じ方針）
 */
export function rollIndividual(
  def: EnemyDef,
  rng: Rng,
  cfg: IndividualConfig,
): { def: EnemyDef; trait: EnemyTrait } {
  const scaleMoves = (f: number): Record<string, EnemyMove> =>
    Object.fromEntries(
      Object.entries(def.moves).map(([k, m]) => [
        k,
        { ...m, power: Math.max(1, Math.round(m.power * f)) },
      ]),
    );
  const u = rng.next();
  if (u < cfg.strongChance) {
    return {
      trait: "strong",
      def: {
        ...def,
        hp: Math.round(def.hp * cfg.strongHpFactor),
        challenge: def.challenge + cfg.strongChallengeBonus,
        agility: def.agility + cfg.strongAgilityBonus,
        attack: {
          ...def.attack,
          power: Math.max(1, Math.round(def.attack.power * cfg.strongPowerFactor)),
        },
        moves: scaleMoves(cfg.strongPowerFactor),
      },
    };
  }
  if (u > 1 - cfg.timidChance) {
    return {
      trait: "timid",
      def: {
        ...def,
        challenge: def.challenge + cfg.timidChallengeBonus,
        attack: {
          ...def.attack,
          power: Math.max(1, Math.round(def.attack.power * cfg.timidPowerFactor)),
        },
        moves: scaleMoves(cfg.timidPowerFactor),
        intervalTicks: Math.round(def.intervalTicks * cfg.timidIntervalFactor),
      },
    };
  }
  /* 普通の個体にも小さな揺らぎ（対称三角分布で中央寄り、期待値は元の値） */
  const jit = (): number => rng.next() + rng.next() - 1;
  const hpF = 1 + jit() * cfg.hpJitter;
  const pwF = 1 + jit() * cfg.powerJitter;
  const agiD = Math.round(jit() * cfg.agilityJitter);
  return {
    trait: "normal",
    def: {
      ...def,
      hp: Math.max(1, Math.round(def.hp * hpF)),
      agility: Math.max(0, def.agility + agiD),
      attack: { ...def.attack, power: Math.max(1, Math.round(def.attack.power * pwF)) },
      moves: Object.fromEntries(
        Object.entries(def.moves).map(([k, m]) => [
          k,
          { ...m, power: Math.max(1, Math.round(m.power * pwF)) },
        ]),
      ),
    },
  };
}
