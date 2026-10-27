/**
 * BGMエンジン（S-01）：audio.json の生成レシピ（[拍, midi, 長さ拍] の並び）を
 * ループ再生する。場面の切り替わりでは旧トラックをフェードアウト・
 * 新トラックをフェードインで追い越す（クロスフェード）。
 *
 * 仕組み：1ループぶんの音を先読みでスケジュールするタイマー
 * （theme.fx.audioTickMs ごとに audioAheadMs 先まで予約）。
 * 音量・ミュートは audio.ts の系統ゲインが握るので、ここでは曲の
 * 生成と停止だけを行う。鳴らせない環境では何もしない（同期だけ進む）。
 */
import { audio, type TrackJson } from "@trace/content";
import { audioGraph, notePlaying, type AudioGraph } from "./audio.js";
import { getFxSettings } from "./settings.js";
import { theme } from "../theme.js";

const TRACKS = new Map(audio.tracks.map((t) => [t.id, t]));

/** midi ノート番号 → 周波数（Hz） */
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Active {
  id: string;
  /** このトラックの出力（フェードの蛇口。music 系統ゲインへ繋ぐ） */
  out: GainNode;
  /** 先読みタイマー */
  timer: number;
  /** 次に鳴らすループの頭（ctx.currentTime 基準の秒） */
  loopAt: number;
  /** 停止用に立てた発生元の一覧 */
  nodes: Set<AudioScheduledSourceNode>;
  dead: boolean;
}

let current: Active | null = null;

/** ループ1回ぶんの全音を start から予約する */
function scheduleLoop(g: AudioGraph, a: Active, track: TrackJson, start: number) {
  const beatSec = 60 / track.bpm;
  for (const layer of track.layers) {
    for (const [t, m, d] of layer.notes) {
      const at = start + t * beatSec;
      const osc = g.ctx.createOscillator();
      const env = g.ctx.createGain();
      osc.type = layer.type;
      osc.frequency.value = midiHz(m);
      const dur = Math.max(0.06, d * beatSec);
      const end = at + dur;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(layer.vol, at + Math.min(0.04, dur * 0.4));
      env.gain.setValueAtTime(layer.vol, Math.max(at, end - Math.min(0.12, dur * 0.5)));
      env.gain.linearRampToValueAtTime(0, end);
      osc.connect(env);
      env.connect(a.out);
      osc.start(at);
      osc.stop(end + 0.05);
      a.nodes.add(osc);
      osc.onended = () => a.nodes.delete(osc);
    }
  }
}

/** 先読みスケジュール：audioAheadMs 先までループを積み増す */
function pump(g: AudioGraph, a: Active, track: TrackJson) {
  const loopSec = (track.beats * 60) / track.bpm;
  const horizon = g.ctx.currentTime + theme.fx.audioAheadMs / 1000;
  while (!a.dead && a.loopAt < horizon) {
    scheduleLoop(g, a, track, a.loopAt);
    a.loopAt += loopSec;
  }
}

/** フェードアウトして発生元を止める（即停止ではなくクロスフェードの減り側） */
function retire(a: Active): void {
  a.dead = true;
  window.clearInterval(a.timer);
  const g = audioGraph();
  if (g !== null) {
    a.out.gain.setTargetAtTime(0, g.ctx.currentTime, theme.fx.audioCrossfadeMs / 3000);
  }
  window.setTimeout(() => {
    for (const n of a.nodes) {
      try {
        n.stop();
      } catch {
        /* 既に止まっていれば何もしない */
      }
    }
    a.nodes.clear();
    a.out.disconnect();
  }, theme.fx.audioCrossfadeMs + 120);
}

/**
 * 鳴らしたい曲を同期する。同じ曲なら何もしない（呼び出しは何度でも良い）。
 * id=null か設定で音が閉じていれば現在の曲をフェードアウトして止める
 */
export function syncMusic(id: string | null): void {
  try {
    const s = getFxSettings();
    const want = id !== null && s.sound && s.music && s.volume > 0 && s.musicVolume > 0 ? id : null;
    if (current !== null && current.id === want) return;
    if (current !== null) {
      retire(current);
      current = null;
    }
    if (want === null) {
      notePlaying("music", null);
      return;
    }
    const track = TRACKS.get(want);
    const g = audioGraph();
    if (track === undefined || g === null) {
      notePlaying("music", null);
      return;
    }
    const out = g.ctx.createGain();
    out.connect(g.music);
    const a: Active = {
      id: want,
      out,
      timer: 0,
      loopAt: g.ctx.currentTime + 0.06,
      nodes: new Set(),
      dead: false,
    };
    // フェードイン（旧トラックのフェードアウトと同じ時間で追い越す）
    out.gain.setValueAtTime(0.0001, g.ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, g.ctx.currentTime + theme.fx.audioCrossfadeMs / 1000);
    a.timer = window.setInterval(() => pump(g, a, track), theme.fx.audioTickMs);
    current = a;
    pump(g, a, track);
    notePlaying("music", want);
  } catch {
    /* 音は演出の添え物 */
  }
}

/** 今鳴っている曲 id（未再生・停止中は null） */
export function currentMusic(): string | null {
  return current?.id ?? null;
}
