import type { Rng } from "../rng/index.js";

/**
 * NarrationProvider（docs/07_story.md §6）— 実行時の語り層。
 * 「文章だけ返す。結果は決めない」が規約。入力は構造化データのみ。
 * TemplateProvider（標準・オフラインで動く）／ApiProvider／LocalProvider
 * の差し替え口になる
 */

export interface NarrationTemplates {
  newspaper: {
    header: string;
    lines: {
      quiet: string[];
      worked: string[];
      hunted: string[];
      trained: string[];
      read: string[];
      title: string[];
      offer: string[];
      /** 作品言及（works 入力がある日。{name}/{quality}/{tier} を差し込む） */
      work: string[];
      /** 物騒な見出し（deaths > 0 の日に混ざる。{deaths} を差し込む） */
      death: string[];
      /** 勘違い系の見出し（docs/03 §5。事実と少しズレた噂。行動・平穏の日に混ざる） */
      rumor: string[];
    };
  };
  npcWord: {
    greet: string[];
    respect: string[];
    /** 立場ID（society.json standings）ごとの口調差分。未定義の立場は greet/respect に戻る */
    byStanding?: Record<string, { greet?: string[]; respect?: string[] }>;
  };
  loreDigest: { header: string; line: string };
  biography: { header: string; line: string };
}

export type NarrationRequest =
  /** 朝の新聞。deeds は前日の行動 kind（"work"/"combat"/"train"/"read" 等） */
  | {
      scene: "newspaper";
      deeds: readonly string[];
      /** 昨日新たに取った称号名があれば */
      newTitle?: string;
      /** 昨日届いた打診名があれば */
      newOffer?: string;
      /** 台帳由来の記事：昨日記録された作品（あれば見出しが作品に言及する） */
      works?: readonly { name: string; quality: number; tier: number }[];
      /** 死亡の通算回数。>0 なら物騒な見出しが候補に混ざる */
      deaths?: number;
    }
  /** NPCの一言。deed は直近の話題（例: 狩り・仕事）、standing は立場ID（口調が変わる） */
  | { scene: "npcWord"; name: string; deed?: string; standing?: string }
  /** 見聞録のまとめ */
  | { scene: "loreDigest"; facts: number; connected: number }
  /** 伝記（引退・死亡時） */
  | { scene: "biography"; name: string; days: number; deeds: number; titles: string };

export interface NarrationProvider {
  /** 構造化データを文章にする。必ず同じ入力＋seed → 同じ出力（rngを使う） */
  narrate(req: NarrationRequest, rng: Rng): string[];
}

const tpl = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/** テンプレートで返す標準実装。LLMなし・オフラインでも遊べる */
export class TemplateProvider implements NarrationProvider {
  constructor(private readonly text: NarrationTemplates) {}

  private pick(lines: string[], rng: Rng): string {
    return lines[rng.int(0, lines.length - 1)]!;
  }

  narrate(req: NarrationRequest, rng: Rng): string[] {
    const t = this.text;
    switch (req.scene) {
      case "newspaper": {
        const L = t.newspaper.lines;
        // 記事の分類（優先度: 称号 > 打診 > 作品 > 行動 > 平穏）。
        // 称号・打診・作品言及は台帳・通知由来の「確報」なので事実のまま出す。
        let pool: string[];
        let vars: Record<string, string | number> = {};
        if (req.newTitle) {
          pool = L.title;
          vars = { name: req.newTitle };
        } else if (req.newOffer) {
          pool = L.offer;
          vars = { name: req.newOffer };
        } else if (req.works !== undefined && req.works.length > 0) {
          const w = rng.pick(req.works);
          pool = L.work;
          vars = { name: w.name, quality: w.quality, tier: w.tier };
        } else {
          const factual = req.deeds.includes("combat")
            ? L.hunted
            : req.deeds.includes("work")
              ? L.worked
              : req.deeds.includes("read")
                ? L.read
                : req.deeds.includes("train")
                  ? L.trained
                  : L.quiet;
          // 勘違い系の見出しが一定確率で混ざる（03 §5）：rumor から1件だけ候補に立てて
          // 事実分類と競合させる（混ざる確率は各分類の配列量で自然に決まる）。
          // 死亡歴がある日は物騒な見出しも候補に混ざる
          if ((req.deaths ?? 0) > 0) vars = { deaths: req.deaths ?? 0 };
          pool = [...factual, this.pick(L.rumor, rng), ...((req.deaths ?? 0) > 0 ? L.death : [])];
        }
        return [t.newspaper.header, tpl(this.pick(pool, rng), vars)];
      }
      case "npcWord": {
        // 立場が分かっていれば口調を差し替える（voices.json／narration.json の byStanding）
        const s = req.standing ? t.npcWord.byStanding?.[req.standing] : undefined;
        const w = req.deed
          ? tpl(this.pick(s?.respect ?? t.npcWord.respect, rng), {
              name: req.name,
              deed: req.deed,
            })
          : tpl(this.pick(s?.greet ?? t.npcWord.greet, rng), { name: req.name });
        return [w];
      }
      case "loreDigest":
        return [
          t.loreDigest.header,
          tpl(t.loreDigest.line, { facts: req.facts, connected: req.connected }),
        ];
      case "biography":
        return [
          t.biography.header,
          tpl(t.biography.line, {
            name: req.name,
            days: req.days,
            deeds: req.deeds,
            titles: req.titles,
          }),
        ];
    }
  }
}
