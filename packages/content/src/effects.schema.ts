import type { Effect } from "@trace/core";
import { z } from "zod";

/**
 * 称号・認定職の効果の語彙（docs/03_world_systems.md §7、T-35）。
 * core/src/effects/index.ts の Effect に対応する。
 * `z.ZodType<Effect>` で注釈し、スキーマ出力が Effect と一致しない場合は
 * コンパイルエラーになる（conditions.schema.ts と同じ二重管理のずれ検出）。
 */
const factorTable = z.record(z.string().min(1), z.number().positive());

export const effectSchema: z.ZodType<Effect> = z
  .object({
    /**
     * gain の M 項（02 §2）への係数。キーは行動種別（train/work/combat）か
     * 対象ID（スキルID・敵ID・仕事の kind）。例: {"train": 1.05}
     */
    gainVs: factorTable.optional(),
    /** 戦闘での与ダメージ倍率。キーは敵ID（enemies.json）。例: {"wolf": 1.05} */
    damageVs: factorTable.optional(),
    /** 仕事の報酬倍率（認定による値段変化）。キーは仕事の kind（スキルID） */
    priceVs: factorTable.optional(),
    /** 機械的効果を持たない旨・意図の注記（フレーバー） */
    note: z.string().optional(),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, { message: "effect は1つ以上のキーを持つこと" });
