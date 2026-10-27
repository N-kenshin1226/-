/**
 * 演出・効果音の設定（F-02）。ブラウザの localStorage に永続化する。
 * core には置かない —— 演出はルールに関わらない表示層の都合（AGENTS 絶対ルール）。
 * e2e は `localStorage["trace.fx.v1"] = {sound:false}` で音を切って動かせる
 */
import { useEffect, useState } from "react";
import { theme } from "../theme.js";

export interface FxSettings {
  /** 効果音を鳴らすか */
  sound: boolean;
  /** 音量 0〜1（master ゲインに掛ける） */
  volume: number;
  /** 「演出を短く」：カウントアップや札の表示時間を短い側に切り替える */
  shortFx: boolean;
}

export const FX_SETTINGS_KEY = "trace.fx.v1";

export const FX_DEFAULTS: FxSettings = {
  sound: true,
  volume: theme.fx.defaultVolume,
  shortFx: false,
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 保存値 → 設定。欠けた項目・壊れた値は既定に倒す（純粋関数。テスト対象） */
export function parseFxSettings(raw: string | null): FxSettings {
  if (raw === null) return { ...FX_DEFAULTS };
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof FxSettings, unknown>>;
    return {
      sound: typeof p.sound === "boolean" ? p.sound : FX_DEFAULTS.sound,
      volume:
        typeof p.volume === "number" && Number.isFinite(p.volume)
          ? clamp01(p.volume)
          : FX_DEFAULTS.volume,
      shortFx: typeof p.shortFx === "boolean" ? p.shortFx : FX_DEFAULTS.shortFx,
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
const FX_EVENT = "trace:fx-settings";

export function setFxSettings(patch: Partial<FxSettings>): FxSettings {
  const cur = getFxSettings();
  const next = { ...cur, ...patch, volume: clamp01(patch.volume ?? cur.volume) };
  cache = next;
  try {
    localStorage.setItem(FX_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* 保存できない環境（プライベートモード等）では今回のセッションだけ有効 */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FX_EVENT));
  return next;
}

/** React 用：設定を購読する（設定画面の変更が即座に全体へ効く） */
export function useFxSettings(): FxSettings {
  const [s, setS] = useState<FxSettings>(getFxSettings);
  useEffect(() => {
    const on = () => setS(getFxSettings());
    window.addEventListener(FX_EVENT, on);
    // 別タブでの変更も拾う
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(FX_EVENT, on);
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
