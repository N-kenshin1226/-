import { z } from "zod";

/** packages/content/tailwinds.json。core/growth/tailwind.ts の TailwindDef に対応 */
export const tailwindDefSchema = z
  .object({
    id: z.string().regex(/^(tw|hw)\.[a-z0-9_.]+$/),
    label: z.string().min(1),
    target: z
      .object({
        kind: z.enum(["skill", "action"]),
        id: z.string().min(1),
      })
      .strict(),
    direction: z.enum(["tailwind", "headwind"]),
  })
  .strict();

export const tailwindsFileSchema = z
  .object({
    tailwinds: z.array(tailwindDefSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const t of file.tailwinds) {
      if (seen.has(t.id)) ctx.addIssue({ code: "custom", message: `追い風 id の重複: ${t.id}` });
      seen.add(t.id);
    }
  });

export type TailwindDef = z.infer<typeof tailwindDefSchema>;
export type TailwindsFile = z.infer<typeof tailwindsFileSchema>;
