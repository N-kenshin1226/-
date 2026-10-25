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

export interface SkillState {
  /** 現在値 0.0〜100.0（錆は将来表示側で扱う） */
  value: number;
  /** 最高到達値（錆の下限・再習得加速の基準） */
  peak: number;
  /** 未定着経験。睡眠で value に定着する */
  pending: number;
  /** 素質（学習効率 %。上達で下がり、休養・師匠・書物で回復） */
  potential: number;
  /** 最後に使った日（錆の判定用） */
  lastUsedDay: number;
}

export interface PlayerState {
  name: string;
  skills: Record<SkillId, SkillState>;
  stats: Record<StatId, number>;
  /** 0〜100 の1本だけ */
  fatigue: number;
}

/** 行動の記録（新規性・追い風の偏り判定などに使う直近N件） */
export interface ActionLogEntry {
  day: number;
  /** 行動種別（train / wait / …。コマンド側で決める） */
  kind: string;
  /** 同じ行動種別内での対象（スキルID、敵ID など。省略可） */
  target?: string;
}

/** 今日だけ有効なもの（追い風・気配など）。睡眠時に更新される */
export interface TodayState {
  winds: RolledWind[];
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
}
