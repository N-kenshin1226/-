import type { Atom, Canon } from "@trace/content";

/**
 * lore:check（docs/07_story.md §5）— 物語アトムの自動検証。
 * すべて純粋関数：ファイル読み込みは cli.ts 側が行う
 */

export interface Issue {
  file: string;
  level: "error" | "warn";
  message: string;
}

export interface LoreCheckInput {
  canon: Canon;
  /** ファイル名 → パース済みアトム（zod検証済みのものだけ渡す） */
  atoms: { file: string; atom: Atom }[];
}

/** 検査を1回実行し、Issue一覧を返す（error が1つでもあれば不合格） */
export function checkLore({ canon, atoms }: LoreCheckInput): Issue[] {
  const issues: Issue[] = [];
  const canonIdSet = new Set([
    ...canon.events.map((e) => e.id),
    ...canon.places.map((p) => p.id),
    ...canon.figures.map((f) => f.id),
    ...canon.facts.map((f) => f.id),
  ]);
  const factIdSet = new Set(canon.facts.map((f) => f.id));
  const lint = canon.styleLint;

  // ID重複
  const seen = new Map<string, string>();
  for (const { file, atom } of atoms) {
    const prev = seen.get(atom.id);
    if (prev) {
      issues.push({ file, level: "error", message: `id重複: ${atom.id}（${prev} と衝突）` });
    } else {
      seen.set(atom.id, file);
    }
  }

  for (const { file, atom } of atoms) {
    // 参照IDが正史に存在するか
    for (const ref of atom.refs) {
      if (!canonIdSet.has(ref)) {
        issues.push({
          file,
          level: "error",
          message: `参照切れ: refs の ${ref} は canon.json に無い`,
        });
      }
    }
    for (const r of atom.reveals) {
      if (!factIdSet.has(r)) {
        issues.push({
          file,
          level: "error",
          message: `参照切れ: reveals の ${r} は canon.facts に無い`,
        });
      }
    }

    // fact/rumor の一貫性：fact のアトムが推量で話していないか
    if (atom.reliability === "fact") {
      for (const w of lint.factForbidden) {
        if (atom.text.includes(w) || atom.title.includes(w)) {
          issues.push({
            file,
            level: "error",
            message: `fact違反: reliability=fact なのに推量表現「${w}」がある（噂なら rumor にする）`,
          });
        }
      }
    }

    // 文体lint：長さ・禁止語
    if (atom.text.length < lint.minTextLength || atom.text.length > lint.maxTextLength) {
      issues.push({
        file,
        level: "error",
        message: `文体違反: 本文 ${atom.text.length}字（${lint.minTextLength}〜${lint.maxTextLength}字）`,
      });
    }
    for (const w of lint.forbidden) {
      if (atom.text.includes(w) || atom.title.includes(w)) {
        issues.push({ file, level: "error", message: `文体違反: 禁止語「${w}」` });
      }
    }
    // fact アトムで本文が何も明かさないのは形だけ（warn）
    if (atom.reliability === "fact" && atom.reveals.length === 0) {
      issues.push({ file, level: "warn", message: `revealなし: fact なのに明かす事実が無い` });
    }
  }

  // 似文の重複検出（正規化した文字bigramの一致率）
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const sim = similarity(atoms[i]!.atom.text, atoms[j]!.atom.text);
      if (sim >= lint.similarityThreshold) {
        issues.push({
          file: atoms[j]!.file,
          level: "error",
          message: `似文: 「${atoms[i]!.atom.title}」との本文一致率 ${(sim * 100).toFixed(0)}%`,
        });
      }
    }
  }

  // canon 側：報酬の参照整合
  for (const ev of canon.events) {
    if (!ev.reward) continue;
    for (const f of ev.reward.facts) {
      if (!factIdSet.has(f)) {
        issues.push({
          file: "canon.json",
          level: "error",
          message: `報酬の事実 ${f}（${ev.id}）が canon.facts に無い`,
        });
      }
    }
  }
  return issues;
}

/**
 * つながりの到達性（全集チェック、X-40）。
 * 報酬に要る事実は、いずれかのアトムが明かすこと —— どのアトムからも
 * 明かされない事実を要求するつながりは永遠に揃わない。
 * atoms には公開アトムに加え hidden/ のアトムも源として畳み込んで渡す
 * （hidden の頁はゲーム内で読める事実の源なので、到達性の分母に含める）
 */
export function checkLoreReachability({ canon, atoms }: LoreCheckInput): Issue[] {
  const factIds = new Set(canon.facts.map((f) => f.id));
  const revealed = new Set(atoms.flatMap((a) => a.atom.reveals));
  const issues: Issue[] = [];
  for (const ev of canon.events) {
    if (!ev.reward) continue;
    for (const f of ev.reward.facts) {
      // 正史に無い事実への参照切れは checkLore 側の責務（ここでは到達性だけ見る）
      if (factIds.has(f) && !revealed.has(f)) {
        issues.push({
          file: "canon.json",
          level: "error",
          message: `届かない事実: ${f}（${ev.id} のつながり報酬）を明かすアトムが無い`,
        });
      }
    }
  }
  return issues;
}

/** 文字bigramの一致率（Dice係数）。空白・句読点を除去して比較 */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => s.replace(/[\s。、〈〉「」『』（）・ー―…]/g, "");
  const grams = (s: string) => {
    const n = norm(s);
    const set = new Set<string>();
    for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return (2 * hit) / (ga.size + gb.size);
}
