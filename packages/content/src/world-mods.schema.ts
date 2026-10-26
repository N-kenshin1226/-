import type { WorldMods } from "@trace/core";
import { z } from "zod";

/**
 * 世界修飾の語彙（docs/06 §3C）。core/src/fate/index.ts の WorldMods に対応。
 * 運命の傾向（balance.json tendency 節、T-45）と誓約（vows.json、T-46）の
 * 両方で使う。`z.ZodType<WorldMods>` で注釈し、core 側とのずれを検出する。
 */
export const worldModsSchema: z.ZodType<WorldMods> = z
  .object({
    /** 敵HP倍率 */
    enemyHpFactor: z.number().positive().optional(),
    /** 敵の攻撃力倍率 */
    enemyPowerFactor: z.number().positive().optional(),
    /** 戦闘（狩り）の経験係数 */
    combatGainFactor: z.number().positive().optional(),
    /** 仕事の報酬倍率 */
    rewardFactor: z.number().positive().optional(),
    /** 宿代倍率 */
    innCostFactor: z.number().positive().optional(),
    /** 休養日の素質回復倍率 */
    restPotentialFactor: z.number().positive().optional(),
    /** true なら追い風（tailwind 方向）が出ない */
    noTailwind: z.boolean().optional(),
  })
  .strict();
