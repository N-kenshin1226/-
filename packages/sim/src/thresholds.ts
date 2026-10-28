import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * sim/thresholds.json — CI ゲートの合格条件（docs/02 §10）。
 * 値を変えるときは「なぜ今の値か」を残す。緩める方向の変更は慎重に。
 */

const disabled = z.object({
  enabled: z.literal(false),
  reason: z.string().min(1),
});

const bandGate = z
  .object({
    upToMinutes: z.number().positive(),
    minFirstEvents: z.number().int().nonnegative(),
    bots: z.array(z.string()).min(1),
  })
  .strict();

export const thresholdsSchema = z
  .object({
    growth: z
      .object({
        days: z.number().int().positive(),
        /** 標準プレイ 3時間で主スキルがこの範囲に収まる（02 §10「到達帯」） */
        mainSkillAt3h: z
          .object({
            minutes: z.number().positive(),
            min: z.number(),
            max: z.number(),
            bots: z.array(z.string()).min(1),
          })
          .strict(),
        /** 10〜15時間で主スキルがこの値以上（一人前=40） */
        mainSkillByMid: z
          .object({
            marksMinutes: z.array(z.number().positive()).min(1),
            min: z.number(),
            bots: z.array(z.string()).min(1),
          })
          .strict(),
        /** 単一ルーチン型と多様型の成長差（合計スキル増分の比） */
        policyGapMax: z.number().min(1),
        /**
         * F-01「成長の爽快感」：
         * - 初日に3回以上の行動で主スキルが翌朝これだけ伸びる（目に見える初日の伸び）
         * - 最初のランクアップがこの日数以内に来る（節目が早く見える）
         */
        earlyGrowth: z
          .object({
            dayOneMinGain: z.number().nonnegative(),
            dayOneBots: z.array(z.string()).min(1),
            firstRankUpDays: z.number().int().positive(),
            rankUpBots: z.array(z.string()).min(1),
          })
          .strict(),
        /** 簡易判定のみ型の収益・経験が手動に対しての割合上限 */
        simpleRevenueShare: z.union([
          disabled,
          z.object({ enabled: z.literal(true), max: z.number().min(0).max(1) }).strict(),
        ]),
        simpleExpShare: z.union([
          disabled,
          z.object({ enabled: z.literal(true), max: z.number().min(0).max(1) }).strict(),
        ]),
        /** 全称号がいずれかの seeker プレイで到達できる日数の上限 */
        titleReachabilityDays: z.number().int().positive(),
      })
      .strict(),
    retention: z
      .object({
        days: z.number().int().positive(),
        /** 各時間帯（開始からの累計）に初体験イベントがこれだけある（03 §6） */
        bands: z.array(bandGate).min(1),
        /** 同一行動の連続回数の上限（作業化の抑止） */
        maxConsecutiveSameAction: z
          .object({ max: z.number().int().positive(), bots: z.array(z.string()).min(1) })
          .strict(),
        /**
         * 日々の出来事の頻度（F-05「普通に遊んで3日に1回以上」）。
         * 届いた日の割合と、届かない日の最大連続数の両方で見る
         */
        incidents: z
          .object({
            /** 出来事が届いた日の割合の下限（3日に1回以上 ≒ 0.34） */
            minOfferRate: z.number().min(0).max(1),
            /** 出来事の届かない日の最大連続数（行動しない日は出来事も来ない） */
            maxDryStreak: z.number().int().nonnegative(),
            bots: z.array(z.string()).min(1),
          })
          .strict(),
        /** しきい値の適用範囲に関する注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    /** 危機のバランスCIゲート（docs/08 §8、W-05） */
    crisis: z
      .object({
        /** 回す世界シードの数（通常/重いの割合が出るだけの母数） */
        seeds: z.number().int().positive(),
        /** 1世界を追う最大日数（終幕を超える余裕を持たせる） */
        maxDays: z.number().int().positive(),
        /** 「世界が自分で動く」：通常危機の決着率の下限 */
        worldResolves: z.object({ minResolvedRate: z.number().min(0).max(1) }).strict(),
        /** 「滅びはたまに」：何もしないときの滅び率がこの帯に収まる */
        ruin: z
          .object({
            expectedRate: z.number().min(0).max(1),
            minRate: z.number().min(0).max(1),
            maxRate: z.number().min(0).max(1),
          })
          .strict(),
        /** 「どの生き方にも接点」：年あたり提示数の下限（全体・自分の分野） */
        touchpoints: z
          .object({
            minOffersPerYear: z.number().min(0),
            minDomainOffersPerYear: z.number().min(0),
          })
          .strict(),
        /** 「英雄は勝ち取るもの」：集中で届く世界数と、普通遊びでの届かなさ */
        hero: z
          .object({
            focusedStage4MinWorlds: z.number().int().nonnegative(),
            casualStage4MaxRate: z.number().min(0).max(1),
          })
          .strict(),
        /** 「縛られない」：混ざった生き方・頂点なしでも段階4に届く世界がある */
        unbound: z
          .object({
            mixedStage4MinWorlds: z.number().int().nonnegative(),
            noPinnacleStage4MinWorlds: z.number().int().nonnegative(),
          })
          .strict(),
        /** 「関わると変わる」：段階3以上での決着率が何もしないよりこの差だけ高い */
        involvement: z
          .object({
            minSuccessDelta: z.number().min(0).max(1),
            minInvolvedWorlds: z.number().int().nonnegative(),
          })
          .strict(),
        /** 「見える」：危機の兆しがこの実時間（分）以内に出る */
        sign: z.object({ withinMinutes: z.number().positive() }).strict(),
        /** しきい値の根拠の注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    /**
     * 武技・資源・構成のバランスCIゲート（K-02、docs/devin_tasks/K-02_arts.md、09 §3・§5〜6）。
     * 実戦闘エンジンをシード変えで回す
     */
    arts: z
      .object({
        /** 1構成・1敵あたりの試合数（シードを変えた決定的な再現） */
        runs: z.number().int().positive(),
        /** 「連打では格上に勝てない」：attack のみ方針の格上への勝率上限 */
        spamMaxWinRate: z.number().min(0).max(1),
        /** 「複数の構成がそれぞれ勝ち筋を持つ」：この勝率以上を格上に出す構成の数の下限 */
        minWinningBuilds: z.number().int().positive(),
        minBuildWinRate: z.number().min(0).max(1),
        /** 「使われない武技がない」：アクティブ技の使用カバレッジ下限 */
        minArtCoverage: z.number().min(0).max(1),
        /** しきい値の根拠の注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    magic: z
      .object({
        /** 1構成・1敵あたりの試合数（シードを変えた決定的な再現） */
        runs: z.number().int().positive(),
        /** 「魔法・武技・混成ともに普通の敵に勝てる」：通常敵への勝率の下限 */
        minWinRate: z.number().min(0).max(1),
        /** 「魔法だけで戦える」：魔法系構成の最低勝率（どの属性系でも） */
        minMageWinRate: z.number().min(0).max(1),
        /** 「戦闘呪文が広く使われる」：攻撃・回復・補助呪文の使用カバレッジ下限 */
        minSpellCoverage: z.number().min(0).max(1),
        /** 「主人公は適性も平凡」：出自主体とNPC主体の適性平均の差の上限 */
        aptMeanGap: z.number().positive(),
        /** しきい値の根拠の注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    /**
     * 有限迷宮の受入CIゲート（G-03、docs/10 §6）。
     * 必ず勝つボットで全迷宮を踏破し、型の制覇可能性・ユニークの1体性・
     * 潜りの深さを採点する
     */
    dungeon: z
      .object({
        /** 回す世界シードの数（7種すべてが出る母数） */
        seeds: z.number().int().positive(),
        /** 1世界の迷宮の個数の許容帯（balance.dungeons.count と揃える） */
        count: z
          .object({ min: z.number().int().positive(), max: z.number().int().positive() })
          .strict(),
        /** 「1回で抜き切れない深さ」：1潜りで制覇できた迷宮の割合の上限 */
        singleDiveMaxRate: z.number().min(0).max(1),
        /** しきい値の根拠の注記（JSON にコメントを書けないため） */
        notes: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  })
  .strict();

export type Thresholds = z.infer<typeof thresholdsSchema>;

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../thresholds.json"), "utf8"));
const parsed = thresholdsSchema.safeParse(raw);
if (!parsed.success) throw new Error(`thresholds.json がスキーマ違反: ${parsed.error.message}`);

export const thresholds: Thresholds = parsed.data;
