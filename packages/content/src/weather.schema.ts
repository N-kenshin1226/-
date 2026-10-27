import { z } from "zod";

/**
 * weather.json — 天候（X-13、docs/03_world_systems.md §2・§5）。
 *
 * その日の空は世界シード×日付の独立した乱数列から、季節ごとの重み
 * （seasonWeights）で決定的に抽選される（core/src/weather の weatherOf）。
 * seasonWeights の添字は暦の季節（0=春,1=夏,2=秋,3=冬 —— 長さは
 * balance.time.seasonsPerYear と一致すること。check:content で検証）。
 * 重み 0 は「その季節には出ない」（雪を冬だけにする、など）。
 *
 * lines は風景の行（起床レポート・新聞・噂で使う1行の語彙）。
 * 文体は voices.json・narration.json の系統：淡々とした景物描写
 * （「――」「《》」の機械的口調はここでは付けず、情景だけを書く。
 *   枠は cli.json/narration.json のテンプレート側が付ける）
 */

/** 空の種類 */
export const weatherKindSchema = z
  .object({
    /** 天候ID（条件DSLの {weather}・balance.weather.orderPrice のキーが指す） */
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 表示名（「晴れ」「雨」など。起床レポート・新聞の {weather} に差し込む） */
    name: z.string().min(1),
    /** 季節ごとの抽選の重み（0=出ない。長さは seasonsPerYear と一致） */
    seasonWeights: z.array(z.number().nonnegative()).min(1),
    /** 風景の行の語彙（その日の天候として1行引かれる） */
    lines: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const weatherFileSchema = z
  .object({
    version: z.literal(1),
    kinds: z.array(weatherKindSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const k of file.kinds) {
      if (seen.has(k.id)) ctx.addIssue({ code: "custom", message: `天候 id の重複: ${k.id}` });
      seen.add(k.id);
    }
  });

export type WeatherKindJson = z.infer<typeof weatherKindSchema>;
export type WeatherFile = z.infer<typeof weatherFileSchema>;
