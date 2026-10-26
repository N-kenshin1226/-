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
