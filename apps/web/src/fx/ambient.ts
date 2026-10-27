/**
 * 環境音エンジン（S-01）：audio.json の環境音レシピを層ごとに鳴らす。
 *   noise   … 持続ノイズ（ざわめき・風・雨・焚き火）。フィルタ＋ゆらぎで表情付け
 *   tone    … 持続音（深層のうなり）
 *   pattern … 周期パターン（槌・虫・鳥・雫）。先読みスケジュールで鳴らす
 *
 * 場所の切り替わりでは BGM と同じくクロスフェードで追い越す。
 * 音量・ミュートは audio.ts の ambient 系統ゲインが握る
 */
import { audio, type AmbientLayerJson } from "@trace/content";
import { audioGraph, noiseBuffer, notePlaying, type AudioGraph } from "./audio.js";
import { getFxSettings } from "./settings.js";
import { theme } from "../theme.js";

const AMBIENTS = new Map(audio.ambient.map((a) => [a.id, a]));

interface Active {
  id: string;
  out: GainNode;
  /** 継続して鳴っている発生元（noise/tone） */
  nodes: AudioScheduledSourceNode[];
  /** pattern 層の先読みタイマーと次回位置 */
  timers: number[];
  nextAt: number[];
  dead: boolean;
}

let current: Active | null = null;

/** ゆらぎ（LFO）：ゲインを周期的に揺らす。揺れの中心は vol×(1−depth) */
function addWobble(
  g: AudioGraph,
  target: AudioParam,
  vol: number,
  wobble: { f: number; depth: number } | undefined,
): AudioScheduledSourceNode | null {
  if (wobble === undefined) return null;
  target.value = vol * Math.max(0, 1 - wobble.depth);
  const lfo = g.ctx.createOscillator();
  const lg = g.ctx.createGain();
  lfo.frequency.value = wobble.f;
  lg.gain.value = vol * wobble.depth;
  lfo.connect(lg);
  lg.connect(target);
  lfo.start();
  return lfo;
}

/** pattern 層の1発：tone（f）かノイズ（n） */
function hit(
  g: AudioGraph,
  a: Active,
  out: AudioNode,
  h: { t: number; f?: number; type?: OscillatorType; n?: number; dur: number; vol?: number },
  base: number,
) {
  const start = base + h.t;
  const vol = h.vol ?? 0.3;
  const env = g.ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, vol),
    start + Math.min(0.008, h.dur * 0.3),
  );
  env.gain.exponentialRampToValueAtTime(0.0001, start + h.dur);
  let src: AudioScheduledSourceNode;
  if (h.f !== undefined) {
    const o = g.ctx.createOscillator();
    o.type = h.type ?? "sine";
    o.frequency.value = h.f;
    src = o;
  } else {
    const s = g.ctx.createBufferSource();
    s.buffer = noiseBuffer(g.ctx);
    const lp = g.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = h.n ?? 900;
    s.connect(lp);
    lp.connect(env);
    src = s;
  }
  if (h.f !== undefined) src.connect(env);
  env.connect(out);
  src.start(start);
  src.stop(start + h.dur + 0.05);
}

/** 層を1枚鳴らす。戻り値はその層の停止関数 */
function startLayer(g: AudioGraph, a: Active, layer: AmbientLayerJson, out: AudioNode): void {
  if (layer.kind === "noise") {
    const src = g.ctx.createBufferSource();
    src.buffer = noiseBuffer(g.ctx, 2);
    src.loop = true;
    const f = g.ctx.createBiquadFilter();
    f.type = layer.filter;
    f.frequency.value = layer.freq;
    if (layer.q !== undefined) f.Q.value = layer.q;
    const env = g.ctx.createGain();
    env.gain.value = layer.vol;
    const lfo = addWobble(g, env.gain, layer.vol, layer.wobble);
    src.connect(f);
    f.connect(env);
    env.connect(out);
    src.start();
    a.nodes.push(src);
    if (lfo !== null) a.nodes.push(lfo);
    return;
  }
  if (layer.kind === "tone") {
    const o = g.ctx.createOscillator();
    o.type = layer.type ?? "sine";
    o.frequency.value = layer.f;
    const env = g.ctx.createGain();
    env.gain.value = layer.vol;
    const lfo = addWobble(g, env.gain, layer.vol, layer.wobble);
    o.connect(env);
    env.connect(out);
    o.start();
    a.nodes.push(o);
    if (lfo !== null) a.nodes.push(lfo);
    return;
  }
  // pattern：周期 hits を先読みで鳴らす
  const idx = a.timers.length;
  a.nextAt[idx] = g.ctx.currentTime + 0.08;
  const tick = () => {
    const horizon = g.ctx.currentTime + theme.fx.audioAheadMs / 1000;
    while (!a.dead && a.nextAt[idx]! < horizon) {
      const base = a.nextAt[idx]!;
      for (const h of layer.hits) hit(g, a, out, h, base);
      a.nextAt[idx] = base + layer.every;
    }
  };
  a.timers[idx] = window.setInterval(tick, theme.fx.audioTickMs);
  tick();
}

/** フェードアウトして全層を止める */
function retire(a: Active): void {
  a.dead = true;
  for (const t of a.timers) window.clearInterval(t);
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
    a.nodes.length = 0;
    a.out.disconnect();
  }, theme.fx.audioCrossfadeMs + 120);
}

/**
 * 鳴らしたい環境音を同期する（呼び出しは何度でも良い）。
 * id=null か設定で音が閉じていれば現在の環境音をフェードアウトして止める
 */
export function syncAmbient(id: string | null): void {
  try {
    const s = getFxSettings();
    const want =
      id !== null && s.sound && s.ambient && s.volume > 0 && s.ambientVolume > 0 ? id : null;
    if (current !== null && current.id === want) return;
    if (current !== null) {
      retire(current);
      current = null;
    }
    if (want === null) {
      notePlaying("ambient", null);
      return;
    }
    const def = AMBIENTS.get(want);
    const g = audioGraph();
    if (def === undefined || g === null) {
      notePlaying("ambient", null);
      return;
    }
    const out = g.ctx.createGain();
    out.connect(g.ambient);
    const a: Active = { id: want, out, nodes: [], timers: [], nextAt: [], dead: false };
    out.gain.setValueAtTime(0.0001, g.ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, g.ctx.currentTime + theme.fx.audioCrossfadeMs / 1000);
    current = a;
    for (const layer of def.layers) startLayer(g, a, layer, out);
    notePlaying("ambient", want);
  } catch {
    /* 音は演出の添え物 */
  }
}

/** 今鳴っている環境音 id（未再生・停止中は null） */
export function currentAmbient(): string | null {
  return current?.id ?? null;
}
