import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * ストーリー・アトム（docs/07_story.md §2）。
 * 物・場所・NPC・出来事の断片。読むと事実（reveals）が分かり、
 * refs で正史の要素とつながる
 */
export const atomSchema = z
  .object({
    /** 一意ID。接頭辞は kind と揃える（item./place./npc./event. は rumor でも可） */
    id: z.string().min(1),
    kind: z.enum(["item", "place", "npc", "event"]),
    title: z.string().min(1),
    text: z.string().min(1),
    /** つながり先（正史の要素ID） */
    refs: z.array(z.string().min(1)),
    /** 読むと分かる事実（正史 canon.facts のID） */
    reveals: z.array(z.string().min(1)),
    /** fact＝事実／rumor＝噂（食い違っていてもよい） */
    reliability: z.enum(["fact", "rumor"]),
    /** 読むと立つフラグ（見聞録）。null は無し */
    unlock: z
      .object({ flag: z.string().min(1) })
      .strict()
      .nullable(),
    /**
     * 見聞録の一覧に出る条件（X-33、docs/07 §2。条件DSL）。
     * 省略時は常に載る。立つまで一覧に名を出さない ——
     * 名所の頁は「その名所を踏んだ」刻印で現れる
     */
    visible: condSchema.optional(),
  })
  .strict();

export type Atom = z.infer<typeof atomSchema>;
