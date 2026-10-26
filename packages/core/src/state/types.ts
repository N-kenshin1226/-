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
}
