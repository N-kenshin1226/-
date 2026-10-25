import { theme } from "./theme.js";

export function App() {
  return (
    <main
      style={{
        fontFamily: theme.font.family,
        background: theme.colors.bg,
        color: theme.colors.text,
        minHeight: "100vh",
        padding: theme.space(4),
      }}
    >
      <h1 style={{ color: theme.colors.accent }}>TRACE</h1>
      <p style={{ color: theme.colors.system }}>――行動したことだけが、強さになる。</p>
    </main>
  );
}
