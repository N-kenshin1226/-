import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/** packages/content/pinnacles.json。docs/06 §3A の頂点ルート定義（T-41） */
export const pinnacleStageSchema = z
  .object({
    /** 段のID（ルート内で一意。flags["pinnacle.<route>.<stage>"] の一部になる） */
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** 段の表示名 */
    name: z.string().min(1),
    /** 通知ランク（docs/03 §6）。最終段（頂点）は S */
    rank: z.enum(["S", "A", "B"]),
    /** 達成時の通知文。システムメッセージ書式：「――」「《》」 */
    notice: z.string().regex(/^――.+《.+》.+。$/, "システムメッセージ書式（――…《…》…。）に従うこと"),
    condition: condSchema,
  })
  .strict();

export const pinnacleRouteSchema = z
  .object({
    /** ルートID（pinnacles.json 内で一意） */
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** ルートの表示名＝頂点の呼び名 */
    name: z.string().min(1),
    desc: z.string().min(1),
    /**
     * 最終段の達成で獲得する頂点称号（titles.json の id）。
     * その称号の condition は { "flag": "pinnacle.<route>.<最終段id>" } でなければならない
     * （validate.ts と pinnacles.test.ts で突き合わせる。条件鎖はこのファイルだけに書く）
     */
    title: z.string().regex(/^title\.[a-z0-9_.]+$/),
    /**
     * 隠しルート（X-9、06 §3A「2ルートは伏せて、噂で匂わせる」）。
     * flag は lore アトムの unlock.flag に対応するものを書く。
     * このフラグが立つまで一覧にも出ず、段の評価も行われない
     */
    hidden: z
      .object({ flag: z.string().regex(/^[a-z0-9_.]+$/) })
      .strict()
      .optional(),
    /** 条件鎖（先頭から順に越える。末尾が頂点＝Sランク） */
    stages: z.array(pinnacleStageSchema).min(2),
  })
  .strict();

export const pinnaclesFileSchema = z
  .object({
    pinnacles: z.array(pinnacleRouteSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const r of file.pinnacles) {
      if (seen.has(r.id))
        ctx.addIssue({ code: "custom", message: `頂点ルート id の重複: ${r.id}` });
      seen.add(r.id);
      const stageIds = new Set<string>();
      for (const s of r.stages) {
        if (stageIds.has(s.id)) {
          ctx.addIssue({ code: "custom", message: `${r.id}: 段 id の重複: ${s.id}` });
        }
        stageIds.add(s.id);
      }
      // 頂点（最終段）は必ず S ランク。中間段は B/A に留める
      const last = r.stages[r.stages.length - 1]!;
      if (last.rank !== "S") {
        ctx.addIssue({
          code: "custom",
          message: `${r.id}: 最終段 ${last.id} は S ランクにすること`,
        });
      }
      for (const s of r.stages.slice(0, -1)) {
        if (s.rank === "S") {
          ctx.addIssue({
            code: "custom",
            message: `${r.id}: 中間段 ${s.id} は S ランクにしない（頂点は最終段だけ）`,
          });
        }
      }
    }
  });

export type PinnacleStage = z.infer<typeof pinnacleStageSchema>;
export type PinnacleRoute = z.infer<typeof pinnacleRouteSchema>;
export type PinnaclesFile = z.infer<typeof pinnaclesFileSchema>;
