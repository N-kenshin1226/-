/**
 * 演出・音の設定（F-02・S-01）。ブラウザの localStorage に永続化する。
 * core には置かない —— 演出はルールに関わらない表示層の都合（AGENTS 絶対ルール）。
 * e2e は `localStorage["trace.fx.v1"] = {sound:false}` で音を切って動かせる
 * （sound=false は全系統のミュート —— S-01 の3系統も全部止まる。互換の要）
 */
import { useEffect, useState } from "react";
import { theme } from "../theme.js";

export interface FxSettings {
  /**
   * 音全体（マスター）。false で効果音・BGM・環境音の全系統が無音になる。
   * F-02 までは「効果音」フラグだったキー —— 保存値の互換のため名前はそのまま
   */
  sound: boolean;
  /** 全体音量 0〜1（各系統のゲインに掛ける） */
  volume: number;
  /** 効果音（SFX）を鳴らすか */
  sfx: boolean;
  /** 効果音の音量 0〜1 */
  sfxVolume: number;
  /** BGM を鳴らすか */
  music: boolean;
  /** BGM の音量 0〜1 */
  musicVolume: number;
  /** 環境音を鳴らすか */
  ambient: boolean;
  /** 環境音の音量 0〜1 */
  ambientVolume: number;
  /** 「演出を短く」：カウントアップや札の表示時間を短い側に切り替える */
  shortFx: boolean;
}

export const FX_SETTINGS_KEY = "trace.fx.v1";

export const FX_DEFAULTS: FxSettings = {
  sound: true,
  volume: theme.fx.defaultVolume,
  sfx: true,
  sfxVolume: 1,
  music: true,
  musicVolume: theme.fx.defaultMusicVolume,
  ambient: true,
  ambientVolume: theme.fx.defaultAmbientVolume,
  shortFx: false,
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 保存値 → 設定。欠けた項目・壊れた値は既定に倒す（純粋関数。テスト対象） */
export function parseFxSettings(raw: string | null): FxSettings {
  if (raw === null) return { ...FX_DEFAULTS };
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof FxSettings, unknown>>;
    const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
    const vol = (v: unknown, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? clamp01(v) : def;
    return {
      sound: bool(p.sound, FX_DEFAULTS.sound),
      volume: vol(p.volume, FX_DEFAULTS.volume),
      sfx: bool(p.sfx, FX_DEFAULTS.sfx),
      sfxVolume: vol(p.sfxVolume, FX_DEFAULTS.sfxVolume),
      music: bool(p.music, FX_DEFAULTS.music),
      musicVolume: vol(p.musicVolume, FX_DEFAULTS.musicVolume),
      ambient: bool(p.ambient, FX_DEFAULTS.ambient),
      ambientVolume: vol(p.ambientVolume, FX_DEFAULTS.ambientVolume),
      shortFx: bool(p.shortFx, FX_DEFAULTS.shortFx),
    };
  } catch {
    return { ...FX_DEFAULTS };
  }
}

let cache: FxSettings | null = null;

/** 現在の設定（同一タブ内の即時反映のためモジュール内キャッシュを持つ） */
export function getFxSettings(): FxSettings {
  if (cache !== null) return cache;
  try {
    cache = parseFxSettings(localStorage.getItem(FX_SETTINGS_KEY));
  } catch {
    cache = { ...FX_DEFAULTS };
  }
  return cache;
}

/** 設定変更を同一タブへ即時伝えるためのカスタムイベント名 */
export const FX_SETTINGS_EVENT = "trace:fx-settings";

const VOLUME_KEYS = ["volume", "sfxVolume", "musicVolume", "ambientVolume"] as const;

export function setFxSettings(patch: Partial<FxSettings>): FxSettings {
  const cur = getFxSettings();
  const next = { ...cur, ...patch };
  for (const k of VOLUME_KEYS) next[k] = clamp01(next[k]);
  cache = next;
  try {
    localStorage.setItem(FX_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* 保存できない環境（プライベートモード等）では今回のセッションだけ有効 */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FX_SETTINGS_EVENT));
  return next;
}

/** React 用：設定を購読する（設定画面の変更が即座に全体へ効く） */
export function useFxSettings(): FxSettings {
  const [s, setS] = useState<FxSettings>(getFxSettings);
  useEffect(() => {
    const on = () => setS(getFxSettings());
    window.addEventListener(FX_SETTINGS_EVENT, on);
    // 別タブでの変更も拾う
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(FX_SETTINGS_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return s;
}

/** 「演出を短く」適用後の演出時間（ms）を返す。full/short のペア値から選ぶ */
export function fxMs(full: number, short: number): number {
  return getFxSettings().shortFx ? short : full;
}

/** prefers-reduced-motion の環境では動きを出さない（演出を飛ばす側の極端として扱う） */
export function motionOff(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
