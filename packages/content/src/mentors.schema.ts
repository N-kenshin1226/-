import { z } from "zod";
import { condSchema } from "./conditions.schema.js";
import { effectSchema } from "./effects.schema.js";

/**
 * mentors.json — 師匠（docs/02_growth_system.md §8・§6、T-27）。
 * 条件を満たすと弟子入りでき、弟子期間中は `effect`（T-35 語彙）が効き、
 * 稽古ごとに担当スキルの素質が `potentialRecover` だけ回復する（お金と行動がかかる）。
 * キー突合（担当スキル・NPC・effect の対象の存在検査）は validate.ts 側で行う。
 */
export const mentorSchema = z
  .object({
    id: z.string().regex(/^mentor\.[a-z0-9_]+$/),
    name: z.string().min(1),
    /** 対応するNPC（canon.json figures / voices.json npcs の id） */
    npc: z.string().min(1),
    /** 担当スキル（skills.json の id） */
    skill: z.string().min(1),
    /** 弟子入りの条件（条件DSL。省略時は誰でも入門できる） */
    condition: condSchema.optional(),
    /** 稽古1回の礼金（G） */
    fee: z.number().int().nonnegative(),
    /** 稽古ごとの担当スキル素質回復量（上限 potentialCap/potentialMax） */
    potentialRecover: z.number().positive().optional(),
    /**
     * 弟子期間中ずっと有効な効果（T-35 語彙）。
     * gainVs は gain の M 項に、damageVs は戦闘の与ダメージに接続される
     */
    effect: effectSchema.optional(),
    /** 初回の稽古で立つ秘伝フラグ（条件DSLの flag で読める。ヒント解放の受け皿） */
    flag: z.string().min(1).optional(),
    /** 一覧での1行説明（誰が・何を教えるか） */
    desc: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

export const mentorsFileSchema = z
  .object({
    version: z.literal(1),
    mentors: z.array(mentorSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const m of file.mentors) {
      if (seen.has(m.id)) ctx.addIssue({ code: "custom", message: `師匠 id の重複: ${m.id}` });
      seen.add(m.id);
    }
  });

export type Mentor = z.infer<typeof mentorSchema>;
export type MentorsFile = z.infer<typeof mentorsFileSchema>;
