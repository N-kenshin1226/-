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
      /** 前世の伝説（06 §2、T-42。年代記が非空の世界でだけ混ざる。{name}/{epithet} を差し込む） */
      legend: string[];
      /** ライバルの噂（T-47。ランキングのライバルが候補の日に混ざる。{name}/{epithet}/{rank}/{score} を差し込む） */
      rival: string[];
      /**
       * 勝負所の行事（X-10）：行事に臨んだ日の記事。見出しとは別に必ず載る確報。
       * {occasion} には《》で包んだ行事名が入る（勝った日／敗れた日で別の文面）
       */
      occasionWin: string[];
      occasionLoss: string[];
    };
  };
  npcWord: {
    greet: string[];
    respect: string[];
    /** 立場ID（society.json standings）ごとの口調差分。未定義の立場は greet/respect に戻る */
    byStanding?: Record<string, { greet?: string[]; respect?: string[] }>;
  };
  loreDigest: { header: string; line: string };
  /** 伝記（T-37。引退・死亡時の複数行テキスト。各行は素材があるときだけ出る） */
  biography: {
    header: string;
    /** {name}/{days}/{deeds} */
    summary: string[];
    /** {origin} */
    origin: string[];
    /** 代表作 {name}/{quality}/{tier} */
    work: string[];
    /** {titles}（称号名を読点で繋いだもの） */
    titles: string[];
    /** {standing}/{profession} */
    standing: string[];
    /** {goals}（達成した目標名を繋いだもの） */
    goal: string[];
    /** {skill}/{value} */
    peak: string[];
    /** {pinnacle}（T-41。頂点に至ったルート名を差し込む頂点記述の行） */
    pinnacle: string[];
    cause: { retire: string[]; death: string[] };
    closing: string[];
  };
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
      /** 前世（T-42）：年代記の最新の人生。あれば伝説行が候補に混ざる */
      prevLife?: { name: string; epithet?: string };
      /** ライバル（T-47）：ランキングの話題にするライバル。あれば噂が候補に混ざる */
      rival?: { name: string; epithet: string; rank: number; score: number };
      /**
       * 勝負所の行事（X-10）：昨日臨んだ勝負所の結果。あれば見出しの後に必ず載る
       * （name は行事名 —— 《》は語り層が付ける）
       */
      occasions?: readonly { name: string; won: boolean }[];
    }
  /** NPCの一言。deed は直近の話題（例: 狩り・仕事）、standing は立場ID（口調が変わる） */
  | { scene: "npcWord"; name: string; deed?: string; standing?: string }
  /** 見聞録のまとめ */
  | { scene: "loreDigest"; facts: number; connected: number }
  /**
   * 伝記（引退・死亡時、T-37）。素材が無い行は出ない。
   * titles/goals は表示名を読点などで繋いだ文字列。cause 省略時は終わりの行を出さない
   */
  | {
      scene: "biography";
      name: string;
      days: number;
      deeds: number;
      titles?: string;
      origin?: string;
      work?: { name: string; quality: number; tier: number };
      standing?: string;
      /** 職業の表示名。standing 行の末尾に続く（例: "職業は鍛冶師だった。"相当の断片はテンプレ側） */
      profession?: string;
      goals?: string;
      peakSkill?: { name: string; value: number };
      /** 頂点に至ったルート名（T-41。複数ある場合は呼び出し側で繋げる） */
      pinnacle?: string;
      cause?: "retire" | "death";
    };

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
          // 前世の伝説（T-42）：年代記が非空の世界では名・二つ名が噂に混ざる
          const legends = (req.prevLife !== undefined ? L.legend : []).map((l) =>
            tpl(l, {
              name: req.prevLife?.name ?? "",
              epithet: req.prevLife?.epithet ?? "名もなき者",
            }),
          );
          // ライバルの噂（T-47）：ランキングのライバルが候補に混ざる
          const rivals = (req.rival !== undefined ? L.rival : []).map((l) =>
            tpl(l, {
              name: req.rival?.name ?? "",
              epithet: req.rival?.epithet ?? "",
              rank: req.rival?.rank ?? 0,
              score: req.rival?.score ?? 0,
            }),
          );
          pool = [
            ...factual,
            this.pick(L.rumor, rng),
            ...((req.deaths ?? 0) > 0 ? L.death : []),
            ...legends,
            ...rivals,
          ];
        }
        // 勝負所の行事（X-10）：結果は「物語を動かす」確報なので、見出しの後に必ず載せる
        const occasionLines = (req.occasions ?? []).map((o) =>
          tpl(this.pick(o.won ? L.occasionWin : L.occasionLoss, rng), {
            occasion: `《${o.name}》`,
          }),
        );
        return [t.newspaper.header, tpl(this.pick(pool, rng), vars), ...occasionLines];
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
      case "biography": {
        const b = t.biography;
        const lines: string[] = [
          b.header,
          tpl(this.pick(b.summary, rng), {
            name: req.name,
            days: req.days,
            deeds: req.deeds,
          }),
        ];
        if (req.origin !== undefined)
          lines.push(tpl(this.pick(b.origin, rng), { origin: req.origin }));
        if (req.work !== undefined)
          lines.push(
            tpl(this.pick(b.work, rng), {
              name: req.work.name,
              quality: req.work.quality,
              tier: req.work.tier,
            }),
          );
        if (req.titles !== undefined && req.titles !== "")
          lines.push(tpl(this.pick(b.titles, rng), { titles: req.titles }));
        if (req.standing !== undefined)
          lines.push(
            tpl(this.pick(b.standing, rng), {
              standing: req.standing,
              profession: req.profession !== undefined ? `職業は${req.profession}だった。` : "",
            }),
          );
        if (req.goals !== undefined && req.goals !== "")
          lines.push(tpl(this.pick(b.goal, rng), { goals: req.goals }));
        if (req.peakSkill !== undefined)
          lines.push(
            tpl(this.pick(b.peak, rng), {
              skill: req.peakSkill.name,
              value: req.peakSkill.value,
            }),
          );
        // 頂点記述（T-41）：事実の行の最後・終わりの行の手前に置く（生涯のクライマックス）
        if (req.pinnacle !== undefined && req.pinnacle !== "")
          lines.push(tpl(this.pick(b.pinnacle, rng), { pinnacle: req.pinnacle }));
        if (req.cause !== undefined) lines.push(this.pick(b.cause[req.cause], rng));
        lines.push(this.pick(b.closing, rng));
        return lines;
      }
    }
  }
}
