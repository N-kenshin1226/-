import { createRng } from "../rng/index.js";
import { kiMaxOf, manaMaxOf, type ArtsConfig } from "../arts/index.js";
import { drawCrisis, type CrisisConfig } from "../crisis/index.js";
import {
  STAT_IDS,
  type CrisisState,
  type GameState,
  type PlayerState,
  type SkillState,
  type TendencyId,
  type WorldState,
} from "./types.js";
import { SAVE_VERSION } from "../save/index.js";
import type { Legacy } from "../legacy/index.js";

/** balance.json から必要な初期値だけを受け取る */
export interface NewGameConfig {
  /** content/skills.json のスキルID一覧 */
  skillIds: readonly string[];
  /** スキルの初期素質（出自を省略した場合の一律値） */
  initialPotential: number;
  /** 出自（origins.json）。指定するとスキルごとに potentialBase±ばらつき+affinity で 80〜130 に散らす */
  origin?: {
    id: string;
    potentialBase: number;
    affinity: Record<string, number>;
    /**
     * 出自由来の初期スキル値（F-01）。min〜max（整数）の範囲をシード由来の
     * 乱数で引き、value・peak に入れる（鍛冶屋の子は鍛冶 8〜12 から始まる、など）
     */
    initialSkills?: Record<string, { min: number; max: number }>;
  };
  /** 出自のばらつき範囲（balance.player.potentialInitMin/Max。origin 指定時に必要） */
  potentialInitMin?: number;
  potentialInitMax?: number;
  /** 基礎能力の初期値 */
  initialStatValue: number;
  /** 初期の立場（省略時は流れ者） */
  initialStanding?: string;
  /** 初期所持金 */
  initialMoney?: number;
  /**
   * 前世からの継承（T-39、06 §2）。転生した周にだけ渡す。
   * potentialBonus は各スキルの素質と上限を底上げし、
   * rememberedTitles は「前世の記憶」として称号を保持、
   * artifact はこの世界に名品として現れる
   */
  legacy?: Legacy;
  /**
   * 運命の傾向（T-45、06 §3C）。周の開始時に3択で選ぶ世界の修飾。
   * 省略時は "calm"（従来どおり）
   */
  tendency?: TendencyId;
  /**
   * 誓約（T-46、06 §3C）。開始時に自分で積む難度修飾子（vows.json の id）。
   * 選んだ誓約は state.vows に記録され、flags["vow.taken.<id>"] にも刻まれる
   * （誓約称号の条件が flags/counters から読めるようにするため）
   */
  vows?: readonly string[];
  /**
   * 世界の危機の設定（docs/08、W-01）。指定すると世界生成時に seed から
   * 決定論的に危機を抽選する。省略時は危機なし（crisis: null）
   */
  crisis?: CrisisConfig;
  /**
   * 同じ世界の次代に引き継ぐ危機の状態（succeedLife が渡す。W-01）。
   * 危機は生ではなく世界のものなので、次代では進行をリセットせず
   * 前代の状態をそのまま継ぐ。undefined のときだけ新規抽選する
   */
  carryoverCrisis?: CrisisState | null;
  /**
   * 同じ世界の次代に引き継ぐユニークスキルの記録（succeedLife が渡す。
   * K-03、09 §7）。ユニークは生ではなく世界のもの —— その世界に
   * 一人だけの持ち主なので、次代でも前代の記録をそのまま継ぐ
   */
  carryoverUniques?: GameState["uniques"];
  /**
   * 周の開始時に立てる任意フラグ（X-5、06 §2）。
   * 失われた書物の "lostbook.<skillId>" など、前世由来で次の世界に残る刻印。
   * GameState の形は変えず flags だけで表現する
   */
  flags?: readonly string[];
  /**
   * 初期の所持武器ID（weapons.json の id、K-01、v17〜）。
   * 省略時は素手と剣を持っているものとして始める
   */
  initialWeapons?: readonly string[];
  /** 初期装備の武器ID（省略時は剣。initialWeapons に含まれること） */
  initialWeapon?: string;
  /**
   * 基点の町（P-02、life.json towns の id。v18〜）。
   * 省略時は "ardi"（最初の町。転生・引き継ぎの呼び出し側が別の町を渡せる。
   * 生成世界では呼び出し側が生成結果の始まりの町 id を渡す）
   */
  initialTown?: string;
  /**
   * 世界の地図の出所（G-01、docs/10。v20〜）。
   * "gen" を渡すとこの周はシードから生成した地方で遊ぶ（町・地域・道は
   * core/world の generateWorld が seed から導く —— 呼び出し側は生成結果の
   * 始まりの町を initialTown にも渡すこと）。
   * 省略時は "legacy"（places.json の固定マップ。旧来どおりの世界）
   */
  world?: WorldState;
  /**
   * 武技・資源（K-02、balance.arts）。指定すると気力・魔力を上限いっぱいで
   * 始める（新しい旅立ちの朝は整っている）。省略時は 0 から（従来どおり）
   */
  arts?: ArtsConfig;
}

export function newGame(seed: string, name: string, cfg: NewGameConfig): GameState {
  const skills: PlayerState["skills"] = {};
  const oRng = cfg.origin ? createRng(seed).fork(`origin:${cfg.origin.id}`) : null;
  for (const id of cfg.skillIds) {
    let potential = cfg.initialPotential;
    if (cfg.origin && oRng) {
      const lo = cfg.potentialInitMin ?? 80;
      const hi = cfg.potentialInitMax ?? 130;
      // 出自の基準値に -15〜+15 の個人差を足し、得意分野の affinity を上乗せする
      const scatter = oRng.int(-15, 15);
      potential = Math.min(
        hi,
        Math.max(
          lo,
          Math.round(cfg.origin.potentialBase + scatter + (cfg.origin.affinity[id] ?? 0)),
        ),
      );
    }
    // 前世の頂きが素質を少し底上げする（上限は legacyOf 側で適用済み）
    potential += cfg.legacy?.potentialBonus[id] ?? 0;
    // 出自由来の初期値（F-01）：身についていた技能は最初の朝から目に見える。
    // 素質のばらつきと同じ乱数源（seed+出自）で決定論的に引く
    const ini = cfg.origin?.initialSkills?.[id];
    const initial = ini !== undefined && oRng ? oRng.int(ini.min, ini.max) : 0;
    const s: SkillState = {
      value: initial,
      peak: initial,
      pending: 0,
      potential,
      potentialCap: potential,
      lastUsedDay: 0,
    };
    skills[id] = s;
  }
  const stats = Object.fromEntries(
    STAT_IDS.map((id) => [id, cfg.initialStatValue]),
  ) as PlayerState["stats"];
  const load = Object.fromEntries(STAT_IDS.map((id) => [id, 0])) as PlayerState["load"];

  return {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed).state(),
    time: { day: 0, action: 0 },
    player: {
      name,
      origin: cfg.origin?.id ?? "",
      skills,
      stats,
      load,
      fatigue: 0,
      overwork: { streakDays: 0, active: false },
      money: cfg.initialMoney ?? 0,
      // 武器（K-01）：省略時は素手と剣を携えて始める
      weapons: [...new Set(cfg.initialWeapons ?? ["fist", "sword"])],
      weapon: cfg.initialWeapon ?? "sword",
      // 武技・資源・構成（K-02、v18〜）：気力・魔力は上限いっぱいで旅立つ
      // （balance.arts が渡された世界のみ。以降は眠るごとに満たされる）。
      // 最初は技を覚えていないので構成は武器2本だけが埋まっている
      ki: cfg.arts === undefined ? 0 : kiMaxOf(stats, cfg.arts),
      mana: cfg.arts === undefined ? 0 : manaMaxOf(stats, cfg.arts),
      arts: {},
      artTags: {},
      skillTags: {},
      build: {
        slots: [null, null, null, null, null, null, null, null],
        passives: [null, null, null, null],
        weapons: [
          cfg.initialWeapon ?? "sword",
          [...new Set(cfg.initialWeapons ?? ["fist", "sword"])].find(
            (w) => w !== (cfg.initialWeapon ?? "sword"),
          ) ?? null,
        ],
      },
    },
    counters: {},
    flags: Object.fromEntries([
      // 「前世の記憶」の称号フラグ（T-39）
      ...(cfg.legacy?.rememberedTitles ?? []).map((id) => [`memory.title.${id}`, true] as const),
      // 積んだ誓約のフラグ（T-46。誓約称号の条件DSLが読む）
      ...(cfg.vows ?? []).map((id) => [`vow.taken.${id}`, true] as const),
      // 前世由来の刻印など任意の開始フラグ（X-5。失われた書物の棚条件が読む）
      ...(cfg.flags ?? []).map((f) => [f, true] as const),
    ]),
    actionLog: [],
    today: { winds: [], loads: 0 },
    titles: [...(cfg.legacy?.rememberedTitles ?? [])],
    ledger: [],
    notify: { day: 0, sToday: false, kehai: [] },
    society: {
      standing: cfg.initialStanding ?? "drifter",
      profession: null,
      pendingOffers: [],
      goal: null,
      achievedGoals: [],
    },
    lore: { read: [], facts: [], connections: [] },
    books: { owned: [], read: [] },
    mentor: null,
    legacy: cfg.legacy
      ? {
          rememberedTitles: [...cfg.legacy.rememberedTitles],
          artifact: cfg.legacy.artifact ? { ...cfg.legacy.artifact } : null,
        }
      : null,
    // 運命の傾向（T-45。未選択は中立の "calm"）と誓約（T-46）
    tendency: cfg.tendency ?? "calm",
    vows: [...new Set(cfg.vows ?? [])],
    // 世界の危機（W-01）：引き継ぎがあればそのまま、なければ世界シードから抽選
    crisis: cfg.carryoverCrisis ?? (cfg.crisis ? drawCrisis(seed, cfg.crisis) : null),
    // 日々の営み（P-02、v18〜）：基点の町にいて空荷で始まる
    life: {
      town: cfg.initialTown ?? "ardi",
      items: {},
      bonds: {},
      // 同行者（X-37、v24〜）：まだ一人旅
      companion: null,
      // 町ごとの評判（G-01、v21〜）：まだどこにも名が通っていない
      rep: {},
      mealDay: -1,
      mealQuality: 0,
      prayedDay: -1,
      journey: null,
      // 地方の地図の霧（G-02、v22〜）：いる町だけは訪れた刻印が立っている
      // —— 名を知るのはそこと、道で繋がる隣町、町の外の地域から始まる
      map: { visited: [cfg.initialTown ?? "ardi"], heard: [cfg.initialTown ?? "ardi"] },
    },
    // ユニークスキル（K-03、v20〜）：引き継ぎがあればそのまま（同じ世界の
    // 前代で取られた技は次代でも誰の手にも届かない）、なければ誰の手にも
    // 渡っていない新しい世界
    uniques: cfg.carryoverUniques !== undefined ? { ...cfg.carryoverUniques } : {},
    // 世界の地図（G-01、v21〜）：省略時は固定マップのまま（旧来どおり）
    world: cfg.world ?? { kind: "legacy", recipe: 0 },
    // 怪我（X-32、v23〜）：新しい人生は無傷で始まる
    injuries: [],
  };
}

/**
 * 転生先の世界シード（06 §1「新しいシードの世界へ」。T-40）。
 * 環境変数や実時間乱数ではなく、終わった人生の状態から決定論的に導く：
 * 同じ終わり方（同じ state）からは同じ次の世界が生まれ、生きた日数を混ぜるので
 * 同じ親シードでも別の日に終われば別の世界に分かれる
 */
export function nextWorldSeed(state: GameState): string {
  return `${state.seed}:next:${state.time.day}`;
}
