import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * sim/thresholds.json — CI ゲートの合格条件（docs/02 §10）。
 * 値を変えるときは「なぜ今の値か」を残す。緩める方向の変更は慎重に。
 */

const disabled = z.object({
  enabled: z.literal(false),
  reason: z.string().min(1),
});

const bandGate = z
  .object({
    upToMinutes: z.number().positive(),
    minFirstEvents: z.number().int().nonnegative(),
    bots: z.array(z.string()).min(1),
  })
  .strict();

export const thresholdsSchema = z
  .object({
    growth: z
      .object({
        days: z.number().int().positive(),
        /** 標準プレイ 3時間で主スキルがこの範囲に収まる（02 §10「到達帯」） */
        mainSkillAt3h: z
          .object({
            minutes: z.number().positive(),
            min: z.number(),
            max: z.number(),
            bots: z.array(z.string()).min(1),
          })
          .strict(),
        /** 10〜15時間で主スキルがこの値以上（一人前=40） */
        mainSkillByMid: z
          .object({
            marksMinutes: z.array(z.number().positive()).min(1),
            min: z.number(),
            bots: z.array(z.string()).min(1),
          })
          .strict(),
        /** 単一ルーチン型と多様型の成長差（合計スキル増分の比） */
        policyGapMax: z.number().min(1),
        /** 簡易判定のみ型の収益・経験が手動に対しての割合上限 */
        simpleRevenueShare: z.union([
          disabled,
          z.object({ enabled: z.literal(true), max: z.number().min(0).max(1) }).strict(),
        ]),
        simpleExpShare: z.union([
          disabled,
          z.object({ enabled: z.literal(true), max: z.number().min(0).max(1) }).strict(),
        ]),
        /** 全称号がいずれかの seeker プレイで到達できる日数の上限 */
        titleReachabilityDays: z.number().int().positive(),
      })
      .strict(),
    retention: z
      .object({
        days: z.number().int().positive(),
        /** 各時間帯（開始からの累計）に初体験イベントがこれだけある（03 §6） */
        bands: z.array(bandGate).min(1),
        /** 同一行動の連続回数の上限（作業化の抑止） */
        maxConsecutiveSameAction: z
          .object({ max: z.number().int().positive(), bots: z.array(z.string()).min(1) })
          .strict(),
        /** しきい値の適用範囲に関する注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  })
  .strict();

export type Thresholds = z.infer<typeof thresholdsSchema>;

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../thresholds.json"), "utf8"));
const parsed = thresholdsSchema.safeParse(raw);
if (!parsed.success) throw new Error(`thresholds.json がスキーマ違反: ${parsed.error.message}`);

export const thresholds: Thresholds = parsed.data;
