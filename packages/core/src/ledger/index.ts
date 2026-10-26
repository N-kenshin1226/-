import type { GameState, Work } from "../state/types.js";

/**
 * 作品台帳（docs/03 §3）。
 * Work の記録・ティア更新（自己ベスト）・相場の反復減衰を担当する。
 */

export interface LedgerConfig {
  /** 品質1点あたりの基準価値 */
  basePricePerQuality: number;
  /** 相場が効く期間（日） */
  marketWindowDays: number;
  /** 同期間に同種の作品が1件増えるごとの相場の逓減率 */
  marketDecayPerWork: number;
  /** ティア更新時のスキル pending へのボーナス（「成長が大きく伸びるのはティア更新のときだけ」） */
  tierUpBonusPending: number;
}

export interface RecordedWork {
  state: GameState;
  work: Work;
  /** 自己ベストを更新した（ティアが上がった） */
  tierUp: boolean;
}

/**
 * 作品を台帳に記録する。
 * tier: 同じ kind の自己ベスト品質を更新したら +1。初作品は tier 1。
 * marketValue: quality × basePrice × decay^(直近 windowDays の同種作品数)
 */
export function recordWork(
  state: GameState,
  input: { kind: string; quality: number; order?: string; flags?: string[] },
  cfg: LedgerConfig,
): RecordedWork {
  const sameKind = state.ledger.filter((w) => w.kind === input.kind);
  const best = sameKind.reduce((m, w) => Math.max(m, w.quality), -1);
  const currentTier = sameKind.reduce((m, w) => Math.max(m, w.tier), 0);
  const tierUp = sameKind.length === 0 || input.quality > best;
  const tier = tierUp ? currentTier + 1 : Math.max(1, currentTier);

  const recent = sameKind.filter((w) => w.day >= state.time.day - cfg.marketWindowDays + 1).length;
  const marketValue = Math.max(
    1,
    Math.round(input.quality * cfg.basePricePerQuality * Math.pow(cfg.marketDecayPerWork, recent)),
  );

  const work: Work = {
    id: `${state.seed}-w${state.ledger.length + 1}`,
    kind: input.kind,
    maker: state.player.name,
    quality: Math.round(input.quality * 10) / 10,
    tier,
    ...(input.order !== undefined ? { order: input.order } : {}),
    flags: input.flags ?? [],
    day: state.time.day,
    worldSeed: state.seed,
    marketValue,
  };
  return { state: { ...state, ledger: [...state.ledger, work] }, work, tierUp };
}

/** 条件DSLの work 節の評価（台帳はここを通して読む） */
export function matchesWork(
  ledger: readonly Work[],
  cond: { kind?: string; tierGte?: number; count?: { atLeast: number } },
): boolean {
  const ws = ledger.filter((w) => cond.kind === undefined || w.kind === cond.kind);
  if (cond.tierGte !== undefined && !ws.some((w) => w.tier >= cond.tierGte!)) return false;
  if (cond.count && ws.length < cond.count.atLeast) return false;
  if (cond.kind === undefined && cond.tierGte === undefined && !cond.count) {
    return ws.length > 0;
  }
  return true;
}
