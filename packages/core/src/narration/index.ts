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
    };
  };
  npcWord: { greet: string[]; respect: string[] };
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
    }
  /** NPCの一言。deed は直近の話題（例: 狩り・仕事） */
  | { scene: "npcWord"; name: string; deed?: string }
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
        const line = req.newTitle
          ? tpl(this.pick(L.title, rng), { name: req.newTitle })
          : req.newOffer
            ? tpl(this.pick(L.offer, rng), { name: req.newOffer })
            : req.deeds.includes("combat")
              ? this.pick(L.hunted, rng)
              : req.deeds.includes("work")
                ? this.pick(L.worked, rng)
                : req.deeds.includes("read")
                  ? this.pick(L.read, rng)
                  : req.deeds.includes("train")
                    ? this.pick(L.trained, rng)
                    : this.pick(L.quiet, rng);
        return [t.newspaper.header, line];
      }
      case "npcWord": {
        const w = req.deed
          ? tpl(this.pick(t.npcWord.respect, rng), { name: req.name, deed: req.deed })
          : tpl(this.pick(t.npcWord.greet, rng), { name: req.name });
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
