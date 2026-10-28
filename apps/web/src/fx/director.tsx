/**
 * 音の監督（S-01）：今の画面・場所・時間帯・天候から「鳴るべき曲と環境音」を
 * 引き、両エンジンへ同期させるだけの透明な部品。レンダリングはしない。
 * 設定（fx）も購読する —— 設定画面で系統を戻した瞬間に鳴り直す
 */
import { useEffect } from "react";
import type { TimeOfDay } from "@trace/core";
import { resolveAmbient, resolveTrack } from "./audio-map.js";
import { syncAmbient } from "./ambient.js";
import { syncMusic } from "./music.js";
import { useFxSettings } from "./settings.js";

export function AudioDirector({
  /** 画面名（ui.tsx の Screen["name"]）。タイトル等ゲーム外は undefined */
  screen,
  /** その画面が属する場所 id（場所に縛られない画面は最後に居た場所） */
  place,
  /** 解決済みの場所の種別（G-01：生成地方の場所は places.json に載らない） */
  placeKind,
  /** 背景と同じ情景キー（場所に縛られない画面の環境音の逃げ道） */
  scene,
  tod,
  weather,
}: {
  screen: string | undefined;
  place: string | undefined;
  placeKind?: "town" | "region";
  scene: string;
  tod: TimeOfDay;
  weather: string;
}) {
  const fx = useFxSettings();
  useEffect(() => {
    syncMusic(resolveTrack(screen ?? "", place, tod, placeKind));
    syncAmbient(resolveAmbient(place, scene, tod, weather));
    // fx は購読用：系統のオン/オフ・音量が変わったら鳴り直す（値はエンジン側が読む）
  }, [screen, place, placeKind, scene, tod, weather, fx]);
  return null;
}
