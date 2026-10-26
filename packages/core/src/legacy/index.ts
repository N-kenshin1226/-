import type { GameState } from "../state/types.js";

/**
 * 継承（docs/06_endgame.md §2、T-39）。
 * 引き継ぐのは3つだけ：①素質補正（小）②「前世の記憶」の称号 ③遺物1個。
 * 数値インフレを起こさないよう係数・上限はすべて balance.json（legacy 節）
 */

/** 次周に持ち込む遺物（前世台帳から選んだ名品の摘要） */
export interface LegacyArtifact {
  name: string;
  kind: string;
  quality: number;
  tier: number;
}

/** newGame に渡す継承データ */
export interface Legacy {
  /** スキルID → 素質%の上乗せ（potentialCap ごと底上げ） */
  potentialBonus: Record<string, number>;
  /** 「前世の記憶」として保持する称号ID */
  rememberedTitles: string[];
  /** 遺物（なしでもよい） */
  artifact: LegacyArtifact | null;
}

/** balance.json の legacy 節に対応する設定 */
export interface LegacyConfig {
  /** 前世の peak → 次周素質% の変換係数（例 0.1 = peak100 で +10） */
  potentialFactor: number;
  /** スキルごとの素質上乗せ上限（%） */
  potentialMax: number;
  /** 「前世の記憶」として持てる称号の上限数 */
  rememberedMax: number;
  /** 遺物が持つ gainVs 係数（例 1.05 = 同系統の経験+5%） */
  artifactGainFactor: number;
}

export interface LegacyPick {
  /** 保持する称号ID（省略時: 定義の最上位ランクから rememberedMax 件。下記 titleDefs 使用） */
  rememberedTitles?: string[];
  /** 遺物にする台帳の作品ID（省略時: 品質最高の1件） */
  artifactId?: string;
  /** 称号のランク表（自動選択の順位付け用。S>A>B、同ランクは後に獲得した方） */
  titleDefs?: readonly { id: string; rank: "S" | "A" | "B" }[];
}

const RANK_ORDER: Record<"S" | "A" | "B", number> = { S: 0, A: 1, B: 2 };

/**
 * 前世の GameState から継承データを作る（引退・転生時に呼ぶ）。
 * 指定が無い部分は自動で選ぶ：素質は各スキルの peak×係数（上限あり）、
 * 記憶の称号は上位ランク順、遺物は品質最高の作品。
 */
export function legacyOf(state: GameState, cfg: LegacyConfig, pick?: LegacyPick): Legacy {
  const potentialBonus: Record<string, number> = {};
  for (const [id, s] of Object.entries(state.player.skills)) {
    const bonus = Math.min(cfg.potentialMax, Math.floor(s.peak * cfg.potentialFactor));
    if (bonus > 0) potentialBonus[id] = bonus;
  }

  let rememberedTitles: string[];
  if (pick?.rememberedTitles !== undefined) {
    rememberedTitles = pick.rememberedTitles
      .filter((id) => state.titles.includes(id))
      .slice(0, cfg.rememberedMax);
  } else {
    const rankOf = new Map((pick?.titleDefs ?? []).map((d) => [d.id, d.rank]));
    // 上位ランク優先・同ランクは後に獲得したもの優先（state.titles は獲得順）
    rememberedTitles = state.titles
      .map((id, i) => ({ id, i, rank: RANK_ORDER[rankOf.get(id) ?? "B"] }))
      .sort((a, b) => a.rank - b.rank || b.i - a.i)
      .slice(0, cfg.rememberedMax)
      .map((x) => x.id);
  }

  let artifact: LegacyArtifact | null = null;
  if (pick?.artifactId !== undefined) {
    const w = state.ledger.find((x) => x.id === pick.artifactId);
    if (w) artifact = { name: w.order ?? w.kind, kind: w.kind, quality: w.quality, tier: w.tier };
  } else if (state.ledger.length > 0) {
    const w = [...state.ledger].sort(
      (a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day,
    )[0]!;
    artifact = { name: w.order ?? w.kind, kind: w.kind, quality: w.quality, tier: w.tier };
  }

  return { potentialBonus, rememberedTitles, artifact };
}
