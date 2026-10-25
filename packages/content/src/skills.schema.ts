import { z } from "zod";

export const skillSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "id は snake_case の英字始まり"),
    name: z.string().min(1),
  })
  .strict();

export const skillsFileSchema = z
  .object({
    skills: z.array(skillSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const s of file.skills) {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", message: `スキル id の重複: ${s.id}` });
      seen.add(s.id);
    }
  });

export type Skill = z.infer<typeof skillSchema>;
export type SkillsFile = z.infer<typeof skillsFileSchema>;
