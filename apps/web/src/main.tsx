import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyThemeVars } from "./theme.js";
import { audioDebug, installAudioUnlock } from "./fx/audio.js";
import { SceneryGallery } from "./ui/scenery.js";
import type { TimeOfDay } from "@trace/core";
import "./app.css";

// theme.ts → --t-* CSS 変数の注入（app.css はこの変数だけを参照する）
applyThemeVars();

// 音（S-01）：最初のユーザー操作で AudioContext を解禁し、設定変更を拾う
installAudioUnlock();
// e2e・デバッグ用の窓口（実音には依存しない）
(window as { __traceAudio?: typeof audioDebug }).__traceAudio = audioDebug;

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

/**
 * 情景の確認用の裏口（G-05）：?scn=all で全型の一覧、
 * ?scn=town.port / region.forest / dungeon.abyss で1枚だけ。
 * ?tod=night&weather=snow&seed=e2e で条件を変えられる。
 * ゲーム本体は動かさず、情景の部品だけを描く
 */
const q = new URLSearchParams(window.location.search);
const scn = q.get("scn");

const TOD_SET = new Set(["morning", "noon", "evening", "night"]);
const todParam = q.get("tod");
const tod: TimeOfDay = TOD_SET.has(todParam ?? "") ? (todParam as TimeOfDay) : "evening";
const weatherParam = q.get("weather");
const weather = ["clear", "cloud", "rain", "snow"].includes(weatherParam ?? "")
  ? (weatherParam as string)
  : "clear";

createRoot(el).render(
  <StrictMode>
    {scn !== null ? (
      <SceneryGallery scn={scn} tod={tod} weather={weather} seed={q.get("seed") ?? "lab"} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
