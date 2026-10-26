import type { GameState } from "../state/types.js";

/**
 * 年代記（docs/06_endgame.md §1・§3C）。
 * 一生の終わり（引退・死亡・老衰）ごとに1頁を足す、周回をまたぐ記録。
 * GameState のセーブとは別領域・別バージョンで保存する（docs/04 §2 原則5）。
 * 伝記の自動生成は T-37、追記を呼ぶ引退・転生フローは T-40 が本格配線する。
 */

/** 年代記スキーマのバージョン（save/ の SAVE_VERSION とは別系統） */
export const CHRONICLE_VERSION = 3;

/** 人生の終わり方 */
export type LifeCause = "death" | "retire" | "oldAge";

/** 代表作の摘要（台帳 Work の抜粋。年代記には作品そのものではなく要約を残す） */
export interface NotableWork {
  /** 仕事の系統（スキルIDに対応） */
  kind: string;
  /** 品質 0〜100 */
  quality: number;
  /** 記録時点の自己ベスト段階 */
  tier: number;
  /** 注文ID（特別な注文への対応作なら） */
  order?: string;
}

/** 年代記の1頁：一周分の人生 */
export interface ChronicleEntry {
  /** 前世の名 */
  name: string;
  /** 二つ名（代表する称号ID。無ければ省略） */
  epithet?: string;
  /** 生きた日数（開始日を1日目として数える） */
  daysLived: number;
  /** 獲得した称号ID（titles.json の id） */
  titles: string[];
  /** 最終的な立場ID */
  standing: string;
  /** 最終的な職業ID（未認定なら null） */
  profession: string | null;
  /** 達成した人生目標ID */
  achievedGoals: string[];
  /** 代表作の摘要（台帳の品質上位から。既定3件） */
  notableWorks: NotableWork[];
  /** 終わり方（引退・死亡・老衰） */
  cause: LifeCause;
  /** 頂点に至ったルートID（T-41。pinnacles.json の id。無ければ省略） */
  pinnacles?: string[];
  /**
   * その人生の代表技能（X-5、06 §2）：最高到達値（peak）の上位。
   * value はその生が辿り着いた高さ（錆びて下がった現在値ではなく peak）。
   * 失われた書物（lostbooks/）がこの記録を読んで次の世界の書店に手記を出す。
   * 技能を持たない生では省略（v3〜）
   */
  peakSkills?: readonly { id: string; value: number }[];
  /** 伝記本文（T-37 の語り層が差し込む。無ければ省略） */
  biography?: string;
  /** この人生を過ごした世界のシード */
  worldSeed: string;
}

/** 年代記全体（周回をまたいで厚くなる。06 §3C） */
export interface Chronicle {
  version: number;
  lives: ChronicleEntry[];
}

/** 空の年代記 */
export function emptyChronicle(): Chronicle {
  return { version: CHRONICLE_VERSION, lives: [] };
}

export interface RecordLifeOptions {
  /** 二つ名にする称号ID。省略時は最上位ランクのうち最後に得たもの */
  epithet?: string;
  /** 称号の定義（rank 判定用。省略時は最後に獲得した称号を二つ名にする） */
  titleDefs?: readonly { id: string; rank: "S" | "A" | "B" }[];
  /** 伝記本文（T-37 の語り層が差し込む。省略可） */
  biography?: string;
  /** 頂点に至ったルートID（T-41。呼び出し側が reachedPinnacles で求める。省略可） */
  pinnacles?: string[];
  /** 代表作の最大件数（既定 3） */
  maxWorks?: number;
  /** 代表技能の最大件数（既定 3。X-5） */
  maxSkills?: number;
}

/** 代表作の既定件数 */
const DEFAULT_MAX_WORKS = 3;
/** 代表技能の既定件数 */
const DEFAULT_MAX_SKILLS = 3;

const RANK_ORDER: Record<"S" | "A" | "B", number> = { S: 0, A: 1, B: 2 };

/** 二つ名を決める：最上位ランク（S>A>B）のうち最後に得た称号 */
function pickEpithet(
  titles: readonly string[],
  titleDefs: readonly { id: string; rank: "S" | "A" | "B" }[] | undefined,
): string | undefined {
  if (titles.length === 0) return undefined;
  if (!titleDefs) return titles[titles.length - 1]!;
  const rankOf = new Map(titleDefs.map((d) => [d.id, d.rank]));
  let best: string | undefined;
  let bestOrder = Number.POSITIVE_INFINITY;
  for (const id of titles) {
    const order = RANK_ORDER[rankOf.get(id) ?? "B"];
    if (order <= bestOrder) {
      bestOrder = order;
      best = id;
    }
  }
  return best;
}

/**
 * GameState → 年代記の1頁。
 * 台帳の代表作・称号・立場/職業・日数を摘む（伝記の素材と同じ出所）。
 */
export function lifeEntryOf(
  state: GameState,
  cause: LifeCause,
  opts?: RecordLifeOptions,
): ChronicleEntry {
  const maxWorks = opts?.maxWorks ?? DEFAULT_MAX_WORKS;
  const notableWorks: NotableWork[] = [...state.ledger]
    .sort((a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day)
    .slice(0, Math.max(0, maxWorks))
    .map((w) => ({
      kind: w.kind,
      quality: w.quality,
      tier: w.tier,
      ...(w.order !== undefined ? { order: w.order } : {}),
    }));
  const epithet = opts?.epithet ?? pickEpithet(state.titles, opts?.titleDefs);
  // 代表技能（X-5）：最高到達値の上位。同値はスキルID順で決定論的に揃える
  const maxSkills = opts?.maxSkills ?? DEFAULT_MAX_SKILLS;
  const peakSkills = Object.entries(state.player.skills)
    .map(([id, s]) => ({ id, value: s.peak }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, maxSkills));
  return {
    name: state.player.name,
    ...(epithet !== undefined ? { epithet } : {}),
    daysLived: state.time.day + 1,
    titles: [...state.titles],
    standing: state.society.standing,
    profession: state.society.profession,
    achievedGoals: [...state.society.achievedGoals],
    notableWorks,
    cause,
    ...(opts?.pinnacles !== undefined && opts.pinnacles.length > 0
      ? { pinnacles: [...opts.pinnacles] }
      : {}),
    ...(peakSkills.length > 0 ? { peakSkills } : {}),
    ...(opts?.biography !== undefined ? { biography: opts.biography } : {}),
    worldSeed: state.seed,
  };
}

/**
 * 年代記に1頁を足す（引退・死亡・老衰で呼ぶ。06 §1）。
 * 純粋関数：chronicle は変更せず、追記済みの新しい年代記を返す。
 */
export function recordLife(
  chronicle: Chronicle,
  state: GameState,
  cause: LifeCause,
  opts?: RecordLifeOptions,
): Chronicle {
  return { ...chronicle, lives: [...chronicle.lives, lifeEntryOf(state, cause, opts)] };
}

/**
 * 同じ一生がすでに刻まれているか（T-40）。世界・終わり方・生きた日数・名の4つが
 * 一致したら同一の生涯とみなす。転生フローで recordLife を呼ぶ前にこの判定を挟むと、
 * 中断・再読み込みで同じ死を再生しても年代記に重複した頁が立たない（冪等）
 */
export function hasLifeRecord(chronicle: Chronicle, state: GameState, cause: LifeCause): boolean {
  return chronicle.lives.some(
    (l) =>
      l.worldSeed === state.seed &&
      l.cause === cause &&
      l.daysLived === state.time.day + 1 &&
      l.name === state.player.name,
  );
}

/** chronicleMigrations[n] はバージョン n のデータを n+1 へ変換する（save/ と同じ仕組み） */
export const chronicleMigrations: Record<
  number,
  (old: Record<string, unknown>) => Record<string, unknown>
> = {
  /** 0 → 1: 初期スキーマ。欠けているフィールドを既定値で埋める */
  0: (old) => ({
    version: 1,
    lives: Array.isArray(old.lives) ? old.lives : [],
  }),
  /** 1 → 2: 頂点ルートの記録（T-41）を追加。追加入力の任意フィールドなので埋めるものはない */
  1: (old) => ({ ...old, version: 2 }),
  /** 2 → 3: 代表技能 peakSkills（X-5）を追加。任意フィールドなので埋めるものはない */
  2: (old) => ({ ...old, version: 3 }),
};

export function serializeChronicle(chronicle: Chronicle): string {
  return JSON.stringify(chronicle);
}

export function deserializeChronicle(raw: string): Chronicle {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("deserializeChronicle: オブジェクトではないデータ");
  }
  const rawVersion = parsed.version;
  if (typeof rawVersion !== "number") {
    throw new Error("deserializeChronicle: version がありません");
  }
  let version = rawVersion;
  if (version > CHRONICLE_VERSION) {
    throw new Error(
      `deserializeChronicle: 未知のバージョン ${version}（対応は ${CHRONICLE_VERSION} まで）`,
    );
  }
  let data = parsed;
  while (version < CHRONICLE_VERSION) {
    const migrate = chronicleMigrations[version];
    if (!migrate)
      throw new Error(`deserializeChronicle: バージョン ${version} の移行関数がありません`);
    data = migrate(data);
    version = data.version as number;
  }
  assertShape(data);
  return data as unknown as Chronicle;
}

/** 最低限の形チェック（厳密な内容検証は行わない） */
function assertShape(data: Record<string, unknown>): void {
  const required = ["version", "lives"];
  for (const key of required) {
    if (!(key in data)) throw new Error(`deserializeChronicle: ${key} がありません`);
  }
  if (!Array.isArray(data.lives)) {
    throw new Error("deserializeChronicle: lives は配列である必要があります");
  }
}
