/**
 * 効果音（F-02）：外部ファイルを使わず Web Audio のオシレータと
 * ノイズでその場合成する。ブラウザ専用 —— core には一切置かない。
 *
 * 使い方（F-03/F-04 のフック面）：
 *   playSfx("hit")      … 槌・命中など一拍の音
 *   playSfx("fanfare")  … 称号などの二音
 *   playSfx("rankup")   … 上昇の三連音（ティア・ランクアップ）
 *   playSfx("wake")     … 起床の鈴
 *   playSfx("world")    … 世界級の出来事（S）の重い鐘
 *   playSfx("notice")   … A通知の窓が開く音
 *   playSfx("coin")     … 報酬の銅貨
 *   playSfx("tag")      … 札の滑り込み（控えめ）
 *   playSfx("miss")     … 外れ・空振り
 *   playSfx("crit")     … 会心・隙への反撃（鋭い高音）
 *   playSfx("guard")    … 防御で受け止めた音（鈍い金属音）
 *   playSfx("dodge")    … 躱し・見切りの風切り
 *   playSfx("omen")     … 予兆の低音（大技が来る）
 *   playSfx("heavy")    … 大技の被弾（重い一撃）
 *   playSfx("counter")  … 体勢が崩れた合図（反撃の機）
 *
 * 初回はユーザー操作の中で呼ばれるため AudioContext を遅延生成し、
 * 自動再生ポリシーで吊り下がっていれば resume を試す。設定オフ・
 * 非ブラウザ・生成失敗はすべて無音で return する（演出は落ちない）。
 */
import { getFxSettings } from "./settings.js";

export type SoundId =
  | "tag"
  | "coin"
  | "hit"
  | "miss"
  | "crit"
  | "guard"
  | "dodge"
  | "omen"
  | "heavy"
  | "counter"
  | "notice"
  | "fanfare"
  | "rankup"
  | "wake"
  | "world";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AC === undefined) return null;
  if (ctx === null) {
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** 決定的なノイズ（疑似乱数は固定シードの xorshift。毎回同じ音になる） */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf !== null && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x9e3779b9;
  for (let i = 0; i < d.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuf = buf;
  return buf;
}

interface Tone {
  /** 開始周波数（Hz） */
  f: number;
  /** 終了周波数（省略時は変化なし） */
  to?: number;
  type?: OscillatorType;
  /** 開始位置（ctx.currentTime からの秒） */
  at?: number;
  /** 長さ（秒） */
  dur: number;
  /** ピーク音量（master ゲインとは別の音ごとの強さ。0〜1） */
  vol?: number;
}

/** 単音：アタック短め・減衰する指数エンベロープ */
function tone(c: AudioContext, t0: number, { f, to, type = "sine", at = 0, dur, vol = 0.5 }: Tone) {
  const o = c.createOscillator();
  const g = c.createGain();
  const start = t0 + at;
  o.type = type;
  o.frequency.setValueAtTime(f, start);
  if (to !== undefined && to > 0) o.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), start + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(master!);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** 打撃の体：ノイズ一塊をローパスで絞る（槌・外れの「音の芯」） */
function thump(
  c: AudioContext,
  t0: number,
  {
    at = 0,
    dur = 0.08,
    vol = 0.4,
    cutoff = 900,
  }: { at?: number; dur?: number; vol?: number; cutoff?: number },
) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  const g = c.createGain();
  const start = t0 + at;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(master!);
  src.start(start, Math.abs((start * 7) % 0.4));
  src.stop(start + dur + 0.05);
}

const RECIPES: Record<SoundId, (c: AudioContext, t0: number) => void> = {
  // 札の滑り込み：高く細い一点
  tag: (c, t) => tone(c, t, { f: 1560, to: 1980, type: "triangle", dur: 0.07, vol: 0.14 }),
  // 銅貨：澄んだ二連の鈴
  coin: (c, t) => {
    tone(c, t, { f: 1320, type: "square", dur: 0.06, vol: 0.12 });
    tone(c, t, { f: 1980, type: "square", at: 0.06, dur: 0.12, vol: 0.1 });
  },
  // 槌・命中：低い芯＋甲高い残響
  hit: (c, t) => {
    thump(c, t, { dur: 0.09, vol: 0.5, cutoff: 700 });
    tone(c, t, { f: 190, to: 90, type: "sine", dur: 0.14, vol: 0.5 });
    tone(c, t, { f: 2600, to: 1400, type: "triangle", dur: 0.05, vol: 0.08 });
  },
  // 外れ：芯だけ薄く
  miss: (c, t) => thump(c, t, { dur: 0.06, vol: 0.18, cutoff: 1400 }),
  // 会心・反撃：甲高い一閃＋硬い芯
  crit: (c, t) => {
    thump(c, t, { dur: 0.1, vol: 0.5, cutoff: 1000 });
    tone(c, t, { f: 2400, to: 3200, type: "triangle", dur: 0.09, vol: 0.22 });
    tone(c, t, { f: 160, to: 80, type: "sine", dur: 0.16, vol: 0.45 });
  },
  // 受け止め：鈍い金属の擦れ合い
  guard: (c, t) => {
    thump(c, t, { dur: 0.07, vol: 0.35, cutoff: 500 });
    tone(c, t, { f: 320, to: 240, type: "square", dur: 0.08, vol: 0.1 });
  },
  // 躱し：風を裂く薄いノイズ
  dodge: (c, t) => {
    thump(c, t, { dur: 0.1, vol: 0.12, cutoff: 2400 });
    tone(c, t, { f: 900, to: 400, type: "sine", dur: 0.1, vol: 0.08 });
  },
  // 予兆：腹に響く低い唸り
  omen: (c, t) => {
    tone(c, t, { f: 130, to: 98, type: "sawtooth", dur: 0.5, vol: 0.16 });
    tone(c, t, { f: 65, type: "sine", at: 0.05, dur: 0.5, vol: 0.2 });
  },
  // 大技の被弾：低く重い芯を二度
  heavy: (c, t) => {
    thump(c, t, { dur: 0.16, vol: 0.6, cutoff: 420 });
    tone(c, t, { f: 110, to: 55, type: "sine", dur: 0.3, vol: 0.5 });
    tone(c, t, { f: 82, to: 49, type: "sine", at: 0.05, dur: 0.34, vol: 0.3 });
  },
  // 体勢が崩れた：駆け上がる二音（反撃の機）
  counter: (c, t) => {
    tone(c, t, { f: 587, type: "triangle", dur: 0.08, vol: 0.18 });
    tone(c, t, { f: 880, type: "triangle", at: 0.07, dur: 0.14, vol: 0.2 });
  },
  // A通知の窓：銀青の輝きの和音
  notice: (c, t) => {
    tone(c, t, { f: 660, type: "triangle", dur: 0.18, vol: 0.2 });
    tone(c, t, { f: 990, type: "sine", at: 0.05, dur: 0.28, vol: 0.16 });
  },
  // 称号のファンファーレ：上行の二音
  fanfare: (c, t) => {
    tone(c, t, { f: 523, type: "sawtooth", dur: 0.13, vol: 0.14 });
    tone(c, t, { f: 784, type: "sawtooth", at: 0.12, dur: 0.3, vol: 0.15 });
    tone(c, t, { f: 1568, type: "triangle", at: 0.12, dur: 0.24, vol: 0.08 });
  },
  // ランクアップ・自己ベスト：駆け上がる三連音
  rankup: (c, t) => {
    tone(c, t, { f: 440, type: "triangle", dur: 0.09, vol: 0.2 });
    tone(c, t, { f: 554, type: "triangle", at: 0.08, dur: 0.09, vol: 0.2 });
    tone(c, t, { f: 659, type: "triangle", at: 0.16, dur: 0.22, vol: 0.22 });
  },
  // 起床：柔らかな鈴の余韻
  wake: (c, t) => {
    tone(c, t, { f: 880, type: "sine", dur: 0.4, vol: 0.16 });
    tone(c, t, { f: 1174, type: "sine", at: 0.14, dur: 0.5, vol: 0.12 });
  },
  // 世界級（S）：重い鐘を二度
  world: (c, t) => {
    tone(c, t, { f: 220, to: 196, type: "sine", dur: 0.7, vol: 0.4 });
    tone(c, t, { f: 440, to: 392, type: "sine", at: 0.02, dur: 0.6, vol: 0.2 });
    tone(c, t, { f: 110, type: "sine", at: 0.4, dur: 0.8, vol: 0.3 });
  },
};

/** 効果音を鳴らす。設定オフ・未対応環境では何もしない（呼び出し側は気にしない） */
export function playSfx(id: SoundId): void {
  try {
    const s = getFxSettings();
    if (!s.sound || s.volume <= 0) return;
    const c = audio();
    if (c === null || master === null) return;
    master.gain.setValueAtTime(Math.min(1, s.volume), c.currentTime);
    RECIPES[id](c, c.currentTime);
  } catch {
    /* 音は演出の添え物 —— 鳴らなくてもゲームは進む */
  }
}
