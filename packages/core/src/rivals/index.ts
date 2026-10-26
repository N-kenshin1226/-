import { createRng } from "../rng/index.js";
import type { GameState } from "../state/types.js";

/**
 * ライバル・ランキング（簡易版。docs/05_roadmap.md M4、03 §5「ランキングの数値は乱数」、T-47）。
 *
 * 派生値：ランキングは GameState に持たず、既存の state（台帳・称号・討伐・深層
 * カウンタ・日付・世界シード）からその都度組み立てる。セーブ互換に影響しない。
 *
 * ライバルの素性（名・二つ名・基礎名声・日ごとの伸び）は世界シード由来の
 * 独立した乱数列（`createRng(seed).fork("rivals")`）で決まる。世界を進める
 * 乱数列（state.rng）は一切消費しない。自分の実績点も乱数を使わず実績から算出する。
 *
 * 数値はすべて balance.json の rivals 節（RivalsConfig）、名と二つ名の母集団は
 * content/rivals.json（RivalNamePool）から注入する（core は content に依存しない）。
 */

export interface RivalsConfig {
  /** ランキングに並ぶライバルの人数 */
  size: number;
  /** ライバルの基礎名声の範囲（世界シード由来の乱数で決まる） */
  scoreMin: number;
  scoreMax: number;
  /** ライバル1人あたりの日ごとの名声増分の上限（0〜この値がシードで決まる） */
  growthPerDay: number;
  /** 自分の実績点：台帳の最高品質への重み */
  playerQualityWeight: number;
  /** 自分の実績点：称号1つあたりの重み */
  playerTitleWeight: number;
  /** 自分の実績点：討伐1体あたりの重み（kill.species.* の合計） */
  playerKillWeight: number;
  /** 自分の実績点：深層の自己ベスト1層あたりの重み（abyss.best） */
  playerAbyssWeight: number;
}

/** ライバルの素性の母集団（content/rivals.json 由来） */
export interface RivalNamePool {
  /** 生成名の表（size 以上。重複なし抽選） */
  names: readonly string[];
  /** 二つ名の表（新聞の噂・記録画面の装飾に使う） */
  epithets: readonly string[];
}

/** 順位表の1行。自分の行は isPlayer=true（name はプレイヤー名、epithet は空） */
export interface RivalEntry {
  /** 順位（1始まり） */
  rank: number;
  name: string;
  /** 二つ名（呼称の装飾。自分は空文字） */
  epithet: string;
  /** 名声（表示用の整数値） */
  score: number;
  isPlayer: boolean;
}

export interface Rivalry {
  /** 順位表（順位順。ライバル＋自分を合わせた size+1 行） */
  entries: RivalEntry[];
  /** 自分の順位（1〜size+1） */
  playerRank: number;
  /** 自分の実績点（順位連動の確認用） */
  playerScore: number;
}

/**
 * 自分の実績点（乱数は使わない）：台帳の最高品質・称号数・討伐数・深層の
 * 自己ベストを重み付きで合算する。既存の state の値だけで決まる
 */
export function playerScore(state: GameState, cfg: RivalsConfig): number {
  const bestQuality = state.ledger.reduce((m, w) => Math.max(m, w.quality), 0);
  const kills = Object.entries(state.counters)
    .filter(([k]) => k.startsWith("kill.species."))
    .reduce((s, [, v]) => s + v, 0);
  const abyssBest = state.counters["abyss.best"] ?? 0;
  return Math.round(
    bestQuality * cfg.playerQualityWeight +
      state.titles.length * cfg.playerTitleWeight +
      kills * cfg.playerKillWeight +
      abyssBest * cfg.playerAbyssWeight,
  );
}

/** その日のライバルの名声（基礎値＋日ごとの伸び。両方とも世界シード由来） */
function rivalScoreAt(base: number, growth: number, day: number): number {
  return Math.round(base + growth * day);
}

/**
 * 順位表を組み立てる。同じ世界シード・同じ state なら同じ表になる（決定論）。
 * ライバルは日々少しずつ伸びるので、放っておくと順位を落とし、実績を積むと追い越せる
 */
export function rivalsOf(state: GameState, pool: RivalNamePool, cfg: RivalsConfig): Rivalry {
  // 世界シード由来の独立した列。state.rng（世界を進める乱数）は消費しない
  const rng = createRng(state.seed).fork("rivals");
  const size = Math.min(cfg.size, pool.names.length);
  const names = [...pool.names];
  const epithets = [...pool.epithets];
  const rivals: { name: string; epithet: string; score: number }[] = [];
  for (let i = 0; i < size; i++) {
    // 名と二つ名は残りの母集団から重複なしで引く（母集団が尽きたら二つ名は空）
    const [name] = names.splice(rng.int(0, names.length - 1), 1);
    const epithet =
      epithets.length > 0 ? epithets.splice(rng.int(0, epithets.length - 1), 1)[0]! : "";
    const base = rng.int(cfg.scoreMin, cfg.scoreMax);
    const growth = rng.next() * cfg.growthPerDay;
    rivals.push({ name: name!, epithet, score: rivalScoreAt(base, growth, state.time.day) });
  }

  const me = playerScore(state, cfg);
  // 同点は自分を上に（自慢帳は読み手のためにある）。ライバル同士の同点は名順で安定させる
  const rows = [
    ...rivals.map((r) => ({ ...r, isPlayer: false })),
    { name: state.player.name, epithet: "", score: me, isPlayer: true },
  ].sort(
    (a, b) =>
      b.score - a.score || Number(b.isPlayer) - Number(a.isPlayer) || a.name.localeCompare(b.name),
  );

  const entries = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const playerRank = entries.find((e) => e.isPlayer)?.rank ?? entries.length;
  return { entries, playerRank, playerScore: me };
}
