/**
 * 効果音（F-02・S-01）：外部ファイルを使わず Web Audio のオシレータと
 * ノイズでその場合成する。ブラウザ専用 —— core には一切置かない。
 * 共有 AudioContext・系統ゲインは fx/audio.ts、設定は fx/settings.ts。
 *
 * 使い方：
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
 *   playSfx("slash")    … 斬撃・踏み込みの一撃（鋭い刃の走り）
 *   playSfx("cursor")   … カーソルの移動（短い爪弾き）
 *   playSfx("confirm")  … 決定（小さな確かな二音）
 *   playSfx("back")     … 戻る・畳む（下りの一音）
 *   playSfx("door")     … 扉の開閉（場所に入る・出る）
 *   playSfx("steps")    … 足音（街の外への移動・場所の行き来）
 *
 * 初回はユーザー操作の中で呼ばれるため AudioContext を遅延生成し、
 * 自動再生ポリシーで吊り下がっていれば resume を試す。設定オフ・
 * 非ブラウザ・生成失敗はすべて無音で return する（演出は落ちない）。
 */
import { audioGraph, noiseBuffer } from "./audio.js";
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
  | "slash"
  | "cursor"
  | "confirm"
  | "back"
  | "door"
  | "steps"
  | "notice"
  | "fanfare"
  | "rankup"
  | "wake"
  | "world";

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
  /** ピーク音量（系統ゲインとは別の音ごとの強さ。0〜1） */
  vol?: number;
}

/** 単音：アタック短め・減衰する指数エンベロープ */
function tone(
  c: AudioContext,
  out: AudioNode,
  t0: number,
  { f, to, type = "sine", at = 0, dur, vol = 0.5 }: Tone,
) {
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
  g.connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** 打撃の体：ノイズ一塊をローパスで絞る（槌・外れの「音の芯」） */
function thump(
  c: AudioContext,
  out: AudioNode,
  t0: number,
  {
    at = 0,
    dur = 0.08,
    vol = 0.4,
    cutoff = 900,
  }: { at?: number; dur?: number; vol?: number; cutoff?: number },
) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
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
  g.connect(out);
  src.start(start, Math.abs((start * 7) % 0.4));
  src.stop(start + dur + 0.05);
}

const RECIPES: Record<SoundId, (c: AudioContext, out: AudioNode, t0: number) => void> = {
  // 札の滑り込み：高く細い一点
  tag: (c, o, t) => tone(c, o, t, { f: 1560, to: 1980, type: "triangle", dur: 0.07, vol: 0.14 }),
  // 銅貨：澄んだ二連の鈴
  coin: (c, o, t) => {
    tone(c, o, t, { f: 1320, type: "square", dur: 0.06, vol: 0.12 });
    tone(c, o, t, { f: 1980, type: "square", at: 0.06, dur: 0.12, vol: 0.1 });
  },
  // 槌・命中：低い芯＋甲高い残響
  hit: (c, o, t) => {
    thump(c, o, t, { dur: 0.09, vol: 0.5, cutoff: 700 });
    tone(c, o, t, { f: 190, to: 90, type: "sine", dur: 0.14, vol: 0.5 });
    tone(c, o, t, { f: 2600, to: 1400, type: "triangle", dur: 0.05, vol: 0.08 });
  },
  // 外れ：芯だけ薄く
  miss: (c, o, t) => thump(c, o, t, { dur: 0.06, vol: 0.18, cutoff: 1400 }),
  // 会心・反撃：甲高い一閃＋硬い芯
  crit: (c, o, t) => {
    thump(c, o, t, { dur: 0.1, vol: 0.5, cutoff: 1000 });
    tone(c, o, t, { f: 2400, to: 3200, type: "triangle", dur: 0.09, vol: 0.22 });
    tone(c, o, t, { f: 160, to: 80, type: "sine", dur: 0.16, vol: 0.45 });
  },
  // 受け止め：鈍い金属の擦れ合い
  guard: (c, o, t) => {
    thump(c, o, t, { dur: 0.07, vol: 0.35, cutoff: 500 });
    tone(c, o, t, { f: 320, to: 240, type: "square", dur: 0.08, vol: 0.1 });
  },
  // 躱し：風を裂く薄いノイズ
  dodge: (c, o, t) => {
    thump(c, o, t, { dur: 0.1, vol: 0.12, cutoff: 2400 });
    tone(c, o, t, { f: 900, to: 400, type: "sine", dur: 0.1, vol: 0.08 });
  },
  // 予兆：腹に響く低い唸り
  omen: (c, o, t) => {
    tone(c, o, t, { f: 130, to: 98, type: "sawtooth", dur: 0.5, vol: 0.16 });
    tone(c, o, t, { f: 65, type: "sine", at: 0.05, dur: 0.5, vol: 0.2 });
  },
  // 大技の被弾：低く重い芯を二度
  heavy: (c, o, t) => {
    thump(c, o, t, { dur: 0.16, vol: 0.6, cutoff: 420 });
    tone(c, o, t, { f: 110, to: 55, type: "sine", dur: 0.3, vol: 0.5 });
    tone(c, o, t, { f: 82, to: 49, type: "sine", at: 0.05, dur: 0.34, vol: 0.3 });
  },
  // 体勢が崩れた：駆け上がる二音（反撃の機）
  counter: (c, o, t) => {
    tone(c, o, t, { f: 587, type: "triangle", dur: 0.08, vol: 0.18 });
    tone(c, o, t, { f: 880, type: "triangle", at: 0.07, dur: 0.14, vol: 0.2 });
  },
  // 斬撃：刃の走る高いノイズ＋短い芯（S-01。被弾の「hit」と分ける）
  slash: (c, o, t) => {
    thump(c, o, t, { dur: 0.07, vol: 0.3, cutoff: 2600 });
    tone(c, o, t, { f: 1200, to: 400, type: "sawtooth", dur: 0.08, vol: 0.12 });
    tone(c, o, t, { f: 180, to: 90, type: "sine", dur: 0.1, vol: 0.35 });
  },
  // カーソル：ごく短い爪弾き（S-01）
  cursor: (c, o, t) => tone(c, o, t, { f: 980, to: 1180, type: "triangle", dur: 0.045, vol: 0.1 }),
  // 決定：確かな二音（S-01）
  confirm: (c, o, t) => {
    tone(c, o, t, { f: 660, type: "triangle", dur: 0.07, vol: 0.16 });
    tone(c, o, t, { f: 990, type: "triangle", at: 0.06, dur: 0.1, vol: 0.14 });
  },
  // 戻る：下りの一音（S-01）
  back: (c, o, t) => tone(c, o, t, { f: 880, to: 550, type: "triangle", dur: 0.09, vol: 0.14 }),
  // 扉：低い鳴き＋閉まる一拍（S-01）
  door: (c, o, t) => {
    thump(c, o, t, { dur: 0.1, vol: 0.28, cutoff: 420 });
    tone(c, o, t, { f: 140, to: 90, type: "sine", dur: 0.16, vol: 0.3 });
    tone(c, o, t, { f: 620, to: 460, type: "triangle", at: 0.02, dur: 0.06, vol: 0.06 });
  },
  // 足音：乾いた二歩（S-01）
  steps: (c, o, t) => {
    thump(c, o, t, { dur: 0.05, vol: 0.22, cutoff: 500 });
    thump(c, o, t, { at: 0.14, dur: 0.05, vol: 0.18, cutoff: 460 });
  },
  // A通知の窓：銀青の輝きの和音
  notice: (c, o, t) => {
    tone(c, o, t, { f: 660, type: "triangle", dur: 0.18, vol: 0.2 });
    tone(c, o, t, { f: 990, type: "sine", at: 0.05, dur: 0.28, vol: 0.16 });
  },
  // 称号のファンファーレ：上行の二音
  fanfare: (c, o, t) => {
    tone(c, o, t, { f: 523, type: "sawtooth", dur: 0.13, vol: 0.14 });
    tone(c, o, t, { f: 784, type: "sawtooth", at: 0.12, dur: 0.3, vol: 0.15 });
    tone(c, o, t, { f: 1568, type: "triangle", at: 0.12, dur: 0.24, vol: 0.08 });
  },
  // ランクアップ・自己ベスト：駆け上がる三連音
  rankup: (c, o, t) => {
    tone(c, o, t, { f: 440, type: "triangle", dur: 0.09, vol: 0.2 });
    tone(c, o, t, { f: 554, type: "triangle", at: 0.08, dur: 0.09, vol: 0.2 });
    tone(c, o, t, { f: 659, type: "triangle", at: 0.16, dur: 0.22, vol: 0.22 });
  },
  // 起床：柔らかな鈴の余韻
  wake: (c, o, t) => {
    tone(c, o, t, { f: 880, type: "sine", dur: 0.4, vol: 0.16 });
    tone(c, o, t, { f: 1174, type: "sine", at: 0.14, dur: 0.5, vol: 0.12 });
  },
  // 世界級（S）：重い鐘を二度
  world: (c, o, t) => {
    tone(c, o, t, { f: 220, to: 196, type: "sine", dur: 0.7, vol: 0.4 });
    tone(c, o, t, { f: 440, to: 392, type: "sine", at: 0.02, dur: 0.6, vol: 0.2 });
    tone(c, o, t, { f: 110, type: "sine", at: 0.4, dur: 0.8, vol: 0.3 });
  },
};

/** 効果音を鳴らす。設定オフ・未対応環境では何もしない（呼び出し側は気にしない） */
export function playSfx(id: SoundId): void {
  try {
    const s = getFxSettings();
    // 音全体・効果音系統のどちらかが閉じていれば鳴らさない
    if (!s.sound || !s.sfx || s.volume <= 0 || s.sfxVolume <= 0) return;
    const g = audioGraph();
    if (g === null) return;
    RECIPES[id](g.ctx, g.sfx, g.ctx.currentTime);
  } catch {
    /* 音は演出の添え物 —— 鳴らなくてもゲームは進む */
  }
}
