/**
 * 錆（docs/02_growth_system.md §7「取り戻す快感の供給源」）。
 * - 最後に使ってから猶予日数を超えると、値が1日ごとに低下する
 * - 下限は最高到達値（peak）の floorFactor 倍
 * - peak 未満の再習得は relearnFactor 倍速い（「身体が覚えている」）
 * - 脳の容量：合計スキル値が capacityThreshold を超えると猶予が縮む
 *
 * 値そのものに適用する（表示と gain の両方が同じ値を見る。D-13）
 */
export interface RustConfig {
  /** 未使用から錆が始まるまでの猶予日数 */
  graceDays: number;
  /** 猶予超過後、1日あたりの低下量 */
  ratePerDay: number;
  /** 下限（peak に対する割合） */
  floorFactor: number;
  /** peak 未満の再習得倍率 */
  relearnFactor: number;
  /** 脳の容量：この合計スキル値を超えると猶予が縮み始める */
  capacityThreshold: number;
  /** 容量超過時の猶予の下限係数（graceDays に掛ける） */
  capacityGraceMinFactor: number;
  /** 起床サプライズ行のテンプレート（{name}/{loss}） */
  texts: {
    rusted: string;
    relearning: string;
  };
}

/** 合計スキル値による実効猶予（容量超過で線形に縮む、下限あり） */
export function effectiveGraceDays(totalValue: number, cfg: RustConfig): number {
  if (totalValue <= cfg.capacityThreshold) return cfg.graceDays;
  const scaled = (cfg.graceDays * cfg.capacityThreshold) / totalValue;
  return Math.max(cfg.graceDays * cfg.capacityGraceMinFactor, scaled);
}

/** 錆びた後の値（床あり）。idleDays <= 猶予なら変化なし */
export function rustedValue(
  value: number,
  peak: number,
  idleDays: number,
  totalValue: number,
  cfg: RustConfig,
): number {
  const grace = effectiveGraceDays(totalValue, cfg);
  const over = idleDays - grace;
  if (over <= 0) return value;
  const floor = peak * cfg.floorFactor;
  // 床を下回っている値は持ち上げない（錆は下げるだけ）
  return Math.min(value, Math.max(floor, value - over * cfg.ratePerDay));
}
