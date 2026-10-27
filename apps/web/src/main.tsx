import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyThemeVars } from "./theme.js";
import { audioDebug, installAudioUnlock } from "./fx/audio.js";
import "./app.css";

// theme.ts → --t-* CSS 変数の注入（app.css はこの変数だけを参照する）
applyThemeVars();

// 音（S-01）：最初のユーザー操作で AudioContext を解禁し、設定変更を拾う
installAudioUnlock();
// e2e・デバッグ用の窓口（実音には依存しない）
(window as { __traceAudio?: typeof audioDebug }).__traceAudio = audioDebug;

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
