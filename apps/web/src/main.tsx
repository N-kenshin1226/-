import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyThemeVars } from "./theme.js";
import "./app.css";

// theme.ts → --t-* CSS 変数の注入（app.css はこの変数だけを参照する）
applyThemeVars();

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
