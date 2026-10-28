import type { GameState } from "../state/types.js";

/**
 * 武技・構成（K-02、docs/09_skills_and_magic.md §1〜3、§5〜6、§8）。
 *
 * - 武技は武器技能の熟練と「技能の使い方の記録」（使用タグの傾き）で習得する
 *   （§7.1）。習得条件はすべてデータ（arts.json の learn）側にある
 * - 技は Lv1〜10 で使うほど育ち、経験は睡眠で定着する（起床ログに載る）
 * - 構成は 8枠の戦闘技スロット＋4枠のパッシブ＋武器2本。街で組み替える
 * - 使用記録は技ごと・技能ごとのタグ回数の集計だけを持つ（生ログは残さない。
 *   タグは進化・合成（K-03）の土台にもなる）
 *
 * 乱数は使わない（習得・レベルは決定的な閾値。戦闘内の抽選は combat が担う）
 */

/** 打撃の性質（03 §4：斬・突・打＋M-01 の魔法） */
export type DamageType = "slash" | "pierce" | "blunt" | "magic";
/** 狙う部位（03 §4「部位」） */
export type BodyPart = "head" | "body" | "arms" | "legs";
/**
 * 状態異常（09 §3）。
 * M-01：魔法の相性（09 §5「濡れ＋雷、油＋火、凍結＋打撃、風＋火」）の
 * 布石・結果を同じ仕組みに乗せる —— wet/oil/frozen は相性の布石（前掛け）、
 * burn/shock は相性・呪文の継続傷として働く
 */
export type StatusId =
  "bleed" | "stun" | "stagger" | "slow" | "poison" | "wet" | "oil" | "frozen" | "burn" | "shock";
/**
 * 技の種類：攻撃技 / 予兆への対応技 / 補助（状態だけを掛ける） / 回復（M-01 の治癒呪文） /
 * パッシブ（常時） / 生活魔法（M-01。戦闘では使えず、lifeSpell コマンドで使う）
 */
export type ArtKind = "attack" | "response" | "support" | "heal" | "passive" | "life";
/** 戦闘スロットに入る種別（attack/response/support/heal。passive・life は別枠・別系統） */
export const COMBAT_ART_KINDS: readonly ArtKind[] = ["attack", "response", "support", "heal"];
/** 対応技の型：割り込み（予兆を潰す）/ 受け流し / 回避 / 受け止め */
export type ResponseKind = "interrupt" | "parry" | "evade" | "guard";
/** 射程（09 §3。近=武器の間合い、中・遠=弓・投擲系） */
export type ArtRange = "near" | "mid" | "far";

/** 習得条件（§7.1）。技能の熟練度と使い方の傾きで決まる */
export interface ArtLearn {
  /**
   * 由来技能の値がこれに達すると習得候補になる。
   * 省略時は技能値では覚えない —— 進化・合成・ユニーク（K-03、09 §7）のように
   * 特別な経路でだけ得られる技の印（checkArtsLearn はこの定義を除く）
   */
  at?: number;
  /**
   * 使用タグの傾き条件（任意）。その技能の使い方の記録にこのタグが
   * share 以上の割合を占めるときだけ覚えられる（防御中心なら受け流し系、
   * 先手を取るなら影系… 覚える技の順番・種類が使い方で変わる、09 §7.1）
   */
  tag?: string;
  /** tag のシェア下限（0〜1。省略時は ArtsConfig.styleShareMin） */
  share?: number;
  /**
   * 知識フラグ（M-01、09 §4「覚え方」）：魔導書を読む・師匠の秘伝・
   * 敵の呪文を見取った（spell.seen.<id>）など、世界が立てた旗が
   * 必要な技・呪文。at/tag と併記（全部満たすと覚える）
   */
  flag?: string;
  /**
   * 反復条件（M-01、09 §4「生活魔法を使い続けて派生させる」）：
   * counters[key] が gte 以上なら覚えられる（例：生活魔法の使用回数）
   */
  counter?: { key: string; gte: number };
}

/**
 * 進化形の性能差分（K-03、09 §7）：派生定義を作るとき基底へ畳み込む変更。
 * 書いたフィールドだけが基底の値を置き換える（spell は下位フィールドごとに合成）
 */
export interface EvolveMod {
  /** 進化形の名（ローダーが派生定義を作るときに使う。例：旋風薙ぎ） */
  name?: string;
  /* ── 攻撃技 ── */
  power?: number;
  dtype?: DamageType;
  part?: BodyPart;
  hits?: number;
  hitBonus?: number;
  /** 状態付与を変える（null で外す） */
  status?: { id: StatusId; chance: number; ticks: number; power: number } | null;
  heavy?: true;
  pierceArmor?: true;
  /* ── 対応技 ── */
  response?: ResponseKind;
  /* ── コスト・拍 ── */
  ki?: number;
  ct?: number;
  range?: ArtRange;
  /** パッシブの効果 */
  effect?: { hook: string; value: number };
  /** 呪文面の変更（element/tier は基底を継ぐ） */
  spell?: {
    mana?: number;
    cast?: number;
    heal?: number;
    drain?: number;
    life?: {
      hook: LifeHook;
      value: number;
      transform?: { from: string; to: string; n: number };
    };
  };
  /** 進化形の説明文（省略時はローダーが理由から組み立てる） */
  desc?: string;
}

/**
 * 進化の分岐（K-03、09 §7.1）：どんな使い方に向いているかの重み。
 * Lv10 に達したとき、使用記録（artTags）と最も合う分岐へ進化する。
 * 進化形の名は to の定義が持つ —— 進化するまで UI は「？？？」で伏せる
 */
export interface EvolveBranch {
  /**
   * 傾きの軸の表示名（「群れ」「一点」「静けさ」）。
   * ステータスの技タブに名前を伏せて出す傾きメーターのラベル
   */
  tilt: string;
  /**
   * 進化理由の語り片（「群れへ放ち続けた」）。
   * 進化メッセージ「――あなたは《元》を、{reason}。」に差し込む
   */
  reason: string;
  /**
   * どんな使い方に向いているか（使用タグ → 重み）。
   * 分岐のスコア = Σ weight × share(artTags[元id], tag)
   */
  weights: Record<string, number>;
  /** 進化先の技ID（ローダーが派生定義を materialize した id —— JSON 側では書かない） */
  to: string;
  /** 隠し分岐か（hidden/k03 由来。極端な使い方だけが通る） */
  hidden?: boolean;
}

/** 武技の定義（arts.json の1件。パッシブは kind:"passive" でスロットが別枠） */
export interface ArtDef {
  id: string;
  name: string;
  /** 由来技能（武技は武器技能、パッシブは門出の技能） */
  skill: string;
  learn: ArtLearn;
  kind: ArtKind;
  /* ── 攻撃技 ── */
  /** 攻撃力の倍率（省略時1。hits 発は1発ごとに掛かる） */
  power?: number;
  /** 打撃の性質 */
  dtype?: DamageType;
  /** 狙う部位（省略時は胴 —— 部位破壊のゲージは部位ごとに積む） */
  part?: BodyPart;
  /** 連撃数（1発ごとに命中・会心・威力を転がす） */
  hits?: number;
  /** 命中への加算（負も可。大技は当たりにくい） */
  hitBonus?: number;
  /** 付与する状態異常（chance=掛かる確率・ticks=持続・power=効果の強さ） */
  status?: { id: StatusId; chance: number; ticks: number; power: number };
  /** 崩し（stagger）中の敵への特効：会心が確定し崩しを消費する（09 §5「崩し→大技」） */
  heavy?: true;
  /** 耐性を貫く（敵の耐性<1を無視。弱点>1は残る —— 貫通系の意匠） */
  pierceArmor?: true;
  /* ── 対応技 ── */
  response?: ResponseKind;
  /* ── コスト・拍 ── */
  /** 気力の消費（09 §2。0 の技もありうる） */
  ki: number;
  /** 行動 CT の倍率（素の攻撃=1。大技ほど重い） */
  ct: number;
  range?: ArtRange;
  /** パッシブの効果（hook の集合は ArtsConfig 側で固定） */
  effect?: { hook: string; value: number };
  /**
   * 呪文の面（M-01、09 §4）。このフィールドがある定義は「呪文」：
   * 気力ではなく魔力を消費し、詠唱（cast tick）の後に発動する。
   * 武器技能に関係なく戦闘スロットから使える（剣を持ったまま唱えられる）。
   * 生活魔法（kind:"life"）は戦闘では使えず lifeSpell コマンドで使う
   */
  spell?: SpellAspect;
  /**
   * 進化の分岐（K-03、09 §7.1）。Lv10 に達したとき、使用記録と
   * 最も合う分岐へ進化する。分岐は2〜4つ —— どの分岐にも合わない
   * 使い方でも最も近い分岐に進化し、極端な使い方は隠し分岐に通じる
   */
  evolve?: { branches: EvolveBranch[] };
  desc: string;
}

/** 魔法の属性（09 §4：火・水（氷）・風（雷）・土・光・闇・無属性・生活・治癒） */
export type MagicElement =
  "fire" | "water" | "wind" | "earth" | "light" | "dark" | "void" | "life" | "cure";
export const MAGIC_ELEMENTS: readonly MagicElement[] = [
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
/** 魔法技能 → 属性（適性・相性の照合に使う。skills.json の技能IDに対応） */
export const SPELL_SKILL_ELEMENTS: Record<string, MagicElement> = {
  fire_magic: "fire",
  water_magic: "water",
  wind_magic: "wind",
  earth_magic: "earth",
  light_magic: "light",
  dark_magic: "dark",
  void_magic: "void",
  life_magic: "life",
  cure: "cure",
};
/** 呪文の位（初級・中級・上級。覚える条件の目安と表示に使う） */
export type SpellTier = "novice" | "adept" | "expert";
/** 生活魔法の効果の系統（lifeSpell コマンドが各生活行動へ接続する窓） */
export type LifeHook =
  /** 次の料理の出来に加算（火加減） */
  | "cookBonus"
  /** 次の鍛冶系仕事の品質に加算（炉の温度管理） */
  | "smithBonus"
  /** 次の農耕系仕事の品質に加算（地力） */
  | "farmBonus"
  /** 次の調合系仕事の品質に加算（魔法薬の素） */
  | "alchemyBonus"
  /** 次の採集の引き回数に加算 */
  | "gatherBonus"
  /** 次の眠りの質に加算（野営の灯り） */
  | "campBonus"
  /** 即時に疲労を回復（癒しの手） */
  | "heal"
  /** 持ち物を乾燥・冷却して保存食に変える（transform） */
  | "preserve";

/** 呪文の面（spells.json の spell 節。M-01） */
export interface SpellAspect {
  /** 属性（適性・相性の照合に使う） */
  element: MagicElement;
  /** 位（初級・中級・上級） */
  tier: SpellTier;
  /** 消費する魔力（09 §2。戦闘・生活どちらの使用でも減る） */
  mana: number;
  /**
   * 詠唱の基本 tick（09 §4「詠唱の時間がかかる」）。
   * 実効の長さは castTicksOf が技能・パッシブで短縮する。
   * その間に攻撃されると中断されうる
   */
  cast: number;
  /** 回復量の係数（kind:"heal" のみ。heal × 呪文威力が体力に戻る） */
  heal?: number;
  /** 与えた傷のこの割合を自分が回復する（吸収系） */
  drain?: number;
  /** 生活魔法の効果（kind:"life" のみ。各 hook が生活行動へ接続する） */
  life?: {
    hook: LifeHook;
    value: number;
    /** preserve：持ち物 from を n 個まで to に変える（乾燥・冷却で保存食に） */
    transform?: { from: string; to: string; n: number };
  };
}

/** パッシブの効果のhook一覧（combat が読む結線の語彙） */
export const PASSIVE_HOOKS = [
  "hit",
  "crit",
  "evade",
  "defend",
  "counter",
  "attack",
  "dmg.slash",
  "dmg.pierce",
  "dmg.blunt",
  "dmg.magic",
  "status",
  "kiRegen",
  "kiMax",
  "manaMax",
  "manaRegen",
  "castSpeed",
  "instantCast",
] as const;
export type PassiveHook = (typeof PASSIVE_HOOKS)[number];

/**
 * 武技まわりの係数（balance.arts）。StepConfig.arts として注入し、
 * 戦闘では CombatConfig.arts 経由でも使う
 */
export interface ArtsConfig {
  /** 技の定義表（arts.json → id 引き） */
  defs: Record<string, ArtDef>;
  /** 構成の枠数（09 §6：戦闘技8＋パッシブ4＋武器2） */
  slots: number;
  passiveSlots: number;
  weaponSlots: number;
  /* ── 気力・魔力（09 §2） ── */
  /** 気力の上限 = kiBase + endurance × kiPerEndurance */
  kiBase: number;
  kiPerEndurance: number;
  /** 戦闘中、経過 tick ごとに戻る気力 */
  kiRegenPerTick: number;
  /** 魔力の上限 = manaBase + spirit × manaPerSpirit（M-01 で使う。今は素枠） */
  manaBase: number;
  manaPerSpirit: number;
  /* ── 技の成長（09 §1「Lv1〜10 で使うほど育つ」） ── */
  /** Lv n→n+1 に必要な経験 = levelStep × n */
  levelStep: number;
  maxLevel: number;
  /** Lv1あがるごとの威力・効果時間の伸び（相対） */
  levelPowerFactor: number;
  /** Lv1あがるごとの状態付与率の伸び（相対） */
  levelStatusFactor: number;
  /** 1回の使用で入る経験 = expBase × (1 + max(0, 挑戦差) × expChallengeFactor) */
  expBase: number;
  expChallengeFactor: number;
  /* ── 状態異常・部位（09 §3、§5） ── */
  /** 部位破壊のしきい値（敵の最大HP×この割合のダメージを部位に蓄積） */
  partBreakShare: number;
  /** 胴が壊れた敵の被ダメージ倍率 */
  breakDamageFactor: number;
  /** 脚が壊れた敵の敏捷倍率（命中・逃走が楽になる） */
  breakAgilityFactor: number;
  /** 腕が壊れた敵の大技威力倍率（03 §4「腕を壊すと大技が出せない」→ 弱体化） */
  breakMoveFactor: number;
  /** 頭が壊れた敵への状態付与率倍率 */
  breakStatusFactor: number;
  /** 体勢崩し（stagger）中の敵の被ダメージ倍率 */
  staggerFactor: number;
  /** 対応技の係数：受け流しの被ダメ・受け流し反撃・回避構えの加算・鉄壁の被ダメ */
  parryFactor: number;
  parryCounterFactor: number;
  evadeArtBonus: number;
  guardArtFactor: number;
  /** learn.share の既定値（その技能の使用記録にタグが占める割合の下限） */
  styleShareMin: number;
}

/* ── プレイヤー側の保持形（GameState.player の一部） ── */

/** 習得済み技の状態（exp は定着済み、pending は睡眠で定着する分） */
export interface ArtState {
  lv: number;
  exp: number;
  pending: number;
}

/** 構成（09 §6）。スロットは null で空きを表す */
export interface BuildState {
  /** 戦闘技スロット（8枠） */
  slots: (string | null)[];
  /** パッシブスロット（4枠） */
  passives: (string | null)[];
  /** 持ち替えられる武器（2本。[0]が構えの本命） */
  weapons: (string | null)[];
}

/** 気力の上限（基礎値＋耐久比例。パッシブ kiMax が乗る） */
export function kiMaxOf(stats: Record<string, number>, cfg: ArtsConfig, passiveKiMax = 0): number {
  return (
    Math.round((cfg.kiBase + (stats["endurance"] ?? 0) * cfg.kiPerEndurance + passiveKiMax) * 10) /
    10
  );
}

/** 魔力の上限（M-01 で使う枠。今は回復・表示だけ） */
export function manaMaxOf(
  stats: Record<string, number>,
  cfg: ArtsConfig,
  passiveManaMax = 0,
): number {
  return (
    Math.round((cfg.manaBase + (stats["spirit"] ?? 0) * cfg.manaPerSpirit + passiveManaMax) * 10) /
    10
  );
}

/** 経験からレベルを引く（累計Lv n→n+1 の必要量 = levelStep×n の総和） */
export function artLevelFor(exp: number, cfg: ArtsConfig): number {
  let lv = 1;
  let need = 0;
  while (lv < cfg.maxLevel) {
    need += cfg.levelStep * lv;
    if (exp < need) break;
    lv++;
  }
  return lv;
}

/** 次のレベルまでの累計必要経験（表示用。maxLevel なら null） */
export function artExpToNext(state: ArtState, cfg: ArtsConfig): number | null {
  if (state.lv >= cfg.maxLevel) return null;
  let need = 0;
  for (let lv = 1; lv <= state.lv; lv++) need += cfg.levelStep * lv;
  return need;
}

/** 習得した技のID一覧（build・ステータス表示用） */
export function learnedArtIds(state: GameState): string[] {
  return Object.keys(state.player.arts);
}

/**
 * 構成の検証と正規化（setBuild の中身）。
 * 習得済み・種別・重複・枠数を確認し、満たさないものは削る。
 * 返り値は常に正しい形（枠数に null 詰め）。不正な指定だけが落ちる
 */
export function normalizeBuild(
  state: GameState,
  input: { slots?: (string | null)[]; passives?: (string | null)[]; weapons?: (string | null)[] },
  cfg: ArtsConfig,
): BuildState {
  const arts = state.player.arts;
  const pick = (
    ids: (string | null)[] | undefined,
    n: number,
    want: (id: string) => boolean,
  ): (string | null)[] => {
    const out: (string | null)[] = [];
    for (const id of ids ?? []) {
      if (out.length >= n) break;
      if (id === null || id === undefined) {
        out.push(null);
        continue;
      }
      // 習得済み・種別一致・重複なしだけを採る
      if (arts[id] === undefined) continue;
      const def = cfg.defs[id];
      if (def === undefined || !want(id)) continue;
      if (out.includes(id)) continue;
      out.push(id);
    }
    while (out.length < n) out.push(null);
    return out;
  };
  const owned = new Set(state.player.weapons);
  const weapons: (string | null)[] = [];
  for (const id of input.weapons ?? []) {
    if (weapons.length >= cfg.weaponSlots) break;
    if (id === null) {
      weapons.push(null);
      continue;
    }
    if (!owned.has(id) || weapons.includes(id)) continue;
    weapons.push(id);
  }
  while (weapons.length < cfg.weaponSlots) weapons.push(null);
  // 武器スロットが全空なら装備中の武器を本命に据える（構成を空にできない）
  const finalWeapons: (string | null)[] = weapons.every((w) => w === null)
    ? [state.player.weapon, ...weapons.slice(1)]
    : weapons;
  return {
    // M-01：戦闘スロットは武技と魔法を自由に混ぜられる（09 §6）。
    // 生活魔法（kind:"life"）は戦闘では使えないので枠に入らない
    slots: pick(input.slots, cfg.slots, (id) =>
      COMBAT_ART_KINDS.includes(cfg.defs[id]?.kind ?? "passive"),
    ),
    passives: pick(input.passives, cfg.passiveSlots, (id) => cfg.defs[id]?.kind === "passive"),
    weapons: finalWeapons,
  };
}

/** 既定の構成（新規・移行セーブ用。装備中＋もう1本を武器枠に） */
export function defaultBuild(state: GameState, cfg: ArtsConfig): BuildState {
  const alt = state.player.weapons.find((w) => w !== state.player.weapon) ?? null;
  const build: BuildState = {
    slots: Array.from({ length: cfg.slots }, () => null),
    passives: Array.from({ length: cfg.passiveSlots }, () => null),
    weapons: [state.player.weapon, alt],
  };
  // 習得済みの技・パッシブを先頭から詰める（移行直後に使える構成を用意）
  const fill = (ids: string[], n: number): (string | null)[] => {
    const out: (string | null)[] = ids.slice(0, n);
    while (out.length < n) out.push(null);
    return out;
  };
  const sorted = artsSorted(state, cfg);
  build.slots = fill(
    sorted
      .filter((a) => COMBAT_ART_KINDS.includes(cfg.defs[a.id]?.kind ?? "passive"))
      .map((a) => a.id),
    cfg.slots,
  );
  build.passives = fill(
    sorted.filter((a) => cfg.defs[a.id]?.kind === "passive").map((a) => a.id),
    cfg.passiveSlots,
  );
  return build;
}

/** 習得済み技を技能→習得順で並べる（構成の初期詰め・一覧用） */
function artsSorted(state: GameState, cfg: ArtsConfig): { id: string }[] {
  return (
    Object.keys(state.player.arts)
      .map((id) => ({ id, def: cfg.defs[id] }))
      .filter((a) => a.def !== undefined)
      // 特別な経路の技（learn.at を持たない K-03 の技）は一覧の後ろに並べる
      .sort(
        (a, b) =>
          a.def!.skill.localeCompare(b.def!.skill) ||
          (a.def!.learn.at ?? Infinity) - (b.def!.learn.at ?? Infinity),
      )
  );
}

/**
 * 技能の使い方の傾き（§7.1）：技能ごとのタグ集計から tag のシェアを引く。
 * 母数はその技能に記録されたタグ付き使用の「使用回数」（タグの総数ではない）
 */
export function styleShare(
  skillTags: Record<string, Record<string, number>> | undefined,
  skill: string,
  tag: string,
): number {
  const tags = skillTags?.[skill];
  if (tags === undefined) return 0;
  const total = tags["use.total"] ?? 0;
  if (total <= 0) return 0;
  return (tags[tag] ?? 0) / total;
}

/**
 * 習得判定（§7.1）。技能値が learn.at に届き、傾き条件（あれば）を満たす
 * 未習得の技をすべて返す。state は変えずに学んだ技のIDだけを返す
 * （覚える順番は learn.at の昇順＋傾き条件の有無で決まる）。
 * learn.at を持たない技（K-03 の進化・合成・ユニーク）は技能値では覚えない
 * —— 特別な経路だけが player.arts に刻むので、ここでは除く
 */
export function checkArtsLearn(
  state: GameState,
  cfg: ArtsConfig,
): { state: GameState; learned: string[] } {
  const learned: string[] = [];
  const arts = { ...state.player.arts };
  for (const def of Object.values(cfg.defs)) {
    if (arts[def.id] !== undefined) continue;
    if (def.learn.at === undefined) continue;
    const skill = state.player.skills[def.skill];
    if ((skill?.value ?? 0) < def.learn.at) continue;
    if (def.learn.tag !== undefined) {
      const share = styleShare(state.player.skillTags, def.skill, def.learn.tag);
      if (share < (def.learn.share ?? cfg.styleShareMin)) continue;
    }
    // M-01：知識フラグ（魔導書・秘伝・見取り）と反復条件（使い続け）を満たすこと
    if (def.learn.flag !== undefined && state.flags[def.learn.flag] !== true) continue;
    if (
      def.learn.counter !== undefined &&
      (state.counters[def.learn.counter.key] ?? 0) < def.learn.counter.gte
    )
      continue;
    arts[def.id] = { lv: 1, exp: 0, pending: 0 };
    learned.push(def.id);
  }
  if (learned.length === 0) return { state, learned };
  return {
    state: { ...state, player: { ...state.player, arts } },
    learned,
  };
}

/**
 * 技の使用記録を集計に足す（§7.1）。回数の集計だけ —— 生の履歴は残さない。
 * uses は戦闘が返した使用記録（arts は技ID、basics は武器技能側の使用）。
 * 技能の傾き（skillTags）と技ごとの記録（artTags）の両方に積む。
 * 返り値は新しい artTags/skillTags（不変更新用）
 */
export function recordArtUse(
  artTags: Record<string, Record<string, number>>,
  skillTags: Record<string, Record<string, number>>,
  uses: readonly { id?: string; skill: string; tags: string[] }[],
): {
  artTags: Record<string, Record<string, number>>;
  skillTags: Record<string, Record<string, number>>;
} {
  if (uses.length === 0) return { artTags, skillTags };
  const at: Record<string, Record<string, number>> = { ...artTags };
  const st: Record<string, Record<string, number>> = { ...skillTags };
  for (const u of uses) {
    const skillRec = { ...(st[u.skill] ?? {}) };
    // 使用1回ごとの母数（シェアの分母）を use.total で数える
    skillRec["use.total"] = (skillRec["use.total"] ?? 0) + 1;
    for (const tag of u.tags) skillRec[tag] = (skillRec[tag] ?? 0) + 1;
    st[u.skill] = skillRec;
    if (u.id !== undefined) {
      const artRec = { ...(at[u.id] ?? {}) };
      artRec["use.total"] = (artRec["use.total"] ?? 0) + 1;
      for (const tag of u.tags) artRec[tag] = (artRec[tag] ?? 0) + 1;
      at[u.id] = artRec;
    }
  }
  return { artTags: at, skillTags: st };
}

/**
 * 使用回数から技に入る経験（09 §1「相手の格で上がる」）。
 * 敵の challenge が武器技能を上回るほど多く入る
 */
export function artExpGain(challenge: number, weaponSkill: number, cfg: ArtsConfig): number {
  const edge = Math.max(0, challenge - weaponSkill);
  return round1(cfg.expBase * (1 + edge * cfg.expChallengeFactor));
}

/** 睡眠の定着：pending → exp、レベル上がりを返す（起床ログに載せる） */
export function consolidateArts(
  state: GameState,
  cfg: ArtsConfig,
): { state: GameState; levelUps: { id: string; from: number; to: number }[] } {
  const levelUps: { id: string; from: number; to: number }[] = [];
  const arts: Record<string, ArtState> = {};
  let changed = false;
  for (const [id, a] of Object.entries(state.player.arts)) {
    if (a.pending <= 0) {
      arts[id] = a;
      continue;
    }
    const exp = a.exp + a.pending;
    const lv = artLevelFor(exp, cfg);
    if (lv > a.lv) levelUps.push({ id, from: a.lv, to: lv });
    arts[id] = { lv, exp, pending: 0 };
    changed = true;
  }
  if (!changed) return { state, levelUps };
  return {
    state: { ...state, player: { ...state.player, arts } },
    levelUps,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
