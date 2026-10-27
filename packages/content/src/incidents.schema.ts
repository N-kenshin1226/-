import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * incidents.json — 日々の出来事（F-05、docs/devin_tasks/F-05_daily_events.md）。
 *
 * 仕事・訓練・狩りの合間に差し込まれる小さな出来事の表。道を聞かれる、
 * 拾い物、喧嘩の仲裁、師匠の気まぐれ、危機の気配 —— 会話と選択だけで終わる
 * 日常の挿話で、勝負所の行事（occasions）のようにミニゲームは出ない。
 * 出来事の中身（条件・話し手・選択肢と結果の組み合わせ）はここで組み、
 * 届く頻度と間隔は balance.json の incidents 節が持つ。
 *
 * 選択肢は結果の表を持ち、応えると世界シード×日付×出来事×選択肢の
 * 決定的な抽選で1件の結末が出る。安全な手と賭けの手を並べるのが基本形
 * （hint に「賭け」「手堅い」などの気配を書く）
 */

/** 出来事を運ぶ者：街の住人（voices.json の id）・名のあるライバル（抽選の index）・弟子入り中の師匠 */
export const incidentSpeakerSchema = z.union([
  z.object({ kind: z.literal("npc"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("rival"), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("mentor") }).strict(),
]);

/** 備えの5分野（docs/08 §4。core の CrisisFieldId と同じ集合） */
const CRISIS_FIELDS = ["might", "craft", "bond", "wealth", "knowledge"] as const;

/**
 * 結果1件：結末の文と小さな効果。どれも日常の範囲の効果で、
 * 大きな報酬は rare 系の低い重みの結末にだけ置く
 */
export const incidentOutcomeSchema = z
  .object({
    /** 結果の抽選の重み（省略時 1） */
    weight: z.number().positive().optional(),
    /** 結末の一文（記録の行。「――」始まりの地の文。{name} に話し手の名が入る） */
    text: z.string().min(1),
    /** 動く金（G。負の値で損失。所持金は 0 未満にならない） */
    money: z.number().optional(),
    /** 未定着経験（skill は skills.json の id） */
    gain: z
      .object({ skill: z.string().min(1), amount: z.number() })
      .strict()
      .optional(),
    /** 疲労の増減（負の値で回復） */
    fatigue: z.number().optional(),
    /** 立つ旗印（縁・手がかりの刻印。条件DSLが読める） */
    flags: z.array(z.string().min(1)).min(1).optional(),
    /** 加算するカウンタ（値は増分） */
    counters: z.record(z.string().min(1), z.number()).optional(),
    /** 見聞録に記すアトムの id（手がかり系の結果。lore/atoms の id） */
    atom: z.string().min(1).optional(),
    /** 世界の備えへの寄与（docs/08 §5。進行中の危機が無い世界では何も足されない） */
    contribution: z
      .object({ field: z.enum(CRISIS_FIELDS), amount: z.number().positive() })
      .strict()
      .optional(),
  })
  .strict();

export const incidentChoiceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, "choice id は小文字・数字・_ で構成する"),
    /** 選択肢の文言（押すボタンの文） */
    label: z.string().min(1),
    /** 副題（選択の気配。「賭け」「手堅い」など。省略可） */
    hint: z.string().min(1).optional(),
    outcomes: z.array(incidentOutcomeSchema).min(1),
  })
  .strict();

export const incidentSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 出来事の名（表示は《name》と包む） */
    name: z.string().min(1),
    /** 出来事の種類（同じ種類が続かない間隔の単位。例: encounter / found / trouble / fate） */
    kind: z.string().regex(/^[a-z0-9_]+$/),
    /** 出来事の描写（会話窓に出す1〜2文の地の文。「――」始まり） */
    text: z.string().min(1),
    /** 話し手（省略可。speaker があるときだけ say が効く） */
    speaker: incidentSpeakerSchema.optional(),
    /** 話し手の台詞（speaker 必須。{name} に自分の名は入れない —— 名は別枠で出る） */
    say: z.string().min(1).optional(),
    /** 提示条件（条件DSL。省略時は無条件 —— ただし日付・間隔の制は効く） */
    require: condSchema.optional(),
    /** 周期：(day - offset) % days === 0 の日だけ候補になる */
    every: z
      .object({
        days: z.number().int().min(2),
        offset: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    /** 候補からの抽選の重み（省略時 1） */
    weight: z.number().positive().optional(),
    /** この出来事が再び届くまでの最小間隔（日。省略時は balance の既定） */
    cooldownDays: z.number().int().nonnegative().optional(),
    /** その生で一度だけ届く（届いた時点で二度と候補に挙がらない） */
    once: z.literal(true).optional(),
    /** 応えの選択肢（1〜3件。最後に「見送る」系の安全な手を置くのが目安） */
    choices: z.array(incidentChoiceSchema).min(1).max(3),
  })
  .strict();

export const incidentsFileSchema = z
  .object({
    version: z.literal(1),
    incidents: z.array(incidentSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const d of file.incidents) {
      const label = d.id;
      if (seen.has(label)) {
        ctx.addIssue({ code: "custom", message: `出来事 id の重複: ${label}` });
      }
      seen.add(label);
      // 話し手がいない出来事に台詞は書けない
      if (d.speaker === undefined && d.say !== undefined) {
        ctx.addIssue({ code: "custom", message: `${label}: speaker の無い出来事に say がある` });
      }
      // {name} は話し手の名に置き換わる —— 話し手の無い文には書けない。
      // 台詞は話し手本人の言葉なので、そこに自分の名は書かない
      if (d.say !== undefined && d.say.includes("{name}")) {
        ctx.addIssue({ code: "custom", message: `${label}: say に {name} は書けない` });
      }
      if (d.speaker === undefined && d.text.includes("{name}")) {
        ctx.addIssue({ code: "custom", message: `${label}: speaker の無い text に {name} がある` });
      }
      const choiceIds = new Set<string>();
      for (const c of d.choices) {
        if (choiceIds.has(c.id)) {
          ctx.addIssue({ code: "custom", message: `${label}: 選択肢 id の重複: ${c.id}` });
        }
        choiceIds.add(c.id);
        for (const o of c.outcomes) {
          if (d.speaker === undefined && o.text.includes("{name}")) {
            ctx.addIssue({
              code: "custom",
              message: `${label}: speaker の無い結末文に {name} がある`,
            });
          }
        }
      }
    }
  });

export type IncidentJson = z.infer<typeof incidentSchema>;
export type IncidentsFile = z.infer<typeof incidentsFileSchema>;
