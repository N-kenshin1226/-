import { z } from "zod";

/** 出自（02_growth_system：素質の初期値は出自由来で 80〜130% の幅） */
export const originSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    desc: z.string(),
    /** 素質の基準値（%）。これに乱数ばらつきと affinity を足す */
    potentialBase: z.number().min(1).max(200),
    /** スキルごとの出自ボーナス（%ポイント。正のみ） */
    affinity: z.record(z.string(), z.number().min(0).max(50)),
    /**
     * 出自由来の初期スキル値（F-01。鍛冶屋の子は鍛冶が最初から身についている）。
     * min〜max（整数）の範囲で世界シードから決定論的に引かれ、value・peak の
     * 両方に入る —— 最初のステータス画面から「自分の得意」が見える
     */
    initialSkills: z
      .record(
        z.string(),
        z
          .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
          .strict()
          .refine((r) => r.min <= r.max, { message: "initialSkills は min <= max で" }),
      )
      .optional(),
    /**
     * 属性適性への小さな偏り（M-01「適性は出自とシードで決まる」）。
     * 鍛冶屋の子は火に少し親しむ、程度のもの —— 引きの分布そのものは
     * 主人公もNPCも同じで、この偏りも ±0.1 までの僅かな足しに留める
     */
    elementBias: z
      .partialRecord(
        z.enum(["fire", "water", "wind", "earth", "light", "dark", "void", "life", "cure"]),
        z.number().min(-0.1).max(0.1),
      )
      .optional(),
  })
  .strict();

export const originsFileSchema = z
  .object({
    version: z.literal(1),
    origins: z.array(originSchema).min(1),
  })
  .strict();

export type Origin = z.infer<typeof originSchema>;
export type OriginsFile = z.infer<typeof originsFileSchema>;
