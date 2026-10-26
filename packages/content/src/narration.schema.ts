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
          })
          .strict(),
      })
      .strict(),
    npcWord: z
      .object({
        greet: z.array(z.string()).min(1),
        respect: z.array(z.string()).min(1),
      })
      .strict(),
    loreDigest: z.object({ header: z.string(), line: z.string() }).strict(),
    biography: z.object({ header: z.string(), line: z.string() }).strict(),
  })
  .strict();

export type NarrationText = z.infer<typeof narrationSchema>;
