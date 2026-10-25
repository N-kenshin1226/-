import type { GameState } from "../state/types.js";

/**
 * セーブのシリアライズとバージョン移行（docs/04 §2 原則5）。
 * GameState の形を変えたら SAVE_VERSION を上げ、migrations に変換関数を足す
 * （AGENTS.md 絶対ルール）。年代記は別領域・別バージョン（chronicle/、M3）。
 */

export const SAVE_VERSION = 4;

/** migrations[n] はバージョン n のデータを n+1 へ変換する */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> =
  {
    /** 0 → 1: 初期スキーマ導入前のダミー。欠けているフィールドを既定値で埋める */
    0: (old) => ({
      version: 1,
      seed: typeof old.seed === "string" ? old.seed : "trace",
      rng: old.rng,
      time: { day: 0, action: 0 },
      player: old.player,
      counters: {},
      flags: {},
      actionLog: [],
    }),
    /** 1 → 2: today（追い風の保持）を追加 */
    1: (old) => ({ ...old, version: 2, today: { winds: [] } }),
    /** 2 → 3: 基礎能力の負荷プール・オーバーワーク・今日の負荷合計を追加 */
    2: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      const today = (old.today ?? {}) as Record<string, unknown>;
      return {
        ...old,
        version: 3,
        player: {
          ...p,
          load: {
            strength: 0,
            endurance: 0,
            agility: 0,
            dexterity: 0,
            perception: 0,
            spirit: 0,
          },
          overwork: { streakDays: 0, active: false },
        },
        today: { ...today, loads: 0 },
      };
    },
    /** 3 → 4: 獲得済み称号の一覧を追加 */
    3: (old) => ({ ...old, version: 4, titles: [] }),
  };

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): GameState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("deserialize: オブジェクトではないデータ");
  }
  const rawVersion = parsed.version;
  if (typeof rawVersion !== "number") {
    throw new Error("deserialize: version がありません");
  }
  let version = rawVersion;
  if (version > SAVE_VERSION) {
    throw new Error(`deserialize: 未知のバージョン ${version}（対応は ${SAVE_VERSION} まで）`);
  }
  let data = parsed;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`deserialize: バージョン ${version} の移行関数がありません`);
    data = migrate(data);
    version = data.version as number;
  }
  assertShape(data);
  return data as unknown as GameState;
}

/** 最低限の形チェック（厳密な内容検証は行わない） */
function assertShape(data: Record<string, unknown>): void {
  const required = [
    "seed",
    "rng",
    "time",
    "player",
    "counters",
    "flags",
    "actionLog",
    "today",
    "titles",
  ];
  for (const key of required) {
    if (!(key in data)) throw new Error(`deserialize: ${key} がありません`);
  }
}
