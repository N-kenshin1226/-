/**
 * 音の土台（S-01）：共有の AudioContext と3系統（効果音・BGM・環境音）のゲイン段。
 * F-02 の sound.ts が抱えていた生成・resume の責務をここへ集約し、
 * 効果音（sound.ts）・BGM（music.ts）・環境音（ambient.ts）の各エンジンは
 * このグラフにぶら下がる。
 *
 *   ctx ── master（音全体＝sound×volume）── 各系統ゲイン ── 各エンジン
 *
 * ブラウザ専用（自動再生ポリシー）：AudioContext は最初のユーザー操作
 * （pointerdown/keydown）で生成・resume する。installAudioUnlock() を
 * main.tsx から一度だけ呼ぶ。音は演出の添え物 —— どこで失敗しても無音で進む
 */
import { FX_SETTINGS_EVENT, getFxSettings } from "./settings.js";

export interface AudioGraph {
  ctx: AudioContext;
  /** 音全体（settings.sound × settings.volume） */
  master: GainNode;
  /** 効果音系統（settings.sfx × sfxVolume） */
  sfx: GainNode;
  /** BGM 系統（settings.music × musicVolume） */
  music: GainNode;
  /** 環境音系統（settings.ambient × ambientVolume） */
  ambient: GainNode;
}

let graph: AudioGraph | null = null;
const noiseBufs = new Map<string, AudioBuffer>();

/** 共有グラフ（未生成なら作る。非ブラウザ・未対応環境では null） */
export function audioGraph(): AudioGraph | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AC === undefined) return null;
  if (graph === null) {
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.connect(master);
      const music = ctx.createGain();
      music.connect(master);
      const ambient = ctx.createGain();
      ambient.connect(master);
      graph = { ctx, master, sfx, music, ambient };
      applyAudioVolumes();
    } catch {
      graph = null;
      return null;
    }
  }
  if (graph.ctx.state === "suspended") void graph.ctx.resume().catch(() => undefined);
  return graph;
}

/** 設定 → 各系統のゲイン。sound=false で master が 0 になり全系統が無音になる */
export function applyAudioVolumes(): void {
  if (graph === null) return;
  const s = getFxSettings();
  const t = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(s.sound ? s.volume : 0, t, 0.05);
  graph.sfx.gain.setTargetAtTime(s.sfx ? s.sfxVolume : 0, t, 0.05);
  graph.music.gain.setTargetAtTime(s.music ? s.musicVolume : 0, t, 0.05);
  graph.ambient.gain.setTargetAtTime(s.ambient ? s.ambientVolume : 0, t, 0.05);
}

let unlockInstalled = false;

/**
 * 自動再生ポリシー対策：最初のユーザー操作で AudioContext を解禁する。
 * 設定変更（同一タブの FX_SETTINGS_EVENT・別タブの storage）も拾い、
 * 音量を全系統へ即時反映する。main.tsx から一度だけ呼ぶこと
 */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const g = audioGraph();
    if (g !== null && g.ctx.state !== "running") {
      void g.ctx.resume().catch(() => undefined);
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener(FX_SETTINGS_EVENT, applyAudioVolumes);
  window.addEventListener("storage", applyAudioVolumes);
}

/**
 * 決定的なノイズバッファ（疑似乱数は固定シードの xorshift —— 毎回同じ音）。
 * 効果音の打撃と環境音の持続ノイズで共用する
 */
export function noiseBuffer(c: AudioContext, seconds = 0.5): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const key = `${c.sampleRate}:${len}`;
  const hit = noiseBufs.get(key);
  if (hit !== undefined) return hit;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x9e3779b9;
  for (let i = 0; i < d.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBufs.set(key, buf);
  return buf;
}

/* ── 再生中の系統（デバッグ・e2e 窓口） ── */

const playing: { music: string | null; ambient: string | null } = {
  music: null,
  ambient: null,
};

/** エンジンが鳴らしている曲・環境音の id を記録する（鳴っていなければ null） */
export function notePlaying(kind: "music" | "ambient", id: string | null): void {
  playing[kind] = id;
}

/**
 * e2e・デバッグ用の窓口：音の状態を返す。実音には依存しないため、
 * 音を切った環境でも「どの曲が選ばれているか」を確定的に検査できる
 */
export function audioDebug(): {
  ctx: AudioContextState | null;
  music: string | null;
  ambient: string | null;
} {
  return { ctx: graph?.ctx.state ?? null, music: playing.music, ambient: playing.ambient };
}
