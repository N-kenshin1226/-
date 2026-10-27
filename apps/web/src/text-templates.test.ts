/**
 * 置換漏れの回帰テスト（F-06）。「――{name} を倒した。」が生のまま出た不具合の再発防止。
 *
 * 2段構えで見る：
 *  1. コンテンツ走査 —— 表示用 JSON（cli.json・voices・行事・称号・注文…）の全文字列を
 *     実際の tpl と同じ規則で {名前} を埋めて描画し、結果に { や } が残らないことを確認する。
 *     （テンプレート側の typo で生の { が出得る形を拾う）
 *  2. 呼び出し側走査 —— apps/web のソースで `{` を含む t.text.* を tpl() に通さず
 *     使っている箇所を AST で拾う（tpl 抜きの push/描画＝置換漏れの本体）。
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { t, tpl } from "./game.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = HERE;
const CONTENT_DIR = join(HERE, "..", "..", "..", "packages", "content");

/** ディレクトリ以下の対象ファイルを全部拾う */
function walk(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, match));
    else if (match(e.name)) out.push(p);
  }
  return out;
}

/** JSON の葉にある全文字列を（パス付きで）列挙する */
function* leaves(v: unknown, path: string): Generator<[string, string]> {
  if (typeof v === "string") yield [path, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* leaves(x, `${path}[${i}]`);
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) yield* leaves(x, `${path}.${k}`);
  }
}

/** cli.json の text ツリーからドット区切りのパスで葉を引く */
function cliLeaf(dotted: string): unknown {
  const cli = JSON.parse(readFileSync(join(CONTENT_DIR, "text", "cli.json"), "utf8")) as {
    text: Record<string, unknown>;
  };
  return dotted.split(".").reduce<unknown>((a, k) => {
    if (a !== null && typeof a === "object") return (a as Record<string, unknown>)[k];
    return undefined;
  }, cli.text);
}

describe("テキストテンプレートの置換漏れ（F-06）", () => {
  it("表示用コンテンツの全テンプレートが、{名前}を埋めた描画結果に生の波括弧を残さない", () => {
    const jsons = walk(CONTENT_DIR, (n) => n.endsWith(".json")).filter(
      // balance.json は数値定義だけで表示文を持たない
      (p) => !p.endsWith(`${sep}balance.json`),
    );
    const bad: string[] = [];
    for (const file of jsons) {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      for (const [path, s] of leaves(data, "")) {
        if (!s.includes("{") && !s.includes("}")) continue;
        // tpl と同じ規則（{\w+}）で拾った全プレースホルダを埋めて描画する。
        // 残った { } は「{名前}」のような tpl が拾えない typo か、閉じ忘れ
        const vars = Object.fromEntries([...s.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], "◆"]));
        const rendered = tpl(s, vars);
        if (rendered.includes("{") || rendered.includes("}")) {
          bad.push(`${relative(CONTENT_DIR, file)}${path} ⇒ ${rendered}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("ソースで {…} を含む t.text.* は必ず tpl() に通して使う", () => {
    const files = walk(SRC_DIR, (n) => /\.(ts|tsx)$/.test(n)).filter(
      (p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"),
    );
    const bad: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node)) {
          const text = node.getText(sf);
          if (text.startsWith("t.text.")) {
            const leaf = cliLeaf(text.slice("t.text.".length));
            if (typeof leaf === "string" && /[{}]/.test(leaf)) {
              // 文の境界まで親を辿り、tpl(...) の内側にあるか調べる
              let wrapped = false;
              for (
                let p: ts.Node | undefined = node.parent;
                p && !ts.isStatement(p);
                p = p.parent
              ) {
                if (ts.isCallExpression(p) && p.expression.getText(sf) === "tpl") {
                  wrapped = true;
                  break;
                }
              }
              if (!wrapped) {
                const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                bad.push(`${relative(SRC_DIR, file)}:${line + 1}:${character + 1} ${text}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);
    }
    expect(bad).toEqual([]);
  });

  it("戦闘勝利の定型文は敵の名前が差し込まれる（本バグの最小再現）", () => {
    const line = tpl(t.text.combatWon, { name: "狼" });
    expect(line).toBe("――狼 を倒した。");
    expect(line).not.toContain("{");
  });
});
