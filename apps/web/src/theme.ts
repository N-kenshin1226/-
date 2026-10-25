/**
 * 仮デザインのテーマ定義（オーナー決定待ちの仮のもの）。
 * UIのスタイルはすべてここに集約し、コンポーネントに直接値を書かない。
 * 正式なスタイルガイドはオーナーが作成する（docs/05_roadmap.md）。
 */
export const theme = {
  colors: {
    bg: "#101418",
    panel: "#1a2028",
    text: "#e8e4d8",
    textDim: "#9a968a",
    accent: "#c9a84c",
    system: "#7fb3d5",
  },
  font: {
    family: '"Hiragino Mincho ProN", "Yu Mincho", serif',
    mono: '"SF Mono", Menlo, monospace',
  },
  space: (n: number) => `${n * 8}px`,
} as const;

export type Theme = typeof theme;
