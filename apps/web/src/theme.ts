/**
 * デザイントークン（JS側で値が必要な箇所のみ。色・形の正本は app.css の :root 変数）。
 * ビジュアル方針はパワプロ風ポップ原本を年代記の紙に写し替えたもの：
 * 明るい羊皮紙背景・濃紺の太枠・大きめ角丸・沈む立体ボタン・色の意味固定。
 */
export const theme = {
  colors: {
    bg: "#faf3e0",
    panel: "#fffdf4",
    panel2: "#f7f0dc",
    text: "#2b2620",
    textDim: "#6b5f4c",
    navy: "#2c3a5e",
    accent: "#c9a227",
    accentDark: "#8a6d14",
    yellow: "#ffc21c",
    good: "#1f9d55",
    bad: "#d23b3b",
    gold: "#c9930a",
    system: "#4a5f8a",
  },
  font: {
    family:
      '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "Helvetica Neue", Arial, sans-serif',
    mono: '"SF Mono", Menlo, monospace',
  },
  space: (n: number) => `${n * 8}px`,
} as const;

export type Theme = typeof theme;
