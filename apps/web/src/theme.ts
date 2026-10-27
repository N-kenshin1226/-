/**
 * デザイントークン（UI-01）。正本は docs/design/README.md + html/*.html の値。
 * ここに置いた値が唯一の定義で、app.css は CSS 変数（--t-*）を参照し、
 * 変数の実値は main.tsx が applyThemeVars() でここから注入する。
 * コンポーネントに色・余白・枠の値を直書きしない（決まりごと8）。
 */
export const theme = {
  /** 基準解像度（16:9 固定キャンバス） */
  stage: { width: 1280, height: 720 },
  font: {
    /** ロゴ・欧文見出し・数値 */
    en: '"Cinzel", serif',
    /** 地名・人名・台詞・地の文・新聞・コマンド名 */
    mincho: '"Shippori Mincho B1", serif',
    /** システムの声・ラベル・操作ガイド */
    sys: '"Zen Kaku Gothic New", sans-serif',
  },
  colors: {
    /** 世界の窓（金）: コマンド・会話・HUD */
    world: {
      bgTop: "rgba(24,24,38,.95)",
      bgBottom: "rgba(11,11,19,.96)",
      edge: "#5A4620",
      frame: "#B8924A",
      frameInner: "#3A2E16",
      ink: "#0A0A10",
      light: "#E8C77F",
      text: "#E9E1CC",
      dim: "#A99C80",
      faint: "#B9A77C",
      hi: "#FFF3CF",
      shadow: "rgba(0,0,0,.65)",
    },
    /** 加護の窓（銀青）: ステータス・起床ログ・システムの声 */
    bless: {
      bgTop: "rgba(12,28,40,.96)",
      bgBottom: "rgba(6,14,22,.97)",
      edge: "#2C5866",
      frame: "#8FC7D4",
      frameInner: "#17323D",
      ink: "#050A10",
      light: "#BFE9F2",
      glow: "#8FE0EF",
      text: "#D7EEF3",
      dim: "#8FB5BF",
      faint: "#6FA5B2",
      hi: "#F2FCFE",
      cellOff: "#12303B",
      cellEdge: "#23505E",
    },
    /** 紙: 新聞・手紙・書物・見聞録 */
    paper: {
      bg: "#EFE5CF",
      text: "#2B241A",
      head: "#8A3B22",
      dim: "#6A5C45",
      sub: "#4A3F2E",
      line: "#B9A887",
      scorch: "rgba(120,90,40,.35)",
      shadow: "rgba(0,0,0,.6)",
    },
    /** 意味のある色 */
    grow: "#F0C26A",
    warn: "#F2B39A",
    /** 危険・停滞・錆（珊瑚。warn より強い主張が要る場面） */
    bad: "#E88B78",
    /** 特別な記録・主行動（金） */
    special: "#E8C77F",
    /** 良い変化（冷たい緑。成長の金 grow とは別） */
    good: "#9FD9A8",
    goodSoft: "rgba(240,194,106,.16)",
    chipTailBg: "rgba(40,30,10,.85)",
    chipHeadBg: "rgba(40,16,12,.85)",
    chipHeadEdge: "#9A5A44",
    /** ゲージ・セル（世界側） */
    cellOff: "#2B2A36",
    cellEdge: "#4A4658",
    cellOn: "#D9B26A",
    cellOnEdge: "#F0D08E",
    candleOff: "#6D6658",
    barOff: "#1D1B26",
    /** ステータスの項目色（伸び悩み等の注意） */
    muted: "#5F8590",
  },
  /** 窓の重ね影（三重線＋落ち影） */
  frame: {
    world:
      "inset 0 0 0 1px #0a0a10, inset 0 0 0 3px #b8924a, inset 0 0 0 4px #3a2e16, 0 10px 30px rgba(0,0,0,.65)",
    bless:
      "inset 0 0 0 1px #050a10, inset 0 0 0 3px #8fc7d4, inset 0 0 0 4px #17323d, 0 0 50px rgba(111,208,227,.18), 0 12px 40px rgba(0,0,0,.7)",
  },
  /**
   * 演出の数値（F-02）。アニメーション時間・札の寿命・音量の既定など、
   * 見た目だけの可調値はここに集める（ゲームの数値は balance.json、ここでは置かない）
   */
  fx: {
    /** B通知の札が画面に残る時間（ms）。設定「演出を短く」で tagLifeShortMs になる */
    tagLifeMs: 3400,
    tagLifeShortMs: 1900,
    /** 札の退場フェード（寿命のあとに付け足す分。タグ側の CSS transition と合わせる） */
    tagFadeMs: 240,
    /** 同時に重ねて出せる札の上限（溢れた分は古いものから消える） */
    tagMax: 5,
    /** 起床ログの数値カウントアップ（例 25.1 → 26.8 を約1秒で） */
    countUpMs: 1000,
    countUpShortMs: 450,
    /** 区切りゲージが伸びる演出：1マスごとの点灯遅延（ms） */
    segStaggerMs: 45,
    /** 熟練の階級が変わったときの紋章の入れ替わり（ms） */
    crestSwapMs: 500,
    /** 所持金の増減を拾う光の演出（ms） */
    coinFlashMs: 700,
    /**
     * ミニゲームの手応え（F-03）：命中の火花・揺れ・判定テキストの浮き・
     * 札の飛び込み・結果パネルの見せ場。それぞれ「演出を短く」で短い側へ
     */
    /** 命中の火花が散る時間（ms） */
    sparkMs: 460,
    sparkShortMs: 240,
    /** 命中の一拍に画面が小さく揺れる時間（ms） */
    shakeMs: 190,
    shakeShortMs: 110,
    /** 判定・収穫の浮き文字が消えるまでの時間（ms） */
    floatMs: 720,
    floatShortMs: 400,
    /** 出した札が場に収まる時間（ms。交渉） */
    cardMs: 260,
    cardShortMs: 130,
    /** 結果パネルの開き・品質の数字の立ち上がり（ms） */
    revealMs: 420,
    revealShortMs: 220,
    /** 効果音の既定音量（0〜1）。設定画面で変更・永続化される */
    defaultVolume: 0.6,
  },
  /** コマンド行の高さ（決まりごと: 44px 以上） */
  cmdHeight: 44,
} as const;

export type Theme = typeof theme;

/**
 * theme.colors の全エントリを --t-* の CSS 変数として :root に注入する。
 * app.css はこの変数だけを参照する（値の二重定義を防ぐ）
 */
export function applyThemeVars(): void {
  const el = document.documentElement;
  const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const walk = (prefix: string, obj: Record<string, string>) => {
    for (const [k, v] of Object.entries(obj)) {
      el.style.setProperty(`--t-${prefix}${kebab(k)}`, v);
    }
  };
  for (const [group, vals] of Object.entries(theme.colors)) {
    if (typeof vals === "string") {
      el.style.setProperty(`--t-${kebab(group)}`, vals);
    } else {
      walk(`${group}-`, vals as Record<string, string>);
    }
  }
  for (const [k, v] of Object.entries(theme.font)) el.style.setProperty(`--t-font-${k}`, v);
  for (const [k, v] of Object.entries(theme.frame)) el.style.setProperty(`--t-frame-${k}`, v);
  // 演出時間（*Ms）も CSS 変数に落とす：app.css の keyframes/transition が
  // ここの値だけを見る（時間の二重定義を防ぐ）
  for (const [k, v] of Object.entries(theme.fx)) {
    if (k.endsWith("Ms")) el.style.setProperty(`--t-fx-${kebab(k)}`, `${v}ms`);
  }
}
