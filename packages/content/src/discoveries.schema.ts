import type { DiscoveryDef } from "@trace/core";
import { z } from "zod";
import { condSchema } from "./conditions.schema.js";

/**
 * discoveries.json — 隠し要素（X-11、docs/03_world_systems.md §5）。
 *
 * 隠し要素は「時刻・天候・月齢・状態・所持品の組み合わせ」で出る。発見条件は
 * 既存の条件DSL（conditions）で書き、step ごとに core が評価する。見つけると
 * flags["found.<id>"]（＋setFlags の旗）が立つ —— アトムの unlock.flag・
 * 書物の棚条件・頂点ルートの hidden・認定条件が読む刻印と同じ型
 * （place.old_forge → found.old_forge が雛形）。
 *
 * 「場所」は行動ログ近似（within の kind/target —— 旧街道の追い剥ぎと戦う＝
 * 旧街道を歩いた）、「所持品」は台帳・称号・カウンタ近似で表す
 * （持ち物システムは作らない）。
 *
 * 周回変化：seeded に挙げた時刻パラメータは世界シード（state.seed）の
 * 独立した乱数列から抽選され、条件に and で足される。同じ世界＝同じ条件、
 * 別の世界＝別の曜日・月齢。引いた値は hint の {weekday}/{moon}/{season}/
 * {dayOfSeason} に表示名で差し込まれる（噂が世界ごとに正しい情報を語る）
 */

/** 発見条件に世界シード由来で差し込む時刻パラメータ */
export const discoverySeededSchema = z
  .object({
    /** 曜日（0..daysPerWeek-1）を世界ごとに抽選する */
    weekday: z.boolean().optional(),
    /** 月齢を世界ごとに抽選する */
    moon: z.boolean().optional(),
    /** 季節（0..seasonsPerYear-1）を世界ごとに抽選する */
    season: z.boolean().optional(),
    /** 季節内の日（0..daysPerSeason-1）を世界ごとに抽選する */
    dayOfSeason: z.boolean().optional(),
  })
  .strict();

export const discoverySchema: z.ZodType<DiscoveryDef> = z
  .object({
    /** 発見ID。found.<id> が自動で立つ（lore の unlock.flag などと同じ刻印の型） */
    id: z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する"),
    /** 発見の表示名（《》は表示側で包む） */
    name: z.string().min(1),
    /** 発見した瞬間の語り（通知行に続く一行） */
    foundText: z.string().min(1),
    /**
     * 噂のヒント（voices の口調・1文。見逃し対策として未発見の間
     * 日替わりの噂ローテーションに必ず混ざる）。{weekday}/{moon}/{season}/
     * {dayOfSeason} は世界シードの抽選値の表示名に置き換わる
     */
    hint: z.string().min(1),
    /** 発見条件（条件DSL） */
    condition: condSchema,
    /** 発見時に立つ追加の旗印（found.<id> 以外に刻む印） */
    setFlags: z.array(z.string().min(1)),
    /** 周回変化：世界シードから引く時刻パラメータ（条件に and で足される） */
    seeded: discoverySeededSchema.optional(),
  })
  .strict();

export const discoveriesFileSchema = z
  .object({
    version: z.literal(1),
    discoveries: z.array(discoverySchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const d of file.discoveries) {
      if (seen.has(d.id)) ctx.addIssue({ code: "custom", message: `発見 id の重複: ${d.id}` });
      seen.add(d.id);
    }
  });

export type DiscoveryJson = z.infer<typeof discoverySchema>;
export type DiscoveriesFile = z.infer<typeof discoveriesFileSchema>;
