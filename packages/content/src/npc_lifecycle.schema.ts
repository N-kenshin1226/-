import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * npc_lifecycle.json — NPCの歳月（docs/07 §3 終盤、X-12）。
 * 一生のあいだに NPC の物語は進んだり終わったりする（引退・結婚・死・栄転・旅立ち）。
 * `at` は既存の条件DSLで、その世界の暦（time.year/dayOfSeason など）や flags/counters
 * から決定的に発火時期が決まる。発火済みの出来事は counters["npc.done.<npcId>.<i>"]
 * と世界の記録（crisis.log）に刻まれ、二度は発火しない（冪等）。
 *
 * kind の効果：
 * - retire/die/depart：その人は以後使えない（師匠なら入門・稽古不可、voices・
 *   ランキングから退場）。flags["npc.gone.<npcId>"] が立つ
 * - marry/promote：その人は街に残るが、出来事は新聞・噂・街の声に反映される。
 *   flags["npc.<kind>.<npcId>"] が立ち、条件DSLから読める
 * 対象IDの突き合わせ（voices/canon/rival.index）は validate.ts 側で行う。
 */
export const npcLifeEventSchema = z
  .object({
    /** 発火条件（条件DSL。その世界の暦・flags/counters で決定的） */
    at: condSchema,
    kind: z.enum(["retire", "marry", "depart", "die", "promote"]),
    /**
     * 出来事の記事文（新聞・噂・年代記の語りに載る1行。{name} に人物の名が入る。
     * ライバルの名は世界シードの抽選から解決されるので {name} で参照すること）
     */
    text: z.string().min(1),
    /** 出来事と同時に立つ任意の旗印（条件DSLの flag で読める刻印） */
    setFlags: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const npcLifeNpcSchema = z
  .object({
    /** voices.json の住人 id（npc.*）か、ライバルの抽選順の参照（rival.<index>） */
    npcId: z.string().regex(/^(npc\.[a-z0-9_]+|rival\.\d+)$/),
    /**
     * 表示名。rival.* は世界シードの抽選から名が解決されるので省略する
     * （同じ世界ならランキング・危機の英雄と同じ顔ぶれになる）
     */
    name: z.string().min(1).optional(),
    /** その人の物語の出来事（定義順に評価。同じ種類は1人につき1件まで） */
    events: z.array(npcLifeEventSchema).min(1),
  })
  .strict();

export const npcLifecycleFileSchema = z
  .object({
    version: z.literal(1),
    npcs: z.array(npcLifeNpcSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const n of file.npcs) {
      if (seen.has(n.npcId)) {
        ctx.addIssue({ code: "custom", message: `対象NPC id の重複: ${n.npcId}` });
      }
      seen.add(n.npcId);
      // 同じ種類の出来事は1人につき1件まで（年代記の重複行を避けるための制限。
      // 例: marry→die のような物語の連なりは別々の kind として書ける）
      const kinds = new Set<string>();
      for (const ev of n.events) {
        if (kinds.has(ev.kind)) {
          ctx.addIssue({
            code: "custom",
            message: `${n.npcId}: 同じ kind の出来事が複数ある（${ev.kind}）`,
          });
        }
        kinds.add(ev.kind);
      }
      // 街の住人（npc.*）は表示名が必要（ライバルは世界シードから解決するため不要）
      if (n.npcId.startsWith("npc.") && n.name === undefined) {
        ctx.addIssue({ code: "custom", message: `${n.npcId}: 住人には name が必要` });
      }
    }
  });

export type NpcLifeEventJson = z.infer<typeof npcLifeEventSchema>;
export type NpcLifeNpcJson = z.infer<typeof npcLifeNpcSchema>;
export type NpcLifecycleFile = z.infer<typeof npcLifecycleFileSchema>;
