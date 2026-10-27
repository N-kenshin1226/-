/**
 * 表示語彙（UI-01）：content に置かれていないUI専用の言葉をここに集める。
 * ゲームルールではなく見た目の語彙（階級名・画面名・紙の題字など）。
 * ゲーム内テキストの文体は cli.json/narration.json を使う（AGENTS 文体節）
 */

/**
 * 熟練度の階級（紋章の頭文字と呼称）。value 0〜100 を帯に写す表示だけの物。
 * 境界は docs/02 §1・balance.json sleep.skillRanks と一致（F-01）：
 * 0 未経験 / 10 見習い / 25 初心者 / 40 一人前 / 60 熟練 / 80 達人 / 95 極み / 100 ???
 */
export const SKILL_BANDS = [
  { upTo: 10, crest: "未", name: "未経験" },
  { upTo: 25, crest: "見", name: "見習い" },
  { upTo: 40, crest: "初", name: "初心者" },
  { upTo: 60, crest: "一", name: "一人前" },
  { upTo: 80, crest: "熟", name: "熟練" },
  { upTo: 95, crest: "達", name: "達人" },
  { upTo: 100, crest: "極", name: "極み" },
  { upTo: Infinity, crest: "?", name: "???" },
] as const;

export function skillBandOf(value: number): { crest: string; name: string } {
  const b = SKILL_BANDS.find((x) => value < x.upTo) ?? SKILL_BANDS[SKILL_BANDS.length - 1]!;
  return { crest: b.crest, name: b.name };
}

/** 新聞の題字（朝刊。号数は経過日数＝一日一紙） */
export const NEWSPAPER = {
  name: "アルディ新報",
  en: "THE ARDI HERALD",
  /** 第一八二号 相当：この世界で何日目の朝か */
  issue: (day: number) => `第${toKanjiNum(day)}号`,
  price: "二銅貨",
} as const;

/** 数を漢数字っぽく（新聞の号数用。百・十・一を繋ぐ簡易版） */
function toKanjiNum(n: number): string {
  const d = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return d[n]!;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${t === 1 ? "" : d[t]}十${o === 0 ? "" : d[o]}`;
  }
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${d[h]}百${r === 0 ? "" : toKanjiNum(r)}`;
}

/** 地名・場所名（canon.json setting.town = アルディ） */
export const PLACE = {
  town: "アルディ",
  townSub: "王国の辺境",
  area: "宿場街",
} as const;

/** ウィンドウの肩書き（欧文見出し） */
export const KICKER = {
  action: "ACTION",
  town: "TOWN",
  status: "STATUS",
  awakening: "AWAKENING",
  chronicle: "CHRONICLE",
  worldFirst: "WORLD FIRST",
  record: "RECORD",
} as const;
