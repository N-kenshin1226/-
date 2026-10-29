import type { ArtState, BodyPart, BuildState } from "../arts/index.js";
import type { RolledWind } from "../growth/tailwind.js";
import type { RngState } from "../rng/index.js";
import type { GameTime } from "../time/index.js";

/**
 * GameState — ゲームの全状態を表す、シリアライズ可能なプレーンオブジェクト
 * （docs/04_tech_and_devin.md §2 原則1）。クラス・関数・Date は入れない。
 */

/** スキルID。実体は packages/content/skills.json（zod で検証） */
export type SkillId = string;

/** 基礎能力（docs/02_growth_system.md §5）：筋力・持久・敏捷・器用・知覚・精神 */
export type StatId = "strength" | "endurance" | "agility" | "dexterity" | "perception" | "spirit";

/** 基礎能力の全ID（newGame・移行で列挙に使う） */
export const STAT_IDS: readonly StatId[] = [
  "strength",
  "endurance",
  "agility",
  "dexterity",
  "perception",
  "spirit",
];

/**
 * 運命の傾向（docs/06 §3C、T-45）。周の開始時に3択で選ぶ世界の修飾。
 * "calm" は中立（従来どおり）。係数は balance.json の tendency 節
 */
export type TendencyId = "calm" | "war" | "famine";

/** 傾向の全ID（選択肢の列挙・既定値の解決に使う） */
export const TENDENCY_IDS: readonly TendencyId[] = ["calm", "war", "famine"];

export interface SkillState {
  /** 現在値 0.0〜100.0（錆は将来表示側で扱う） */
  value: number;
  /** 最高到達値（錆の下限・再習得加速の基準） */
  peak: number;
  /** 未定着経験。睡眠で value に定着する */
  pending: number;
  /** 素質（学習効率 %。上達で下がり、休養・師匠・書物で回復） */
  potential: number;
  /** 素質の回復上限（= 初期値。出自由来で 80〜130、v10〜） */
  potentialCap: number;
  /** 最後に使った日（錆の判定用） */
  lastUsedDay: number;
}

export interface PlayerState {
  name: string;
  /** 出自（origins.json の id。素質の初期値に幅を持たせる。v10〜） */
  origin: string;
  skills: Record<SkillId, SkillState>;
  stats: Record<StatId, number>;
  /** 基礎能力への負荷。睡眠時に stats へ定着する（超回復） */
  load: Record<StatId, number>;
  /** 0〜100 の1本だけ */
  fatigue: number;
  /** オーバーワーク（02 §5：過負荷が連続すると発生。休養日で解除） */
  overwork: { streakDays: number; active: boolean };
  /** 所持金。仕事の報酬が入り、宿代などに使う（03 §3） */
  money: number;
  /**
   * 所持している武器のID（weapons.json の id、K-01、v17〜）。
   * 素手 "fist" は常に所持している
   */
  weapons: string[];
  /** 装備中の武器のID（戦闘の技能・威力・間隔がこれで変わる。v17〜） */
  weapon: string;
  /* ── K-02（v18〜）：武技・気力/魔力・構成 ── */
  /**
   * 気力（docs/09 §2）。武技のコストに使い、睡眠で全回復、
   * 戦闘中は経過 tick ごとに少し戻る。上限は stats から導出（kiMaxOf）
   */
  ki: number;
  /** 魔力（docs/09 §2）。M-01 の魔法で使う枠。睡眠で全回復 */
  mana: number;
  /**
   * 習得済みの武技・パッシブ（arts.json の id → 状態）。
   * exp は定着済み経験、pending は睡眠で定着する分（Lv1〜10、09 §1）
   */
  arts: Record<string, ArtState>;
  /**
   * 技ごとの使用記録（09 §7.1）：artId → 使用タグ → 回数。
   * 回数の集計だけを持ち、生の履歴は残さない（進化・合成 K-03 の土台）
   */
  artTags: Record<string, Record<string, number>>;
  /**
   * 技能の使い方の傾き（09 §7.1）：skillId → 使用タグ → 回数。
   * 覚える技の順番・種類がこの傾きで変わる
   */
  skillTags: Record<string, Record<string, number>>;
  /**
   * 構成（09 §6）：戦闘技スロット8・パッシブ4・持ち替え武器2。
   * 街で組み替える（setBuild コマンド。行動は消費しない）
   */
  build: BuildState;
}

/** 行動の記録（新規性・追い風の偏り判定などに使う直近N件） */
export interface ActionLogEntry {
  day: number;
  /** 行動種別（train / wait / …。コマンド側で決める） */
  kind: string;
  /** 同じ行動種別内での対象（スキルID、敵ID など。省略可） */
  target?: string;
  /**
   * 新規性の「同じ反復」の細粒度キー（省略可）。
   * train では難度を入れる：同じスキルでも、上達して難度が上がれば
   * 「同じ反復」ではない（02 §2 の N 項。同じ訓練メニューの連発だけが減衰）
   */
  variant?: string;
}

/**
 * 作品・偉業の記録（docs/03 §3 作品台帳）。
 * 成長（ティア更新）・称号・新聞・年代記・転生の遺物はすべてこの帳簿を読む
 */
export interface Work {
  id: string;
  /** 仕事の系統（スキルIDに対応: smithing / mining / …） */
  kind: string;
  /** 作った人（プレイヤー名） */
  maker: string;
  /** 品質 0〜100 */
  quality: number;
  /** 自己ベストの段階（記録時点で決まる） */
  tier: number;
  /** 注文ID（特別な注文への対応作なら） */
  order?: string;
  /** 特記フラグ（会心・世界初・珍品・呪い など） */
  flags: string[];
  /** 作られた日 */
  day: number;
  /** この世界のシード */
  worldSeed: string;
  /** 記録時点の相場評価（同種の反復で下がる） */
  marketValue: number;
}

/** 今日だけ有効なもの（追い風・気配など）。睡眠時に更新される */
export interface TodayState {
  winds: RolledWind[];
  /** 今日溜まった身体への負荷の合計（過負荷の判定用） */
  loads: number;
}

// ---- 世界の危機（docs/08_world_crisis.md §3〜4、W-01） ----
// 世界を主人公に背負わせない：危機の進行・決着は世界の勢力の備えで決まり、
// 主人公の寄与は hero にだけ積もる（W-02 の接点から加算される）

/** 備えの5分野（docs/08 §4）：力・技・縁・財・知 */
export type CrisisFieldId = "might" | "craft" | "bond" | "wealth" | "knowledge";

/** 備えの5分野の全ID（列挙・初期化に使う） */
export const CRISIS_FIELD_IDS: readonly CrisisFieldId[] = [
  "might",
  "craft",
  "bond",
  "wealth",
  "knowledge",
];

/** 勢力ごとの備え状態（得意分野と速さは世界シードからの抽選で決まる） */
export interface CrisisFactionState {
  /** 危機の型の factions の id */
  id: string;
  /** 抽選で決まった得意分野 */
  strongFields: CrisisFieldId[];
  /** 抽選で決まった1季節あたりの備え速度 */
  speed: number;
  /** 分野ごとの蓄積した備え */
  prep: Record<CrisisFieldId, number>;
}

/** 決着の場面の状態（時期は筋書き＋シード由来のずれで決まる） */
export interface CrisisFinaleState {
  /** 危機の型の finales の id */
  id: string;
  /** 判定する季節の変わり目の番号（危機開始から数える。jitter 適用済み） */
  atBoundary: number;
  /** 判定済みか */
  resolved: boolean;
  /** 判定の結果（resolved のときだけ入る） */
  success?: boolean;
  /** 判定時点の備え合計（世界の勢力の備え＋主人公の寄与） */
  total?: number;
}

/** 世界の出来事の記録（街の記録・年代記タブに出すための簡潔なログ） */
export interface CrisisLogEntry {
  /** 起きた日 */
  day: number;
  /**
   * 種別：draw（抽選）/ stage（段階が進んだ）/ finale.win・finale.loss（決着の場面）/
   * npc.leave・npc.die（NPCの離散・死亡）/ end.resolved・end.ruin（終幕）/
   * finale.hero・finale.heroFail（主人公が率いた決着。W-03）/
   * rival.hero（英雄として記録されたライバル。ref は "rival.<index>"）
   */
  kind: string;
  /** 参照ID（段階・決着の場面・NPCの id） */
  ref?: string;
}

/**
 * 世界の危機の状態（docs/08 §3〜4、W-01）。
 * 型と変数は世界シードから決定論的に決まる。季節の変わり目に段階が進み、
 * 決着の場面を経て outcome が resolved / ruin になる
 */
export interface CrisisState {
  /** 危機の型のID（crises/*.json の id） */
  typeId: string;
  /** 現在の段階（型の stages のインデックス） */
  stageIndex: number;
  /** 現在の段階で経過した季節数 */
  seasonsInStage: number;
  /** 危機開始から数えた季節の変わり目の回数（決着の場面の時期の基準） */
  boundaries: number;
  /** 勢力ごとの備え状態 */
  factions: CrisisFactionState[];
  /** 主人公が寄与した備え（W-02 の接点から addHeroContribution で加算される） */
  hero: Record<CrisisFieldId, number>;
  /** 決着の場面（筋書きの時期順） */
  finales: CrisisFinaleState[];
  /** シードで決まった変数（場所・人物などの語り用） */
  variables: Record<string, string>;
  /** 離散・死亡したNPC（段階の影響で記録される。元に戻らない） */
  npcGone: { id: string; kind: "leave" | "die"; day: number }[];
  /** 出来事の記録（表示は新聞・噂・年代記が担う。ここはその素材） */
  log: CrisisLogEntry[];
  /** 結末：進行中／解決／滅び */
  outcome: "ongoing" | "resolved" | "ruin";
}

/**
 * 日々の営みの状態（P-02「行動の種類を増やす」。v18〜）。
 * 持ち物・人との仲・その日の食事と祈り・旅の途中経過を持つ。
 * 日付と一緒に持つ欄は「その日だけ効くもの」を日またぎのリセットなしで表す
 */
export interface LifeState {
  /** 今いる町（life.json towns の id / 生成世界では t0〜。旅の到着で変わる） */
  town: string;
  /** 持ち物（items.json の id → 個数） */
  items: Record<string, number>;
  /** 人との仲の値（voices.json の npc id / 生成世界では npc.<町>.<役割> → 0〜100） */
  bonds: Record<string, number>;
  /**
   * 町ごとの評判（G-01、docs/10 §4「ある町では有名、別の町では無名」。v20〜）。
   * 町 id → 値。掲示板の依頼・仕事・寄付でその町の評判が積み上がり、
   * 市場の相場に少し効く。立場（society.standing）は世界全体の肩書で、
   * 評判は町ごとの顔の売れ具合 —— 別の軸として持つ
   */
  rep: Record<string, number>;
  /** 食べた日とその食事の質（0〜100。その日の眠りにだけ効く） */
  mealDay: number;
  mealQuality: number;
  /** 祈った日（その日の眠りが少し深くなる） */
  prayedDay: number;
  /**
   * 旅の途中：行き先の町 id と残りの野営数。null なら町にいる。
   * G-02（v22〜）では出発町・通い方（JourneyWay）・道の id（journeyIdOf）も
   * 持つ —— 道中の出来事・遭遇・地図の印がこれらを読む。旧欄だけの旅
   * （v21 以前のセーブ）もそのまま動く（道の刻印は省かれるだけ）
   */
  journey: {
    to: string;
    daysLeft: number;
    /** 出発した町（G-02。地図の行程表示・旧道の解決に使う） */
    from?: string;
    /** 通い方（foot/caravan/horse/ship。省略時は徒歩） */
    way?: string;
    /** 旅している道の id（journeyIdOf。道中の遭遇に使う） */
    road?: string;
  } | null;
  /**
   * 地方の地図の霧（G-02、docs/10 §7「行ったことのない場所は霧」。v22〜）。
   * visited は実際に訪れた町・地域、heard は噂・新聞・地図で名を知った
   * 場所 —— 地図に名が出る「知っている場所」はこれらと、訪れた町から
   * 道で繋がる町・訪れた町の地域を畳み合わせたもの（mapKnownSet）
   */
  map: {
    /** 訪れた町・地域の id */
    visited: string[];
    /** 聞き覚えた町・地域の id */
    heard: string[];
  };
}

/**
 * 世界の地図の出所（G-01、docs/10_world_generation.md。v20〜）。
 * 生成される地方そのものは state に持たず seed から導出する ——
 * ここには「どちらの地図で遊んでいるか」の刻印だけを置く
 */
export interface WorldState {
  /**
   * "legacy"=固定マップ（places.json のアルディ・ベルンの世界。旧セーブと
   *   e2e・シミュレーションの互換経路）
   * "gen"=世界シードから生成した地方（町6〜9・地域15〜25・道のグラフ）
   */
  kind: "legacy" | "gen";
  /**
   * 生成レシピの版（core/world の WORLD_RECIPE）。同じ版なら同じ seed から
   * 同じ地方が出る。生成器の形が変わったとき版を上げ、古い版の世界は
   * 旧版の生成器で引き直す（legacy は 0 固定）
   */
  recipe: number;
}

export interface GameState {
  /** セーブスキーマのバージョン（save/ の SAVE_VERSION と一致させる） */
  version: number;
  seed: string;
  rng: RngState;
  time: GameTime;
  player: PlayerState;
  /** 条件DSL用のカウント（例: "kill.species.wolf" → 100） */
  counters: Record<string, number>;
  /** 条件DSL用のフラグ */
  flags: Record<string, boolean>;
  /** 直近の行動ログ（古い順。上限は balance.json の state.actionLogMax） */
  actionLog: ActionLogEntry[];
  today: TodayState;
  /** 獲得済みの称号ID（titles.json の id） */
  titles: string[];
  /** 作品台帳（03 §3）。古い順 */
  ledger: Work[];
  /** 通知予算（03 §6）。日付が変わるとリセット */
  notify: {
    day: number;
    /** 今日すでにS通知を出したか */
    sToday: boolean;
    /** 今日すでに「気配」を出した称号ID */
    kehai: string[];
  };
  /** 立場×職業と人生目標（03 §1）。立場は何ができるか、職業は何をするか — 独立した2軸 */
  society: {
    /** 立場ID（standings.json。初期は最下位） */
    standing: string;
    /** 認定された職業ID（professions.json）。未認定は null */
    profession: string | null;
    /** 打診中のオファーID（立場・職業どちらもここに溜まる） */
    pendingOffers: string[];
    /** 宣言した人生目標ID（lifeGoals.json） */
    goal: string | null;
    /** 達成済みの人生目標ID */
    achievedGoals: string[];
  };
  /** 見聞録（07 §3）。読んだアトムと分かった事実・発掘済みのつながり */
  lore: {
    /** 読んだアトムID */
    read: string[];
    /** 判明した事実ID（canon.facts） */
    facts: string[];
    /** 報酬を発掘済みの出来事ID（canon.events の reward 済み） */
    connections: string[];
  };
  /** 書物（02 §8、T-26）。買って所持し、読むと効果が付く（v11〜） */
  books: {
    /** 所持している書物ID（books.json の id） */
    owned: string[];
    /** 読了済みの書物。day は読んだ日（期間効果の起算日） */
    read: { id: string; day: number }[];
  };
  /**
   * 師匠（02 §8、T-27）。弟子入り中の師匠は1人だけ。
   * 効果（effect 語彙）は弟子期間中ずっと有効で、稽古ごとに素質が回復する（v12〜）
   */
  mentor: {
    /** mentors.json の id */
    id: string;
    /** 弟子入りした日（期間の表示用） */
    sinceDay: number;
  } | null;
  /**
   * 前世からの継承（T-39、docs/06 §2）。転生した周だけ設定される（v13〜）。
   * 素質補正は newGame 時点で potentialCap に焼き込まれるのでここには残さない
   */
  legacy: {
    /** 「前世の記憶」として保持した称号ID（titles にも入っている） */
    rememberedTitles: string[];
    /** 遺物：前世の台帳から選んだ名品（この世界に現れている） */
    artifact: { name: string; kind: string; quality: number; tier: number } | null;
  } | null;
  /**
   * 運命の傾向（T-45、06 §3C）。周の開始時に選ぶ1軸の世界修飾（v14〜）。
   * 未選択・既定は "calm"（従来どおり）
   */
  tendency: TendencyId;
  /**
   * 誓約（T-46、06 §3C）。開始時に自分で積む難度修飾子（vows.json の id、v15〜）。
   * 選んだ誓約は flags["vow.taken.<id>"] にも刻まれ、条件DSLから読める
   */
  vows: string[];
  /**
   * 世界の危機（docs/08、W-01。v16〜）。型・勢力の得意分野と速さ・決着の
   * 場面の時期・変数はすべて世界シードから決定論的に決まる。
   * null は「未抽選」（v15 以前のセーブ → 次の季節の変わり目に抽選される）
   */
  crisis: CrisisState | null;
  /**
   * 日々の営み（P-02「行動の種類を増やす」。v18〜）。
   * 持ち物・仲・食事・祈り・旅 —— 散策・採集・料理・賭け・市場・掲示板・
   * 寄付が読み書きする欄
   */
  life: LifeState;
  /**
   * ユニークスキルの世界の記録（K-03、09 §7。v20〜）：
   * その世界で一人だけ持てる技（hidden）。技ID → 持ち主と獲得日。
   * 持ち主は "player" か "rival.<index>"（ライバルの抽選順）。
   * 一度取られた技は二度と手に入らない —— 取った事実は新聞と
   * 世界の記録に載る（世界初の仕組み）
   */
  uniques: Record<string, { holder: string; day: number }>;
  /**
   * 世界の地図（G-01、docs/10。v21〜）。旧セーブは固定マップの "legacy"。
   * 生成される町・地域・道は core/world が seed から決定論的に導く
   */
  world: WorldState;
  /**
   * 怪我（docs/03 §4「部位へのダメージは怪我として数日残る」。v23〜）。
   * 戦闘で重い一撃を受けた部位に残る傷 —— untilDay の朝に癒える。
   * 部位ごとの効き（腕＝威力・脚＝敏捷・胴＝耐久・頭＝観察）は
   * balance.combat.injuries が決める
   */
  injuries: { part: BodyPart; untilDay: number }[];
}
