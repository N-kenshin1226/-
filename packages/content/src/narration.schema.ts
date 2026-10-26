import { z } from "zod";

/** text/narration.json — 語り層のテンプレート（07 §6。TemplateProvider が読む） */
export const narrationSchema = z
  .object({
    newspaper: z
      .object({
        header: z.string(),
        lines: z
          .object({
            quiet: z.array(z.string()).min(1),
            worked: z.array(z.string()).min(1),
            hunted: z.array(z.string()).min(1),
            trained: z.array(z.string()).min(1),
            read: z.array(z.string()).min(1),
            title: z.array(z.string()).min(1),
            offer: z.array(z.string()).min(1),
            /** 作品言及（{name}/{quality}/{tier} を差し込む） */
            work: z.array(z.string()).min(1),
            /** 物騒な見出し（{deaths} を差し込む） */
            death: z.array(z.string()).min(1),
            /** 勘違い系の見出し（03 §5。事実と少しズレた噂） */
            rumor: z.array(z.string()).min(1),
            /** 前世の伝説（06 §2、T-42。{name}/{epithet} を差し込む。年代記が非空の世界でだけ混ざる） */
            legend: z.array(z.string()).min(1),
          })
          .strict(),
      })
      .strict(),
    npcWord: z
      .object({
        greet: z.array(z.string()).min(1),
        respect: z.array(z.string()).min(1),
        /** 立場ID（society.json standings）ごとの口調差分 */
        byStanding: z
          .record(
            z.string(),
            z
              .object({
                greet: z.array(z.string()).min(1).optional(),
                respect: z.array(z.string()).min(1).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    loreDigest: z.object({ header: z.string(), line: z.string() }).strict(),
    biography: z
      .object({
        header: z.string(),
        summary: z.array(z.string()).min(1),
        origin: z.array(z.string()).min(1),
        work: z.array(z.string()).min(1),
        titles: z.array(z.string()).min(1),
        standing: z.array(z.string()).min(1),
        goal: z.array(z.string()).min(1),
        peak: z.array(z.string()).min(1),
        /** 頂点記述（T-41。{pinnacle} を差し込む） */
        pinnacle: z.array(z.string()).min(1),
        cause: z
          .object({
            retire: z.array(z.string()).min(1),
            death: z.array(z.string()).min(1),
          })
          .strict(),
        closing: z.array(z.string()).min(1),
      })
      .strict(),
  })
  .strict();

export type NarrationText = z.infer<typeof narrationSchema>;
