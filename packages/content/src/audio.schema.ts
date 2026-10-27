import { z } from "zod";

/**
 * audio.json — 音の割り当てと生成レシピ（S-01、docs/devin_tasks/S-01_audio.md）。
 *
 * 外部素材は使わず、すべてブラウザの Web Audio で即時生成するための
 * 「譜面」と「場面への割り当て」を持つ。曲（tracks）と環境音（ambient）の
 * 中身は apps/web の再生エンジン（fx/music.ts・fx/ambient.ts）が解釈する。
 * ここでは「どの場面に何を鳴らすか」だけを管理し、オーナーが曲の差し替え・
 * 追加をJSONだけで行えるようにする。
 *
 *   tracks  … BGMの生成レシピ。layers の各音は [開始拍, midiノート, 長さ拍]
 *   ambient … 環境音の生成レシピ。layers は noise（持続ノイズ）/tone（持続音）/
 *             pattern（周期パターン。hits は {t:秒, f:Hz|n:ノイズ帯域, dur, vol}）
 *   assign  … 画面・場所・時間帯・天候 → トラック/環境音の対応表
 */

const ID = z.string().regex(/^[a-z0-9_.]+$/, "id は小文字・数字・_・. で構成する");

/** BGM の1音：[開始位置（拍）, midiノート番号, 長さ（拍）] */
const noteSchema = z.tuple([
  z.number().nonnegative(),
  z.number().int().min(0).max(127),
  z.number().positive(),
]);

const OSC = z.enum(["sine", "triangle", "square", "sawtooth"]);

const bgmLayerSchema = z
  .object({
    /** オシレータの種類 */
    type: OSC,
    /** 層の音量（0〜1） */
    vol: z.number().min(0).max(1),
    /** 音の並び */
    notes: z.array(noteSchema).min(1),
  })
  .strict();

const trackSchema = z
  .object({
    id: ID,
    /** 表示名（CREDITS・デバッグ用） */
    name: z.string().min(1),
    /** テンポ */
    bpm: z.number().min(30).max(240),
    /** 1ループの長さ（拍） */
    beats: z.number().positive(),
    layers: z.array(bgmLayerSchema).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    for (const l of t.layers) {
      for (const n of l.notes) {
        if (n[0] >= t.beats) {
          ctx.addIssue({
            code: "custom",
            message: `${t.id}: 拍 ${n[0]} はループ長 ${t.beats} の外側`,
          });
        }
      }
    }
  });

/** ゆらぎ（LFO）：持続音のゲインを周期的に揺らす */
const wobbleSchema = z
  .object({
    /** 揺れの速さ（Hz） */
    f: z.number().positive(),
    /** 揺れの深さ（0〜1。vol に掛ける割合） */
    depth: z.number().min(0).max(1),
  })
  .strict();

/** パターン層の1発：t 秒位置に音（f=Hz の tone か n=帯域のノイズ）を鳴らす */
const ambientHitSchema = z
  .object({
    /** 周期の頭からの秒 */
    t: z.number().nonnegative(),
    /** tone の周波数（Hz）。n とどちらか一方 */
    f: z.number().positive().optional(),
    /** tone の波形（省略時 sine） */
    type: OSC.optional(),
    /** ノイズのローパス帯域（Hz）。f とどちらか一方 */
    n: z.number().positive().optional(),
    /** 長さ（秒） */
    dur: z.number().positive(),
    /** 音量（0〜1。省略時 0.3） */
    vol: z.number().min(0).max(1).optional(),
  })
  .strict()
  .superRefine((h, ctx) => {
    if ((h.f === undefined) === (h.n === undefined)) {
      ctx.addIssue({ code: "custom", message: "hits には f（tone）か n（noise）のどちらか一方" });
    }
    if (h.n !== undefined && h.type !== undefined) {
      ctx.addIssue({ code: "custom", message: "type は f（tone）のときだけ使う" });
    }
  });

const ambientLayerSchema = z.discriminatedUnion("kind", [
  // 持続ノイズ（ざわめき・風・雨・焚き火の芯）
  z
    .object({
      kind: z.literal("noise"),
      filter: z.enum(["lowpass", "bandpass", "highpass"]),
      /** フィルタの周波数（Hz） */
      freq: z.number().positive(),
      q: z.number().positive().optional(),
      vol: z.number().min(0).max(1),
      wobble: wobbleSchema.optional(),
    })
    .strict(),
  // 持続音（深層の鳴動など低いうなり）
  z
    .object({
      kind: z.literal("tone"),
      f: z.number().positive(),
      type: OSC.optional(),
      vol: z.number().min(0).max(1),
      wobble: wobbleSchema.optional(),
    })
    .strict(),
  // 周期パターン（槌・虫・鳥・雫）
  z
    .object({
      kind: z.literal("pattern"),
      /** 繰り返しの周期（秒） */
      every: z.number().positive(),
      hits: z.array(ambientHitSchema).min(1),
    })
    .strict(),
]);

const ambientSchema = z
  .object({
    id: ID,
    name: z.string().min(1),
    /** 屋外の音か（true の場所では天候の環境音に置き換わる） */
    outdoor: z.literal(true).optional(),
    layers: z.array(ambientLayerSchema).min(1),
  })
  .strict();

/** 時間帯で分ける環境音（夜だけ別の音にする場所） */
const ambientEntrySchema = z.union([ID, z.object({ day: ID, night: ID }).strict()]);

export const audioFileSchema = z
  .object({
    version: z.literal(1),
    /** 素材の出典の記述（CREDITS.md と対になる宣言） */
    license: z.string().min(1),
    /** BGM の生成レシピ一覧 */
    tracks: z.array(trackSchema).min(1),
    /** 環境音の生成レシピ一覧 */
    ambient: z.array(ambientSchema).min(1),
    /** 場面への割り当て */
    assign: z
      .object({
        bgm: z
          .object({
            /** 場所・画面のどれにも当てはまらないときの曲 */
            default: ID,
            /** 街の場所（個別指定のない場所・見取り図）の時間帯別の曲 */
            townTod: z
              .object({
                morning: ID,
                noon: ID,
                evening: ID,
                night: ID,
              })
              .strict(),
            /** 場所 id → 曲 id（個別の曲を持つ場所） */
            places: z.record(z.string(), ID),
            /** 画面名 → 曲 id（場所より先に効く。戦闘・起床・終幕など） */
            screens: z.record(z.string(), ID),
          })
          .strict(),
        ambient: z
          .object({
            default: ID,
            /** 場所 id → 環境音（{day,night} で夜だけ替えられる） */
            places: z.record(z.string(), ambientEntrySchema),
            /** 情景キー → 環境音（場所に縛られない画面用） */
            scenes: z.record(z.string(), ID),
            /** 天候 id → 環境音（屋外の場所にだけ上書きで効く） */
            weather: z.record(z.string(), ID),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const trackIds = new Set<string>();
    for (const t of file.tracks) {
      if (trackIds.has(t.id)) ctx.addIssue({ code: "custom", message: `曲 id の重複: ${t.id}` });
      trackIds.add(t.id);
    }
    const ambientIds = new Set<string>();
    for (const a of file.ambient) {
      if (ambientIds.has(a.id)) {
        ctx.addIssue({ code: "custom", message: `環境音 id の重複: ${a.id}` });
      }
      ambientIds.add(a.id);
    }
    const needTrack = (id: string, label: string) => {
      if (!trackIds.has(id))
        ctx.addIssue({ code: "custom", message: `${label}: 未定義の曲 ${id}` });
    };
    const needAmbient = (id: string, label: string) => {
      if (!ambientIds.has(id)) {
        ctx.addIssue({ code: "custom", message: `${label}: 未定義の環境音 ${id}` });
      }
    };
    const { bgm, ambient } = file.assign;
    needTrack(bgm.default, "bgm.default");
    for (const [k, id] of Object.entries(bgm.townTod)) needTrack(id, `bgm.townTod.${k}`);
    for (const [k, id] of Object.entries(bgm.places)) needTrack(id, `bgm.places.${k}`);
    for (const [k, id] of Object.entries(bgm.screens)) needTrack(id, `bgm.screens.${k}`);
    needAmbient(ambient.default, "ambient.default");
    for (const [k, e] of Object.entries(ambient.places)) {
      if (typeof e === "string") needAmbient(e, `ambient.places.${k}`);
      else {
        needAmbient(e.day, `ambient.places.${k}.day`);
        needAmbient(e.night, `ambient.places.${k}.night`);
      }
    }
    for (const [k, id] of Object.entries(ambient.scenes)) needAmbient(id, `ambient.scenes.${k}`);
    for (const [k, id] of Object.entries(ambient.weather)) needAmbient(id, `ambient.weather.${k}`);
  });

export type BgmLayerJson = z.infer<typeof bgmLayerSchema>;
export type TrackJson = z.infer<typeof trackSchema>;
export type AmbientHitJson = z.infer<typeof ambientHitSchema>;
export type AmbientLayerJson = z.infer<typeof ambientLayerSchema>;
export type AmbientJson = z.infer<typeof ambientSchema>;
export type AmbientEntryJson = z.infer<typeof ambientEntrySchema>;
export type AudioFile = z.infer<typeof audioFileSchema>;
